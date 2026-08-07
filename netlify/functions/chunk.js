// netlify/functions/chunk.js
//
// Reads ONE slice of a document. Small ask, small answer, so every
// invocation finishes inside the free-tier 10 second ceiling.
// The browser splits the PDF and calls this many times in parallel.
//
// The key lives here. It never reaches the browser.

const RATE_IN = 2.0;   // USD per Mtok. Sonnet 5 intro pricing to 31 Aug 2026.
const RATE_OUT = 10.0; // Reverts to 3.0 / 15.0 after that. Update both here.

const RULES = `You are an audit-grade financial statement analyst preparing a working paper.

HARD RULES
- Never invent a figure. Every figure must trace to a page you can actually see.
- If something is not on these pages, do not estimate it and do not mention it.
- Page numbers must be ABSOLUTE numbers in the full document. The first page you
  are shown is page {OFFSET}. Count up from there.
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

const SHAPE = `Return ONLY valid JSON. No fences, no preamble.

{
 "entity":{"name":"","period":"","currency":"","scale":"","auditOpinion":""},
 "classification":{"lens":"public_sector|corporate","basis":"","why":""},
 "balance":{"totalAssets":0,"totalLiabilities":0,"totalNetAssets":0,"ref":""},
 "tieOut":[{"check":"","result":"pass|fail|cannot_verify","detail":"","ref":""}],
 "figures":[{"label":"","value":"","ref":"","state":"verified|review|escalate","confidence":0,"origin":"stated|derived|narrative","quote":""}],
 "variance":[{"label":"","budget":0,"actual":0}],
 "findings":[{"state":"","severity":"high|medium|low","title":"","detail":"","metric":"","ref":""}],
 "escalations":[{"title":"","why":"","decisionNeeded":"","ref":""}],
 "lineItems":{},
 "mgmtClaims":[{"claim":"","topic":"","ref":""}],
 "sections":[]
}

CONFIDENCE, ORIGIN AND QUOTE on every figure:
- "confidence" is 0-100: how certain you are the number is exactly right.
  Read cleanly off a printed table = 95-100. Derived by simple arithmetic from
  stated numbers = 85-95. Read from narrative prose = 60-85. Anything you had
  to interpret harder scores lower. Never omit it.
- "origin": "stated" (printed as-is), "derived" (you computed it from stated
  figures), or "narrative" (pulled from prose, not a statement table).
- "quote": the exact sentence or table line the figure came from, verbatim,
  max 30 words. This is the evidence a reviewer clicks to see.

MANAGEMENT CLAIMS: if the pages contain narrative where management asserts
something about performance ("record year", "costs well controlled", "strong
liquidity position"), capture up to 3 as mgmtClaims with the verbatim claim,
its topic, and page ref. These get checked against the numbers later. Omit if
these pages have no narrative.

RATIO LINE ITEMS. If any of these appear on THESE pages, add them to "lineItems"
as plain numbers in the statement's own units (thousands stay thousands). Omit any
you do not see. Never estimate. These feed a ratio calculator:
 revenue, priorRevenue, operatingProfit, netProfit, financeCosts, financeIncome,
 ebitda, currentAssets, currentLiabilities, cashAndEquivalents, shortTermDeposits,
 netDebt, operatingCashFlow, sharesOutstanding, marketPrice, dividendPerShare
"priorRevenue" is the comparative prior-year revenue if the statement shows two years.
For Salik-style reclassified statements, operatingProfit is the EBIT / operating profit
subtotal, and ebitda is operating profit plus depreciation and amortisation only if that
figure is stated or explicitly reconciled.

BREVITY IS A HARD REQUIREMENT. Long answers get cut off.
- Omit any key you have nothing for. Do not emit empty arrays or empty strings.
- Only fill "entity", "classification" and "balance" if THESE pages actually show them.
  Leave them out entirely otherwise. Never carry assumptions in from elsewhere.
- Ceilings from this slice: 3 findings, 2 escalations, 4 figures, 3 tie-out checks,
  4 variance lines. Fewer is better. Only what is materially worth an auditor's time.
- "detail" and "why" at most 30 words. "title" at most 10 words.
- Put the most important item first, in case the rest is lost.`;

// Repair JSON cut off mid-object: keep the complete items, close what is still open.
function salvage(s) {
  const a = s.indexOf("{");
  if (a === -1) return null;
  s = s.slice(a);
  let cut = s.lastIndexOf("},");
  if (cut === -1) cut = s.lastIndexOf("}");
  if (cut === -1) return null;
  const head = s.slice(0, cut + 1);
  let inStr = false, esc = false;
  const opens = [];
  for (const c of head) {
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") opens.push(c);
    else if (c === "}" || c === "]") opens.pop();
  }
  const tail = opens.reverse().map((o) => (o === "{" ? "}" : "]")).join("");
  try { return JSON.parse(head + tail); } catch { return null; }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

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
        max_tokens: 4000,
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
    const meta = {
      model: res.model,
      stop_reason: res.stop_reason,
      input_tokens: tin,
      output_tokens: tout,
      cost_usd: Number(((tin / 1e6) * RATE_IN + (tout / 1e6) * RATE_OUT).toFixed(5))
    };

    const text = (res.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const a = clean.indexOf("{");
    const b = clean.lastIndexOf("}");
    if (a !== -1 && b !== -1) {
      try {
        return json({ partial: JSON.parse(clean.slice(a, b + 1)), meta });
      } catch { /* fall through to salvage */ }
    }

    const rescued = salvage(clean);
    if (rescued) return json({ partial: rescued, meta: { ...meta, salvaged: true } });

    return json({
      error: "This slice came back unreadable" +
        (res.stop_reason === "max_tokens" ? " and hit the output cap." : "."),
      meta
    }, 502);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};
