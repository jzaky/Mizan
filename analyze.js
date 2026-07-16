// netlify/functions/analyze.js
// The API key lives here. It never reaches the browser.

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

// Rates in USD per million tokens.
// Sonnet 5 is on introductory pricing ($2/$10) through 31 Aug 2026.
// It reverts to $3/$15 after that. Update these two numbers on the day.
const RATE_IN = 2.0;
const RATE_OUT = 10.0;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST." }), { status: 405 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not set on the server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { pdf } = await req.json();
    if (!pdf) {
      return new Response(JSON.stringify({ error: "No document received." }), { status: 400 });
    }

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
      const body = await upstream.text();
      return new Response(
        JSON.stringify({ error: "Upstream " + upstream.status, detail: body.slice(0, 400) }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
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
      return new Response(JSON.stringify({ error: "The reading came back unparseable." }), { status: 502 });
    }

    const parsed = JSON.parse(clean.slice(a, b + 1));

    return new Response(
      JSON.stringify({
        reading: parsed,
        meta: {
          model: json.model,
          stop_reason: json.stop_reason,
          input_tokens: tin,
          output_tokens: tout,
          cost_usd: Number(cost.toFixed(4)),
          rate_card: { input_per_mtok: RATE_IN, output_per_mtok: RATE_OUT }
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e.message || e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = { path: "/api/analyze" };
