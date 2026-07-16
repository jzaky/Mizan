fimport React, { useState, useRef, useCallback } from "react";

const VERSION = "0.9.0";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.mz *{box-sizing:border-box;margin:0;padding:0}
.mz{--paper:#F2F4EF;--bar:#E2EAE1;--ink:#17281F;--ink-soft:#55665C;--rule:#C3CFC4;--tick:#146B3A;--query:#A85D00;--esc:#A8202B;--forest:#1B4D3E;
background:var(--paper);color:var(--ink);font-family:'IBM Plex Sans',system-ui,sans-serif;min-height:100vh;padding:0 0 4rem;line-height:1.5}
.mz-wrap{max-width:940px;margin:0 auto;padding:0 1.1rem}
.mz-head{border-bottom:2px solid var(--ink);padding:2.2rem 0 1rem;display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.mz-mark{font-family:'Instrument Serif',Georgia,serif;font-size:clamp(2.6rem,8vw,3.9rem);line-height:.9;letter-spacing:-.015em}
.mz-mark span{font-size:.42em;color:var(--ink-soft);margin-left:.5rem}
.mz-sub{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);margin-top:.55rem}
.mz-thesis{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:1rem;color:var(--forest);text-align:right;max-width:15rem;line-height:1.35}
.mz-intake{border:1px solid var(--rule);border-top:none;background:#fff;padding:1.4rem 1.2rem;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
.mz-btn{font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;font-weight:500;padding:.68rem 1.05rem;border:1px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;transition:background .12s}
.mz-btn:hover:not(:disabled){background:var(--forest);border-color:var(--forest)}
.mz-btn:disabled{opacity:.4;cursor:default}
.mz-btn.ghost{background:transparent;color:var(--ink)}
.mz-btn.ghost:hover:not(:disabled){background:var(--bar)}
.mz-btn:focus-visible,.mz-in:focus-visible{outline:2px solid var(--forest);outline-offset:2px}
.mz-in{font-family:'IBM Plex Mono',monospace;font-size:.72rem;padding:.62rem .7rem;border:1px solid var(--rule);background:#fff;color:var(--ink);min-width:12rem}
.mz-hint{font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:var(--ink-soft);margin-left:auto}
.mz-sec{margin-top:2.2rem}
.mz-sec-head{display:flex;align-items:baseline;gap:.7rem;border-bottom:1px solid var(--ink);padding-bottom:.35rem}
.mz-sec-title{font-family:'IBM Plex Mono',monospace;font-size:.7rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
.mz-sec-note{font-size:.72rem;color:var(--ink-soft);margin-left:auto;font-family:'IBM Plex Mono',monospace}
.mz-class{background:var(--forest);color:var(--paper);padding:1rem 1.15rem;display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center}
.mz-class-lens{font-family:'Instrument Serif',Georgia,serif;font-size:1.5rem;line-height:1.1}
.mz-class-why{font-size:.78rem;opacity:.82;max-width:34rem;line-height:1.45}
.mz-class-meta{font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;opacity:.7;margin-bottom:.2rem}
.mz-row{display:grid;grid-template-columns:2.4rem 1fr 7.5rem;border-bottom:1px solid var(--rule);background:#fff;align-items:start}
.mz-row:nth-child(even){background:var(--bar)}
.mz-row.landed{animation:mzLand .34s ease-out both}
@keyframes mzLand{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.mz-tick{border-right:1px solid var(--rule);padding:.72rem 0;text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.95rem;font-weight:600;align-self:stretch}
.mz-tick.verified{color:var(--tick)}.mz-tick.review{color:var(--query)}.mz-tick.escalate{color:var(--esc)}
.mz-body{padding:.7rem .9rem;min-width:0}
.mz-title{font-size:.9rem;font-weight:600;line-height:1.35}
.mz-detail{font-size:.8rem;color:var(--ink-soft);margin-top:.22rem;line-height:1.45}
.mz-metric{font-family:'IBM Plex Mono',monospace;font-size:.78rem;font-weight:600;color:var(--forest);margin-top:.3rem;font-variant-numeric:tabular-nums}
.mz-ref{padding:.75rem .9rem .75rem .4rem;font-family:'IBM Plex Mono',monospace;font-size:.66rem;color:var(--ink-soft);text-align:right;line-height:1.4;border-left:1px dashed var(--rule);align-self:stretch;word-break:break-word}
.mz-sev{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:.56rem;letter-spacing:.1em;text-transform:uppercase;padding:.1rem .35rem;border:1px solid currentColor;margin-left:.45rem;vertical-align:.12em}
.mz-sev.high{color:var(--esc)}.mz-sev.medium{color:var(--query)}.mz-sev.low{color:var(--ink-soft)}
.mz-arith{border:1px solid var(--ink);border-top:none;background:#fff}
.mz-arith-strip{background:var(--ink);color:var(--paper);padding:.5rem .9rem;font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.11em;text-transform:uppercase;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.mz-eq{padding:1.1rem .9rem;font-family:'IBM Plex Mono',monospace;font-size:.8rem;font-variant-numeric:tabular-nums;line-height:2;overflow-x:auto}
.mz-eq-line{display:flex;gap:.55rem;align-items:baseline;white-space:nowrap}
.mz-eq-lbl{color:var(--ink-soft);min-width:11.5rem}
.mz-eq-val{font-weight:600;margin-left:auto}
.mz-eq-rule{border-top:1px solid var(--ink);margin:.45rem 0}
.mz-verdict{padding:.85rem .9rem;border-top:1px solid var(--rule);font-family:'IBM Plex Mono',monospace;font-size:.74rem;line-height:1.5}
.mz-verdict.pass{color:var(--tick);background:rgba(20,107,58,.05)}
.mz-verdict.fail{color:var(--esc);background:rgba(168,32,43,.05)}
.mz-var-row{display:grid;grid-template-columns:1fr 4.6rem;gap:.8rem;align-items:center;padding:.6rem .9rem;border-bottom:1px solid var(--rule);background:#fff}
.mz-var-row:nth-child(even){background:var(--bar)}
.mz-var-lbl{font-size:.8rem}
.mz-var-track{height:5px;background:var(--rule);margin-top:.35rem}
.mz-var-fill{height:100%;background:var(--forest)}
.mz-var-fill.under{background:var(--query)}
.mz-var-pct{font-family:'IBM Plex Mono',monospace;font-size:.76rem;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.mz-figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))}
.mz-fig{border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);background:#fff;padding:.85rem .9rem;border-left:3px solid transparent}
.mz-fig.verified{border-left-color:var(--tick)}.mz-fig.review{border-left-color:var(--query)}.mz-fig.escalate{border-left-color:var(--esc)}
.mz-fig-lbl{font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-soft)}
.mz-fig-val{font-family:'IBM Plex Mono',monospace;font-size:1.15rem;font-weight:600;margin-top:.28rem;font-variant-numeric:tabular-nums}
.mz-fig-ref{font-family:'IBM Plex Mono',monospace;font-size:.6rem;color:var(--ink-soft);margin-top:.3rem;line-height:1.35}
.mz-esc-card{border:1px solid var(--esc);border-left-width:3px;background:#fff;padding:1rem 1.05rem;margin-top:.7rem}
.mz-esc-t{font-size:.9rem;font-weight:600;color:var(--esc)}
.mz-esc-w{font-size:.8rem;color:var(--ink-soft);margin-top:.35rem;line-height:1.5}
.mz-esc-d{font-size:.82rem;margin-top:.6rem;padding-top:.6rem;border-top:1px dashed var(--rule);line-height:1.5}
.mz-esc-d b{font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.09em;text-transform:uppercase;color:var(--esc);display:block;margin-bottom:.2rem}
.mz-owner{margin-top:.7rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.mz-owner label{font-family:'IBM Plex Mono',monospace;font-size:.58rem;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-soft)}
.mz-legend{display:flex;gap:1.4rem;flex-wrap:wrap;padding:.75rem .9rem;border:1px solid var(--rule);border-top:none;background:var(--bar);font-family:'IBM Plex Mono',monospace;font-size:.63rem;color:var(--ink-soft)}
.mz-legend b{font-size:.85rem;margin-right:.3rem}
.mz-ev{border:1px solid var(--rule);border-top:none;background:#fff;padding:1rem .9rem;font-family:'IBM Plex Mono',monospace;font-size:.66rem;color:var(--ink-soft);line-height:1.9;word-break:break-all}
.mz-ev b{color:var(--ink)}
.mz-load{padding:3.2rem 1rem;text-align:center}
.mz-load-t{font-family:'Instrument Serif',Georgia,serif;font-size:1.5rem;color:var(--forest)}
.mz-load-s{font-family:'IBM Plex Mono',monospace;font-size:.65rem;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-soft);margin-top:.6rem}
.mz-scan{height:2px;background:var(--rule);margin:1.6rem auto 0;max-width:17rem;overflow:hidden;position:relative}
.mz-scan::after{content:'';position:absolute;inset:0;width:38%;background:var(--forest);animation:mzScan 1.05s ease-in-out infinite}
@keyframes mzScan{0%{left:-38%}100%{left:100%}}
.mz-err{border:1px solid var(--esc);border-left-width:3px;background:#fff;padding:1rem 1.05rem;margin-top:1rem}
.mz-err-t{font-family:'IBM Plex Mono',monospace;font-size:.65rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--esc)}
.mz-err-b{font-size:.83rem;margin-top:.4rem;line-height:1.5}
.mz-empty{padding:3.4rem 1rem;text-align:center;border:1px solid var(--rule);border-top:none;background:#fff}
.mz-empty-t{font-family:'Instrument Serif',Georgia,serif;font-size:1.35rem;color:var(--ink-soft);font-style:italic}
.mz-empty-s{font-size:.83rem;color:var(--ink-soft);margin-top:.5rem}
.mz-foot{margin-top:3rem;border-top:2px solid var(--ink);padding-top:1rem;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-family:'IBM Plex Mono',monospace;font-size:.63rem;color:var(--ink-soft);line-height:1.7}
.mz-foot b{color:var(--ink)}
@media(max-width:620px){
.mz-row{grid-template-columns:2.1rem 1fr}
.mz-ref{grid-column:2;border-left:none;text-align:left;padding:.5rem .9rem .7rem;border-top:1px dashed var(--rule)}
.mz-thesis{text-align:left;max-width:none}.mz-eq-lbl{min-width:8.5rem}.mz-hint{margin-left:0;width:100%}}
@media(prefers-reduced-motion:reduce){.mz-row.landed{animation:none}.mz-scan::after{animation:none;width:100%}}
@media print{
.mz{background:#fff;padding:0}
.mz-intake,.mz-btn,.mz-scan,.mz-thesis{display:none!important}
.mz-row,.mz-fig,.mz-esc-card,.mz-arith{break-inside:avoid;page-break-inside:avoid}
.mz-sec{margin-top:1.2rem}
.mz-class{background:#fff;color:var(--ink);border:1px solid var(--ink)}
.mz-arith-strip{background:#fff;color:var(--ink);border-bottom:1px solid var(--ink)}
.mz-foot{page-break-inside:avoid}
}
`;

const MARK = { verified: "\u2713", review: "?", escalate: "\u2717" };

export default function App() {
  const [state, setState] = useState("idle");
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [file, setFile] = useState(null);
  const [owners, setOwners] = useState({});
  const [operator, setOperator] = useState("");
  const [progress, setProgress] = useState("");
  const inputRef = useRef(null);

  const fmt = (n) => (typeof n === "number" && isFinite(n) ? n.toLocaleString("en-US") : String(n ?? ""));

  const sha256 = async (buf) => {
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // Arithmetic. Runs here. Not a model output.
  const checkBalance = (b) => {
    if (!b || !b.totalAssets) return null;
    const rhs = (b.totalLiabilities || 0) + (b.totalNetAssets || 0);
    const delta = b.totalAssets - rhs;
    return { rhs, delta, ok: Math.abs(delta) < 0.5 };
  };

  const run = useCallback(async (f) => {
    setState("working"); setErr(""); setData(null); setProgress("Preparing the document");
    try {
      const buf = await f.arrayBuffer();
      const hash = await sha256(buf);
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 8192) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      const b64 = btoa(bin);

      const jobId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();

      setProgress("Sending it over");
const kick = await fetch("/.netlify/functions/analyze-background", {
  method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf: b64, jobId })
      });
      if (kick.status >= 400) {
        throw new Error("The reading would not start. Netlify said " + kick.status + ".");
      }

      const began = Date.now();
      const LIMIT = 10 * 60 * 1000;
      let rec = null;

      while (Date.now() - began < LIMIT) {
        await new Promise((r) => setTimeout(r, 3000));
        const secs = Math.round((Date.now() - began) / 1000);

        let poll;
        try {
poll = await (await fetch("/.netlify/functions/result?id=" + jobId, { cache: "no-store" })).json();
        } catch {
          setProgress("Reading, " + secs + "s");
          continue;
        }

        if (poll.status === "done") { rec = poll; break; }
        if (poll.status === "error") {
          throw new Error([poll.error, poll.detail].filter(Boolean).join(" \u00b7 "));
        }
        setProgress("Reading, " + secs + "s");
      }

      if (!rec) throw new Error("Still reading after 10 minutes. Abandoned.");

      setData(rec.reading);
      setMeta({ ...rec.meta, hash, name: f.name, size: f.size, at: new Date().toISOString() });
      setOwners({});
      setState("done");
    } catch (e) {
      setErr(e.message || "Something went wrong reading this document.");
      setState("error");
    }
  }, []);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); run(f); e.target.value = "";
  };

  const bal = data ? checkBalance(data.balance) : null;

  // The evidence record. This is the artifact an auditor keeps.
  const evidence = () => {
    if (!data || !meta) return null;
    const counts = { verified: 0, review: 0, escalate: 0 };
    (data.findings || []).forEach((f) => { if (counts[f.state] !== undefined) counts[f.state]++; });
    return {
      record_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      generated_at: meta.at,
      operator: operator || "UNRECORDED",
      document: { file_name: meta.name, bytes: meta.size, sha256: meta.hash },
      system: { tool: "Mizan", version: VERSION, model: meta.model, stop_reason: meta.stop_reason },
      cost_of_reading: {
        input_tokens: meta.input_tokens,
        output_tokens: meta.output_tokens,
        usd: meta.cost_usd,
        rate_card: meta.rate_card
      },
      classification: {
        lens: data.classification?.lens,
        basis: data.classification?.basis,
        rationale: data.classification?.why
      },
      deterministic_checks: [
        bal && {
          check: "assets = liabilities + net assets",
          computed_by: "client arithmetic",
          result: bal.ok ? "pass" : "fail",
          difference: bal.delta
        }
      ].filter(Boolean),
      determinations: counts,
      escalations: (data.escalations || []).map((e, i) => ({
        item: e.title,
        decision_needed: e.decisionNeeded,
        source: e.ref,
        accountable_owner: owners[i] || "UNASSIGNED",
        decision: "PENDING"
      })),
      note: "Figures are read from the source document. This record is not an opinion on the accounts."
    };
  };

  const downloadEvidence = () => {
    const rec = evidence(); if (!rec) return;
    const blob = new Blob([JSON.stringify(rec, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mizan-evidence-" + (meta?.hash || "").slice(0, 12) + ".json";
    a.click(); URL.revokeObjectURL(a.href);
  };

  const unassigned = (data?.escalations || []).some((_, i) => !owners[i]);

  return (
    <div className="mz">
      <style>{CSS}</style>
      <div className="mz-wrap">

        <header className="mz-head">
          <div>
            <div className="mz-mark">Mizan<span>ميزان</span></div>
            <div className="mz-sub">Financial statement analysis that shows its work</div>
          </div>
          <p className="mz-thesis">Autonomous when it is certain. Accountable when it is not.</p>
        </header>

        <div className="mz-intake">
          <input ref={inputRef} type="file" accept="application/pdf" onChange={onPick} style={{ display: "none" }} />
          <button className="mz-btn" disabled={state === "working"} onClick={() => inputRef.current?.click()}>
            Read a statements PDF
          </button>
          <input
            className="mz-in" placeholder="Your name, for the record"
            value={operator} onChange={(e) => setOperator(e.target.value)}
            aria-label="Operator name"
          />
          {state === "done" && (
            <>
              <button className="mz-btn ghost" onClick={() => window.print()}>Print working paper</button>
              <button className="mz-btn ghost" onClick={downloadEvidence}>Evidence record</button>
            </>
          )}
          {file && state === "done" && <span className="mz-hint">{file.name}</span>}
        </div>

        {state === "idle" && (
          <div className="mz-empty">
            <p className="mz-empty-t">No document read yet.</p>
            <p className="mz-empty-s">Load a set of financial statements as a PDF.</p>
          </div>
        )}

        {state === "working" && (
          <div className="mz-load">
            <p className="mz-load-t">Reading the statements</p>
            <p className="mz-load-s">{progress || "Extracting figures and locating sources"}</p>
            <div className="mz-scan" />
          </div>
        )}

        {state === "error" && (
          <div className="mz-err">
            <p className="mz-err-t">Reading stopped</p>
            <p className="mz-err-b">{err}</p>
          </div>
        )}

        {state === "done" && data && (
          <>
            <div className="mz-class">
              <div>
                <div className="mz-class-meta">Lens applied</div>
                <div className="mz-class-lens">
                  {data.classification?.lens === "public_sector" ? "Public sector entity" : "Corporate entity"}
                </div>
                <div className="mz-class-meta" style={{ marginTop: ".4rem", marginBottom: 0 }}>
                  {data.classification?.basis} · {data.entity?.name} · {data.entity?.period}
                </div>
              </div>
              <p className="mz-class-why">{data.classification?.why}</p>
            </div>

            {data.entity?.auditOpinion && (
              <section className="mz-sec">
                <div className="mz-sec-head">
                  <h2 className="mz-sec-title">Audit opinion</h2>
                  <span className="mz-sec-note">as stated</span>
                </div>
                <div className="mz-row landed">
                  <div className="mz-tick verified">{MARK.verified}</div>
                  <div className="mz-body"><p className="mz-title">{data.entity.auditOpinion}</p></div>
                  <div className="mz-ref">Auditor's report</div>
                </div>
              </section>
            )}

            {bal && (
              <section className="mz-sec">
                <div className="mz-sec-head">
                  <h2 className="mz-sec-title">Does it balance</h2>
                  <span className="mz-sec-note">arithmetic, not a model</span>
                </div>
                <div className="mz-arith">
                  <div className="mz-arith-strip">
                    <span>Computed in this browser</span>
                    <span>{data.entity?.currency} {data.entity?.scale}</span>
                  </div>
                  <div className="mz-eq">
                    <div className="mz-eq-line"><span className="mz-eq-lbl">Total assets</span><span className="mz-eq-val">{fmt(data.balance.totalAssets)}</span></div>
                    <div className="mz-eq-line"><span className="mz-eq-lbl">Total liabilities</span><span className="mz-eq-val">{fmt(data.balance.totalLiabilities)}</span></div>
                    <div className="mz-eq-line">
                      <span className="mz-eq-lbl">{data.classification?.lens === "public_sector" ? "Net assets" : "Total equity"}</span>
                      <span className="mz-eq-val">{fmt(data.balance.totalNetAssets)}</span>
                    </div>
                    <div className="mz-eq-rule" />
                    <div className="mz-eq-line">
                      <span className="mz-eq-lbl">Difference</span>
                      <span className="mz-eq-val" style={{ color: bal.ok ? "var(--tick)" : "var(--esc)" }}>{fmt(bal.delta)}</span>
                    </div>
                  </div>
                  <div className={"mz-verdict " + (bal.ok ? "pass" : "fail")}>
                    {bal.ok
                      ? MARK.verified + "  Assets equal liabilities plus net assets. Nothing here rests on judgement."
                      : MARK.escalate + "  Off by " + fmt(Math.abs(bal.delta)) + ". Reported as-is. No figure on this page should be relied on until a person finds the cause."}
                  </div>
                </div>
              </section>
            )}

            {data.tieOut?.length > 0 && (
              <section className="mz-sec">
                <div className="mz-sec-head">
                  <h2 className="mz-sec-title">Tie-out</h2>
                  <span className="mz-sec-note">{data.tieOut.length} checks</span>
                </div>
                {data.tieOut.map((t, i) => {
                  const st = t.result === "pass" ? "verified" : t.result === "fail" ? "escalate" : "review";
                  return (
                    <div key={i} className="mz-row landed" style={{ animationDelay: i * 70 + "ms" }}>
                      <div className={"mz-tick " + st}>{MARK[st]}</div>
                      <div className="mz-body"><p className="mz-title">{t.check}</p><p className="mz-detail">{t.detail}</p></div>
                      <div className="mz-ref">{t.ref}</div>
                    </div>
                  );
                })}
              </section>
            )}

            {data.figures?.length > 0 && (
              <section className="mz-sec">
                <div className="mz-sec-head">
                  <h2 className="mz-sec-title">Figures</h2>
                  <span className="mz-sec-note">every one carries its source</span>
                </div>
                <div className="mz-figs">
                  {data.figures.map((f, i) => (
                    <div key={i} className={"mz-fig " + (f.state || "review")}>
                      <div className="mz-fig-lbl">{f.label}</div>
                      <div className="mz-fig-val">{f.value}</div>
                      <div className="mz-fig-ref">{f.ref}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.variance?.length > 0 && (
              <section className="mz-sec">
                <div className="mz-sec-head">
                  <h2 className="mz-sec-title">Budget against actual</h2>
                  <span className="mz-sec-note">bar shows spend against approved</span>
                </div>
                {data.variance.map((v, i) => {
                  const pct = v.budget ? (v.actual / v.budget) * 100 : 0;
                  const under = pct < 90;
                  return (
                    <div key={i} className="mz-var-row">
                      <div>
                        <div className="mz-var-lbl">{v.label}</div>
                        <div className="mz-var-track">
                          <div className={"mz-var-fill" + (under ? " under" : "")} style={{ width: Math.min(pct, 100) + "%" }} />
                        </div>
                      </div>
                      <div className="mz-var-pct" style={{ color: under ? "var(--query)" : "var(--ink)" }}>{pct.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </section>
            )}

            {data.findings?.length > 0 && (
              <section className="mz-sec">
                <div className="mz-sec-head">
                  <h2 className="mz-sec-title">Findings</h2>
                  <span className="mz-sec-note">read the tick column first</span>
                </div>
                {data.findings.map((f, i) => (
                  <div key={i} className="mz-row landed" style={{ animationDelay: i * 70 + "ms" }}>
                    <div className={"mz-tick " + (f.state || "review")}>{MARK[f.state] || "?"}</div>
                    <div className="mz-body">
                      <p className="mz-title">{f.title}{f.severity && <span className={"mz-sev " + f.severity}>{f.severity}</span>}</p>
                      <p className="mz-detail">{f.detail}</p>
                      {f.metric && <p className="mz-metric">{f.metric}</p>}
                    </div>
                    <div className="mz-ref">{f.ref}</div>
                  </div>
                ))}
                <div className="mz-legend">
                  <span><b style={{ color: "var(--tick)" }}>{MARK.verified}</b> read from the document</span>
                  <span><b style={{ color: "var(--query)" }}>{MARK.review}</b> derived, confirm it</span>
                  <span><b style={{ color: "var(--esc)" }}>{MARK.escalate}</b> a person decides</span>
                </div>
              </section>
            )}

            {data.escalations?.length > 0 && (
              <section className="mz-sec">
                <div className="mz-sec-head">
                  <h2 className="mz-sec-title">Held for a person</h2>
                  <span className="mz-sec-note">{unassigned ? "owner not yet named" : "owners named"}</span>
                </div>
                {data.escalations.map((e, i) => (
                  <div key={i} className="mz-esc-card">
                    <p className="mz-esc-t">{e.title}</p>
                    <p className="mz-esc-w">{e.why}</p>
                    <div className="mz-esc-d">
                      <b>Decision needed</b>
                      {e.decisionNeeded}
                      <div className="mz-owner">
                        <label htmlFor={"own" + i}>Accountable owner</label>
                        <input
                          id={"own" + i} className="mz-in" placeholder="Name the person"
                          value={owners[i] || ""}
                          onChange={(ev) => setOwners({ ...owners, [i]: ev.target.value })}
                        />
                      </div>
                      <span style={{ display: "block", marginTop: ".5rem", fontFamily: "'IBM Plex Mono',monospace", fontSize: ".63rem", color: "var(--ink-soft)" }}>{e.ref}</span>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {meta && (
              <section className="mz-sec">
                <div className="mz-sec-head">
                  <h2 className="mz-sec-title">Evidence record</h2>
                  <span className="mz-sec-note">emitted for every reading</span>
                </div>
                <div className="mz-ev">
                  <div><b>Document</b> {meta.name}</div>
                  <div><b>SHA-256</b> {meta.hash}</div>
                  <div><b>Read at</b> {meta.at}</div>
                  <div><b>System</b> Mizan {VERSION} · {meta.model}</div>
                  <div>
                    <b>Cost of this reading</b> ${meta.cost_usd?.toFixed(4)} ·{" "}
                    {(meta.input_tokens || 0).toLocaleString()} in / {(meta.output_tokens || 0).toLocaleString()} out
                    {meta.stop_reason === "max_tokens" && (
                      <span style={{ color: "var(--esc)" }}> · truncated, raise max_tokens</span>
                    )}
                  </div>
                  <div><b>Operator</b> {operator || "UNRECORDED"}</div>
                  <div><b>Escalations open</b> {(data.escalations || []).length} · owners named {(data.escalations || []).filter((_, i) => owners[i]).length}</div>
                </div>
              </section>
            )}

            <footer className="mz-foot">
              <div>
                <b>Mizan</b> {VERSION} · reading of {file?.name || "document"}<br />
                Figures are read from the document. Nothing here is an opinion on the accounts.
              </div>
              <div style={{ textAlign: "right" }}>
                <b>Jonathan Z</b><br />
                Nexus AI Assurance FZCO · Dubai<br />
                [contact] · nexusai.ae
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
