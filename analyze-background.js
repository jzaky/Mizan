// netlify/functions/analyze-background.js
// The -background suffix is what makes this run up to 15 minutes.
// It returns 202 straight away and keeps working. The result goes into Blobs.

import { getStore } from "@netlify/blobs";

const PROMPT = `You are an audit-grade financial statement analyst preparing a working paper.

HARD RULES
- Never invent a figure. Every figure must trace to a specific page in the attached document.
- If something is not in the document, do not estimate it. Mark it escalate.
- Report the audit opinion type exactly as stated.
- Where you derive a number, say what you derived it from.

STATE on every finding:
- "verified": read directly from the document and internally consistent.
- "review": derived, interpreted, or resting on an assumption a person should confirm.
- "escalate": source is ambiguous, contradictory or absent. A named person must decide.

CLASSIFY the entity first, then apply the matching lens.

Public sector (IPSAS, government accrual or cash basis):
budget vs actual variance by line, own-source revenue vs transfers, transfer and subsidy
dependency, receivables ageing and arrears, supplier payment arrears, cash coverage in months
of operating expenditure, contingent liabilities and guarantees, related party transactions
with other government bodies, employee benefit obligations, disclosure completeness.
Never report ROE, EPS or shareholder return metrics for a public sector entity.

Corporate (IFRS):
liquidity, leverage and net debt to EBITDA, interest coverage, margin trend, working capital
cycle, cash conversion, going concern indicators, audit opinion modification, related party
exposure, covenant headroom where disclosed.

Return ONLY valid JSON. No fences, no preamble.

{
 "entity":{"name":"","period":"","currency":"","scale":"","auditOpinion":"","pages":0},
 "classification":{"lens":"public_sector|corporate","basis":"","why":""},
 "balance":{"totalAssets":0,"totalLiabilities":0,"totalNetAssets":0,"ref":""},
 "tieOut":[{"check":"","result":"pass|fail|cannot_verify","detail":"","ref":""}],
 "figures":[{"label":"","value":"","ref":"","state":"verified|review|escalate"}],
 "variance":[{"label":"","budget":0,"actual":0}],
 "findings":[{"state":"","severity":"high|medium|low","title":"","detail":"","metric":"","ref":""}],
 "escalations":[{"title":"","why":"","decisionNeeded":"","ref":""}]
}

Up to 12 findings, 6 escalations, 8 figures, 8 tie-out checks, 8 variance lines.
"variance" empty array unless the entity discloses budget comparison.
"balance" plain numbers in the reporting scale, 0 where not determinable.`;

// USD per million tokens. Sonnet 5 intro pricing runs to 31 Aug 2026, then $3/$15.
const RATE_IN = 2.0;
const RATE_OUT = 10.0;

export default async (req) => {
  const store = getStore("readings");
  let jobId = null;

  const fail = async (error, detail) => {
    if (jobId) {
      try { await store.setJSON(jobId, { status: "error", error, detail: detail || null }); } catch {}
    }
    return new Response("handled", { status: 200 });
  };

  try {
    const body = await req.json();
    jobId = body.jobId;
    const pdf = body.pdf;

    if (!jobId) return new Response("no job id", { status: 400 });
    if (!pdf) return await fail("No document was received by the server.");

    await store.setJSON(jobId, { status: "reading", startedAt: Date.now() });

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return await fail("ANTHROPIC_API_KEY is not set on the server.");

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
            { type: "text", text: PROMPT }
          ]
        }]
      })
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      let msg = "Anthropic returned " + upstream.status;
      try {
        const j = JSON.parse(raw);
        if (j.error?.message) msg = j.error.message;
      } catch {}
      return await fail(msg, raw.slice(0, 400));
    }

    const json = await upstream.json();
    const tin = json.usage?.input_tokens || 0;
    const tout = json.usage?.output_tokens || 0;
    const cost = (tin / 1e6) * RATE_IN + (tout / 1e6) * RATE_OUT;

    const text = (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const a = clean.indexOf("{");
    const b = clean.lastIndexOf("}");
    if (a === -1 || b === -1) {
      return await fail("The reading came back in a shape I could not parse.", clean.slice(0, 400));
    }

    let parsed;
    try {
      parsed = JSON.parse(clean.slice(a, b + 1));
    } catch (e) {
      const hint = json.stop_reason === "max_tokens"
        ? "The reading was cut off at the token limit. Raise max_tokens."
        : String(e.message);
      return await fail("The reading came back incomplete. " + hint, clean.slice(-400));
    }

    await store.setJSON(jobId, {
      status: "done",
      reading: parsed,
      meta: {
        model: json.model,
        stop_reason: json.stop_reason,
        input_tokens: tin,
        output_tokens: tout,
        cost_usd: Number(cost.toFixed(4)),
        rate_card: { input_per_mtok: RATE_IN, output_per_mtok: RATE_OUT }
      }
    });

    return new Response("done", { status: 200 });
  } catch (e) {
    return await fail(String(e.message || e));
  }
};

export const config = { path: "/api/start" };
