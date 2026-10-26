import React, { useState } from "react";
import { api } from "../lib/api.js";
import { useLoad, Loading, ErrorBox, Thumb, Search, Icon, useToast, match } from "../ui.jsx";
import { qtyFmt } from "../lib/constants.js";
import { downloadCSV, readTable, pick } from "../lib/csv.js";

// Physical stock count: type what's on the shelf; differences are booked.
export default function Count() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.listProducts());
  const [counted, setCounted] = useState({});
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const products = data.filter((p) => p.active);
  const rows = products.filter((p) => !q || match(p, q));
  const entered = products.filter((p) => counted[p.id] !== undefined && counted[p.id] !== "");
  const diffs = entered.filter((p) => Number(counted[p.id]) !== Number(p.on_hand));

  const importSheet = async (f) => {
    try {
      const rs = await readTable(f);
      const bySku = new Map(products.map((p) => [p.sku.toUpperCase(), p.id]));
      const next = { ...counted };
      let n = 0;
      for (const r of rs) {
        const id = bySku.get(pick(r, "sku", "code").toUpperCase());
        const c = pick(r, "counted", "count", "physical", "qty");
        if (id && c !== "") { next[id] = c; n++; }
      }
      setCounted(next);
      toast(`${n} counts loaded`);
    } catch (e) { setErr(e.message); }
  };

  const apply = async () => {
    setBusy(true); setErr("");
    try {
      const n = await api.applyStockCount(entered.map((p) => ({ product_id: p.id, counted: Number(counted[p.id]) })), note.trim() || "Stock count");
      toast(n ? `${n} difference${n > 1 ? "s" : ""} booked` : "Everything matched — nothing to change");
      setCounted({});
      reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Stock count</h1><div className="muted">Count what's on the shelf. Only products you fill in are checked.</div></div>
        <div className="row">
          <button className="btn" onClick={() => downloadCSV(`count-sheet-${new Date().toISOString().slice(0, 10)}.csv`, products, [["sku", "sku"], ["name", "name"], ["pack", "pack"], [() => "", "counted"]])}><Icon name="download" /> Count sheet</button>
          <label className="btn"><Icon name="upload" /> Load counts<input type="file" accept=".csv,.xlsx" hidden onChange={(e) => e.target.files[0] && importSheet(e.target.files[0])} /></label>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}><Search value={q} onChange={setQ} /></div>
      <div className="card table-wrap">
        <table className="t">
          <thead><tr><th style={{ width: 44 }}></th><th>Product</th><th className="num">System</th><th className="num">Counted</th><th className="num">Difference</th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const c = counted[p.id];
              const d = c === undefined || c === "" ? null : Number(c) - Number(p.on_hand);
              return (
                <tr key={p.id} className={d ? "warn" : ""}>
                  <td><Thumb src={p.image_url} name={p.name} /></td>
                  <td>{p.name}<div className="muted small mono">{p.sku}</div></td>
                  <td className="num">{qtyFmt(p.on_hand)}</td>
                  <td className="num"><input className="input sm qty" type="number" step="any" min="0" value={c ?? ""} onChange={(e) => setCounted({ ...counted, [p.id]: e.target.value })} /></td>
                  <td className="num">{d == null ? "" : d === 0 ? <span className="badge ok">match</span> : <span className={d > 0 ? "qty-in" : "qty-out"}>{d > 0 ? "+" : ""}{qtyFmt(d)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card card-pad stack" style={{ marginTop: 16, position: "sticky", bottom: 70 }}>
        <div className="row between">
          <div><b>{entered.length}</b> counted · <b>{diffs.length}</b> with differences</div>
          <div className="row grow" style={{ maxWidth: 520 }}>
            <input className="input grow" style={{ width: "auto" }} placeholder="Note, e.g. Month-end count Oct" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn primary" disabled={busy || !entered.length} onClick={apply}>{busy ? "Saving…" : "Apply count"}</button>
          </div>
        </div>
        <ErrorBox error={err} />
      </div>
    </>
  );
}
