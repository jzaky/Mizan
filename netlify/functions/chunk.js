// netlify/functions/chunk.js
//
// Reads ONE slice of a document and returns evidence, not analysis.
// The browser splits the PDF and calls this many times in parallel.
// The API key lives here. It never reaches the browser.

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

RATIO LINE ITEMS. If any of these appear on THESE pages, add them to "lineItems"
as plain numbers in the statement's own units (thousands stay thousands). Omit any
you do not see. Never estimate. These feed a ratio calculator:
 revenue, priorRevenue, costOfSales, grossProfit, operatingProfit, netProfit,
 priorNetProfit, financeCosts, financeIncome, ebitda, totalAssets, priorTotalAssets,
 totalLiabilities, totalEquity, currentAssets, currentLiabilities, inventory,
 tradeReceivables, tradePayables, fixedAssets, cashAndEquivalents, shortTermDeposits,
 netDebt, operatingCashFlow, capex, dividendsPaid, sharesOutstanding, marketPrice,
 dividendPerShare

BALANCE SHEET SUBTOTALS ARE MANDATORY. When the statement of financial position is on
these pages, you MUST capture its printed FACE subtotals into lineItems, even if you
capture nothing else on the page:
  "Total current assets" -> currentAssets
  "Total current liabilities" -> currentLiabilities
  "Total assets" -> totalAssets
  "Total equity" (or "Total net assets") -> totalEquity
Capture the PRINTED subtotal exactly as shown. Never add up the components yourself;
a computed subtotal is not allowed here. These face subtotals take priority over the
note-level pieces.

PROVIDED RATIOS. If the document itself prints a ratios table, KPI summary, or
five-year financial highlights with ratios, capture each stated ratio as a figure
(label, its value, the page), origin "stated". Do not recompute it; record what the
document reports.

"priorRevenue" is the comparative prior-year revenue if the statement shows two years.
For reclassified statements, operatingProfit is the EBIT subtotal, and ebitda is
operating profit plus depreciation and amortisation only if stated or reconciled.

CONFIDENCE, ORIGIN AND QUOTE on every figure:
- "confidence" is 0-100: how certain you are the number is exactly right. Read
  cleanly off a printed table = 95-100. Derived by simple arithmetic from stated
  numbers = 85-95. Read from narrative prose = 60-85. Never omit it.
- "origin": "stated" (printed as-is), "derived" (computed from stated figures),
  or "narrative" (pulled from prose rather than a statement table).
- "quote": the exact clause the figure came from, verbatim.

MANAGEMENT CLAIMS: if the pages contain narrative where management asserts something
about performance ("record year", "costs well controlled", "strong liquidity"),
capture up to 3 as mgmtClaims with the verbatim claim, its topic, and page ref.
Omit if these pages have no such narrative.

SECTIONS: for each financial statement visible on these pages, add an entry to
"sections" as {"kind":"income_statement|balance_sheet|cash_flow|equity_statement|notes|auditor_report","pages":"p.11"}.

INGESTION IS EVIDENCE, NOT PROSE. This pass captures facts; the analysis is
written later from what you capture. Output length is the slow part of a read,
so the constraint is on language, never on evidence.

CAPTURE EVERYTHING MATERIAL. Do not stop at a fixed count. If these pages hold
eight material figures, four unusual transactions and three inconsistencies,
record all fifteen. Omitting evidence to stay brief is the one failure this
tool cannot have.

CONSTRAIN THE LANGUAGE, NOT THE COUNT.
- "detail" and "why": at most 15 words. State the fact, not its significance.
  Write "Finance costs 313,146 vs 256,824 prior" and stop. Do not add
  "which suggests rising leverage" - that belongs to the analysis stage.
- "title": at most 8 words.
- "quote": the clause carrying the number, at most 15 words.
- Never restate the label inside the value, or the value inside the detail.
- No preamble, no framing, no "it is worth noting".

PREFER A LINE ITEM OVER A FINDING. Line items are compact and feed the ratio
engine directly. A number captured in lineItems is worth more than the same
number described in a sentence.

EVERY ITEM KEEPS ITS SOURCE. A figure or finding without a page reference is
unusable downstream, so the ref is never the thing you drop for brevity.

DO NOT INFER WHEN EXTRACTING. Capture what the source states. Do not calculate
ratios, growth, trends, causes, implications, or conclusions in this pass.
Those are generated downstream from verified evidence.

IF THESE PAGES HOLD NO MATERIAL EVIDENCE, RETURN ALMOST NOTHING. Boilerplate
policy text warrants an empty response, not a description of the boilerplate.
Material disclosures, qualifications, contingencies, accounting policies, or
other non-numeric evidence must still be captured with their source page.

Omit any key you have nothing for. Do not emit empty arrays or empty strings.
Only fill "entity", "classification" and "balance" if THESE pages actually show
them. Leave them out entirely otherwise. Never carry assumptions in from elsewhere.
In every "value" string, NEVER abbreviate scale: write "thousand", "million",
"billion" as full words or plain digits. Never "Tn" alone - it is ambiguous
between thousand and trillion and is banned outright.`;

// Repair JSON cut off mid-object: keep the complete items, close what is open.
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
        // Override without a code change: set MIZAN_READ_MODEL in Netlify env.
        model: process.env.MIZAN_READ_MODEL || "claude-sonnet-5",
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
