import React, { useState } from "react";
import { api } from "../lib/api.js";
import { useLoad, Loading, ErrorBox, Thumb, Icon, useToast, ProductPicker } from "../ui.jsx";
import { inr, qtyFmt, KINDS } from "../lib/constants.js";

const OPTIONS = ["sale", "return_in", "sample", "damage", "expired", "return_out", "adjustment", "opening"];

export default function StockOut({ can }) {
  const toast = useToast();
  const allowed = OPTIONS.filter((k) => can(KINDS[k][2]));
  const [kind, setKind] = useState(allowed[0]);
  const [lines, setLines] = useState([]);
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { data: products, loading, error, reload } = useLoad(() => api.listProducts());

  if (loading && !products) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const dir = KINDS[kind][1];
  const needsReason = ["adjustment", "damage", "expired"].includes(kind);
  const priced = ["sale", "return_in"].includes(kind);
  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_price || 0), 0);

  const add = (p) => {
    if (lines.some((l) => l.product.id === p.id)) return;
    setLines([...lines, { product: p, qty: 1, unit_price: priced ? p.sell_price ?? "" : "" }]);
  };
  const set = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const n = await api.recordMovements(kind, lines.map((l) => ({ product_id: l.product.id, qty: Number(l.qty), unit_price: l.unit_price === "" ? null : Number(l.unit_price) })), ref.trim(), note.trim());
      toast(`${KINDS[kind][0]}: ${n} line${n > 1 ? "s" : ""} recorded`);
      setLines([]); setRef(""); setNote("");
      reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <>
      <div className="page-head"><div><h1>Stock out & adjustments</h1><div className="muted">Record sales, returns, damage, samples or corrections.</div></div></div>
      <div className="card card-pad stack">
        <div className="row">
          {allowed.map((k) => (
            <button key={k} className={"btn sm" + (k === kind ? " primary" : "")} onClick={() => { setKind(k); setLines(lines.map((l) => ({ ...l, unit_price: ["sale", "return_in"].includes(k) ? l.product.sell_price ?? "" : "" }))); }}>
              {KINDS[k][0]}
            </button>
          ))}
        </div>
        <div className="muted small">
          {dir > 0 ? "Adds to stock." : dir < 0 ? "Takes from stock." : "Use + to add or − to remove (e.g. −2 for two missing)."}
          {kind === "opening" && " Use once per product when you start using the app, for stock you already had."}
        </div>
        <ProductPicker products={products} exclude={lines.map((l) => l.product.id)} onPick={add} />
      </div>

      {lines.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="table-wrap"><table className="t">
            <thead><tr><th style={{ width: 44 }}></th><th>Product</th><th className="num">In stock</th><th className="num">Qty</th>{priced && <th className="num">Price each</th>}<th className="num">After</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const q = Number(l.qty || 0);
                const after = Number(l.product.on_hand) + (dir === 0 ? q : dir * Math.abs(q));
                return (
                  <tr key={l.product.id} className={after < 0 ? "warn" : ""}>
                    <td><Thumb src={l.product.image_url} name={l.product.name} /></td>
                    <td>{l.product.name}<div className="muted small mono">{l.product.sku}</div></td>
                    <td className="num">{qtyFmt(l.product.on_hand)}</td>
                    <td className="num"><input className="input sm qty" type="number" step="any" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} /></td>
                    {priced && <td className="num"><input className="input sm qty" type="number" step="any" value={l.unit_price} placeholder="—" onChange={(e) => set(i, { unit_price: e.target.value })} /></td>}
                    <td className="num"><b style={{ color: after < 0 ? "var(--danger)" : undefined }}>{qtyFmt(after)}</b></td>
                    <td><button className="btn sm ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <div className="card-pad stack">
            <div className="form-grid">
              <label className="field">Reference <span className="hint">— bill no., customer name…</span><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
              <label className="field">Note {needsReason && <span className="hint">— reason required</span>}<input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
            {priced && total > 0 && <div><b>Total: {inr(total)}</b></div>}
            <ErrorBox error={err} />
            <div><button className="btn primary" disabled={busy || (needsReason && !note.trim())} onClick={submit}>{busy ? "Saving…" : `Record ${KINDS[kind][0].toLowerCase()}`}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
