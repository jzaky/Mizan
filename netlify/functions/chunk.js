// netlify/functions/chunk.js
//
// Reads ONE slice of a document. Small input, small output, so every
// invocation lands well inside the free-tier 10 second ceiling.
// The browser splits the PDF and calls this many times in parallel.
//
// The key lives here. It never reaches the browser.

const RATE_IN = 2.0;   // USD per Mtok. Sonnet 5 intro pricing to 31 Aug 2026.
const RATE_OUT = 10.0; // Reverts to 3.0 / 15.0 after that. Update both here.

const RULES = `You are an audit-grade financial statement analyst preparing a working paper.

HARD RULES
- Never invent a figure. Every figure must trace to a page you can actually see.
- If something is not on these pages, do not estimate it and do not mention it.
- Page numbers you cite must be ABSOLUTE numbers in the full document. The first
  page you are shown is page {OFFSET}. Count up from there.
- Where you derive a number, say what you derived it from.
- Report the audit opinion type exactly as stated.

STATE on every finding:
- "verified": read directly off the page and internally consistent.
- "review": derived, interpreted, or resting on an assumption a person should confirm.
- "escalate": ambiguous, contradictory, or referenced but never quantified.

LENS
Public sector (IPSAS, government accrual or cash basis): budget vs actual variance,
own-source revenue vs transfers, transfer dependency, receivables ageing and arrears,
supplier payment arrears, cash coverage in months of operating expenditure, contingent
liabilities and guarantees, related party transactions with other government bodies,
employee benefit obligations, disclosure completeness. NEVER report ROE, EPS or any
shareholder return metric for a public sector entity.

Corporate (IFRS): liquidity, leverage, net debt to EBITDA, interest coverage, margin
trend, working capital cycle, cash conversion, going concern indicators, audit opinion
modification, related party exposure, covenant headroom where disclosed.`;

const SHAPE = `Return ONLY valid JSON. No fences, no preamble. Omit any array you have nothing for.

{
 "entity":{"name":"","period":"","currency":"","scale":"","auditOpinion":""},
 "classification":{"lens":"public_sector|corporate","basis":"","why":""},
 "balance":{"totalAssets":0,"totalLiabilities":0,"totalNetAssets":0,"ref":""},
 "tieOut":[{"check":"","result":"pass|fail|cannot_verify","detail":"","ref":""}],
 "figures":[{"label":"","value":"","ref":"","state":"verified|review|escalate"}],
 "variance":[{"label":"","budget":0,"actual":0}],
 "findings":[{"state":"","severity":"high|medium|low","title":"","detail":"","metric":"","ref":""}],
 "escalations":[{"title":"","why":"","decisionNeeded":"","ref":""}]
}

Only fill "entity", "classification" and "balance" if THESE pages actually show them.
Leave them out entirely otherwise. Do not carry over assumptions from elsewhere.
At most 4 findings, 2 escalations, 4 figures, 3 tie-out checks, 4 variance lines from
this slice. Report only what is materially worth an auditor's attention. Be terse.`;

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "ANTHROPIC_API_KEY is not set on the server." }, 500);

  let pdf, offset, total;
  try {
    const body = await req.json();
    pdf = body.pdf;
    offset = Number(body.offset) || 1;
    total = Number(body.total) || 0;
  } catch {
    return json({ error: "The request body could not be read." }, 400);
  }
  if (!pdf) return json({ error: "No document slice was received." }, 400);

  const prompt =
    RULES.replace("{OFFSET}", String(offset)) +
    "\n\nYou are seeing pages " + offset + " onward of a " +
    (total ? total + " page" : "longer") + " document.\n\n" + SHAPE;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1600,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
            { type: "text", text: prompt }
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
      return json({ error: msg }, 502);
    }

    const res = await upstream.json();
    const tin = res.usage?.input_tokens || 0;
    const tout = res.usage?.output_tokens || 0;

    const text = (res.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const a = clean.indexOf("{");
    const b = clean.lastIndexOf("}");
    if (a === -1 || b === -1) return json({ error: "This slice came back unreadable." }, 502);

    let parsed;
    try {
      parsed = JSON.parse(clean.slice(a, b + 1));
    } catch {
      // A slice cut off mid-object is survivable. Report it and let the rest proceed.
      return json({ error: "This slice came back incomplete.", truncated: true }, 502);
    }

    return json({
      partial: parsed,
      meta: {
        model: res.model,
        stop_reason: res.stop_reason,
        input_tokens: tin,
        output_tokens: tout,
        cost_usd: Number(((tin / 1e6) * RATE_IN + (tout / 1e6) * RATE_OUT).toFixed(5))
      }
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
