// netlify/functions/evaluate.js
//
// Writes a financial-performance evaluation AFTER the reading is done.
// Input: the entity, the computed ratios, and the key figures already
// extracted. Output: a structured narrative assessment plus management
// considerations. This is ANALYSIS (model judgment), kept separate from
// the arithmetic ratios so the two never blur together in the UI.
//
// The key lives here. It never reaches the browser.

const RATE_IN = 2.0;
const RATE_OUT = 10.0;

const PROMPT = `You are a senior financial analyst writing a performance evaluation for a
company whose financial statements have already been read and whose ratios have
already been calculated by a separate arithmetic engine. You are NOT recomputing
numbers. You are interpreting what they mean.

You will receive: the entity name and basis, the classification (public sector or
corporate), the ratios that were computed (with values), and the key figures found.

Write a balanced, evidence-anchored evaluation. Ground every statement in the numbers
provided. Never invent figures not given to you. Where the data is incomplete, say so
rather than guessing.

TONE AND STANCE
- You assess; you do not certify. This is management analysis, not an audit opinion.
- Recommendations are framed as "considerations for management" grounded in the
  figures, never as directives or guarantees. A government audience is reading this.
- Be specific and quantitative. "Net margin of 50.2% is strong for the sector" beats
  "profitability is good". Cite the actual ratio values you were given.
- Be even-handed: name strengths and concerns both. Do not cheerlead.

Return ONLY valid JSON, no fences, no preamble:

{
 "headline": "one sentence, the single most important takeaway",
 "overall": "2-4 sentences: the overall financial-performance picture, balanced",
 "assessment": [
   {"area":"Profitability|Liquidity|Leverage|Efficiency|Cash flow|Growth",
    "read":"positive|mixed|watch|concern",
    "text":"2-3 sentences citing the specific ratios/figures for this area"}
 ],
 "strengths": ["short specific bullet grounded in a figure", "..."],
 "concerns": ["short specific bullet grounded in a figure", "..."],
 "contradictions": [
   {"claim":"the management statement, verbatim as given to you",
    "evidence":"what the figures actually show, with the specific numbers cited",
    "severity":"high|medium|low",
    "tension":"1-2 sentences on where the claim and the numbers pull apart"}
 ],
 "risk": {"operational":0,"financial":0,"liquidity":0,"accounting":0,
          "confidence":0,
          "note":"one sentence on the overall risk picture"},
 "considerations": [
   {"for":"the area it addresses",
    "text":"a management consideration, framed as an option to weigh, tied to the data"}
 ],
 "dataGaps": ["what was missing that limited this evaluation, if anything"]
}

Up to 6 assessment areas, 5 strengths, 5 concerns, 5 considerations, 4 contradictions.

CONTRADICTIONS: you will receive MANAGEMENT CLAIMS FROM THE NARRATIVE. Test each
against the computed ratios and figures. Only raise a contradiction where the
numbers genuinely strain the claim; agreeing claims are not contradictions and
get no entry. Empty array if nothing conflicts.

RISK: score operational, financial, liquidity and accounting risk 0-5 each
(0 = no evidence of risk, 5 = severe, visible in the numbers). "confidence" is
0-100: how much data you had to work with. Score only from evidence given;
missing data lowers confidence, it does not raise risk.
Keep every string tight. If a whole section has nothing real to say, use an empty array.`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

const LENS_FRAME = {
  investor: "AUDIENCE: an equity investor. Emphasise return on equity, growth runway, margin trend, dividend safety, and valuation-relevant signals. Frame considerations around hold / buy / sell.",
  bank: "AUDIENCE: a lending bank or credit committee. Emphasise debt-service capacity, coverage, leverage, liquidity, covenant headroom, and downside resilience. Frame around lending risk.",
  audit: "AUDIENCE: an external auditor. Emphasise misstatement risk, estimate-heavy and judgemental balances, what to test, and any figure the reading could not verify. Frame around audit risk, not investment merit.",
  cfo: "AUDIENCE: the company CFO. Emphasise operational levers, working capital, cash conversion, and what management can act on next quarter.",
  board: "AUDIENCE: the board of directors. Emphasise strategy, oversight, the decisions in front of the board, and material risks. Keep it high-level.",
  credit: "AUDIENCE: a credit-rating analyst. Give an indicative rating band and the factors that would move it up or down.",
  student: "AUDIENCE: a finance student. Briefly explain what each measure means in plain language before interpreting it."
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "ANTHROPIC_API_KEY is not set on the server." }, 500);

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "The request body could not be read." }, 400);
  }
  if (!payload || !payload.summary) return json({ error: "No analysis summary was provided." }, 400);

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        // Override without a code change: set MIZAN_EVAL_MODEL in Netlify env.
        model: process.env.MIZAN_EVAL_MODEL || "claude-sonnet-5",
        // Sonnet 5 has adaptive thinking ON by default; left on, it eats the
        // token budget and returns an empty body. Off = fast, full JSON output.
        thinking: { type: "disabled" },
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: PROMPT + "\n\n" + (LENS_FRAME[payload.lens] || "AUDIENCE: a general, balanced analyst reader with no particular stakeholder bias.") + "\n\nHERE IS THE ANALYSIS TO EVALUATE:\n\n" + payload.summary
        }]
      })
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      let msg = "Anthropic returned " + upstream.status;
      try { const j = JSON.parse(raw); if (j.error?.message) msg = j.error.message; } catch {}
      return json({ error: msg }, 502);
    }

    const res = await upstream.json();
    const tin = res.usage?.input_tokens || 0;
    const tout = res.usage?.output_tokens || 0;
    const cost = (tin / 1e6) * RATE_IN + (tout / 1e6) * RATE_OUT;

    const text = (res.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const a = clean.indexOf("{");
    const b = clean.lastIndexOf("}");
    if (a === -1 || b === -1) return json({ error: "The evaluation came back unreadable." }, 502);

    let parsed;
    try { parsed = JSON.parse(clean.slice(a, b + 1)); }
    catch { return json({ error: "The evaluation came back incomplete." }, 502); }

    return json({
      evaluation: parsed,
      meta: { model: res.model, input_tokens: tin, output_tokens: tout, cost_usd: Number(cost.toFixed(5)) }
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};
