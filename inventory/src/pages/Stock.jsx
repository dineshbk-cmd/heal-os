import React, { useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useLoad, Loading, ErrorBox, Thumb, Search, Icon, Drawer, ReasonModal, useToast, match } from "../ui.jsx";
import { inr, qtyFmt, when, KINDS } from "../lib/constants.js";
import { downloadCSV } from "../lib/csv.js";
import { AuditList } from "./History.jsx";

export default function Stock({ can }) {
  const { data, loading, error, reload } = useLoad(() => api.listProducts());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState(null); // product or {} for new
  const cats = useMemo(() => [...new Set((data || []).map((p) => p.category).filter(Boolean))].sort(), [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const rows = data.filter((p) =>
    (filter === "inactive" ? !p.active : p.active) &&
    (filter !== "low" || p.low_stock) &&
    (filter !== "out" || Number(p.on_hand) <= 0) &&
    (!cat || p.category === cat) &&
    (!q || match(p, q))
  );
  const showCost = can("purchases.view") || can("reports.view");

  return (
    <>
      <div className="page-head">
        <div><h1>Stock</h1><div className="muted">{rows.length} of {data.length} products</div></div>
        <div className="row">
          <button className="btn" onClick={() => downloadCSV(`stock-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
            ["sku", "SKU"], ["name", "Name"], ["pack", "Pack"], ["category", "Category"], ["on_hand", "On hand"], ["reorder_level", "Reorder level"],
            ...(showCost ? [["purchase_price", "Purchase price"], ["stock_value", "Stock value"]] : []),
            ["sell_price", "Sell price"], ["gst_rate", "GST %"], ["barcode", "Barcode"], ["supplier_name", "Supplier"],
          ])}><Icon name="download" /> Export</button>
          {can("products.edit") && <button className="btn primary" onClick={() => setOpen({})}><Icon name="plus" /> New product</button>}
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Search value={q} onChange={setQ} placeholder="Search name, SKU, barcode…" />
        <div className="seg">
          {[["all", "All"], ["low", "Low"], ["out", "Out"], ["inactive", "Archived"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        {cats.length > 0 && (
          <select className="input" style={{ width: "auto" }} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div className="card table-wrap">
        <table className="t">
          <thead><tr>
            <th style={{ width: 44 }}></th><th>Product</th><th className="hide-sm">Category</th>
            <th className="num">On hand</th>{showCost && <th className="num hide-sm">Cost</th>}<th className="num hide-sm">Sell price</th>
            <th className="hide-sm">Last change</th>
          </tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="click" onClick={() => setOpen(p)}>
                <td><Thumb src={p.image_url} name={p.name} /></td>
                <td>{p.name}<div className="muted small mono">{p.sku}{p.pack ? " · " + p.pack : ""}</div></td>
                <td className="hide-sm">{p.category || <span className="muted">—</span>}</td>
                <td className="num">
                  <b>{qtyFmt(p.on_hand)}</b>
                  {Number(p.on_hand) <= 0 ? <div><span className="badge bad">Out</span></div> : p.low_stock ? <div><span className="badge warn">Low</span></div> : null}
                </td>
                {showCost && <td className="num hide-sm">{inr(p.purchase_price)}</td>}
                <td className="num hide-sm">{p.sell_price != null ? inr(p.sell_price) : <span className="muted">not set</span>}</td>
                <td className="hide-sm muted small">{when(p.last_movement_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No products match.</div>}
      </div>
      {open && <ProductDrawer product={open} can={can} onClose={() => setOpen(null)} onSaved={reload} />}
    </>
  );
}

const FIELDS = [
  ["sku", "SKU / product code"], ["name", "Name"], ["pack", "Pack size"], ["category", "Category"],
  ["sell_price", "Selling price (₹)", "number"], ["purchase_price", "Purchase price (₹, GST incl.)", "number"],
  ["gst_rate", "GST %", "number"], ["reorder_level", "Reorder when stock ≤", "number"], ["barcode", "Barcode"],
];

function ProductDrawer({ product, can, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !product.id;
  const [tab, setTab] = useState("details");
  const [p, setP] = useState(product);
  const [form, setForm] = useState({ ...product });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const edit = can("products.edit");
  const moves = useLoad(() => (p.id ? api.listMovements({ productId: p.id }) : Promise.resolve([])), [p.id]);
  const [undo, setUndo] = useState(null);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const saved = await api.saveProduct(form);
      setP({ ...p, ...saved });
      setForm({ ...p, ...saved });
      toast(isNew ? "Product created" : "Saved");
      onSaved();
      if (isNew) onClose();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const upload = async (file) => {
    if (!file) return;
    try {
      const blob = await shrink(file);
      const url = await api.uploadProductImage(p.id, blob);
      setP({ ...p, image_url: url });
      toast("Photo updated");
      onSaved();
    } catch (e) { toast(e.message, "err"); }
  };

  return (
    <Drawer title={isNew ? "New product" : p.name} sub={!isNew && <span className="mono">{p.sku}</span>} onClose={onClose}>
      {!isNew && (
        <div className="card card-pad row" style={{ alignItems: "flex-start", gap: 16 }}>
          <div className="stack" style={{ gap: 6, justifyItems: "center" }}>
            <Thumb src={p.image_url} name={p.name} lg />
            {edit && (
              <label className="btn sm"><Icon name="camera" /> Photo
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files[0])} />
              </label>
            )}
          </div>
          <div className="grow kpis" style={{ marginBottom: 0 }}>
            <div><div className="muted small">On hand</div><div style={{ fontSize: 26, fontWeight: 700 }}>{qtyFmt(p.on_hand)}</div></div>
            {(can("reports.view")) && <div><div className="muted small">Stock value</div><div style={{ fontSize: 18, fontWeight: 600 }}>{inr(p.stock_value)}</div></div>}
            <div><div className="muted small">Supplier</div><div>{p.supplier_name || "—"}</div></div>
          </div>
        </div>
      )}

      {!isNew && (
        <div className="tabs">
          {[["details", "Details"], ["moves", "Stock movements"], ...(can("audit.view") ? [["changes", "Change history"]] : [])].map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      )}

      {tab === "details" && (
        <div className="card card-pad stack">
          <div className="form-grid">
            {FIELDS.map(([k, label, type]) => {
              if (k === "purchase_price" && !(can("purchases.view") || can("reports.view"))) return null;
              return (
                <label key={k} className="field">{label}
                  <input className="input" type={type || "text"} step="any" value={form[k] ?? ""} disabled={!edit}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </label>
              );
            })}
          </div>
          <label className="field">Notes<textarea className="input" rows={2} value={form.notes ?? ""} disabled={!edit} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          {!isNew && (
            <label className="check"><input type="checkbox" checked={form.active !== false} disabled={!edit} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active (untick to archive a product you no longer stock — its history is kept)</label>
          )}
          {err && <div className="alert err">{err}</div>}
          {edit && <div><button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create product" : "Save changes"}</button></div>}
          {isNew && <div className="muted small">Tip: products are created automatically when you import an invoice. Add opening stock from Stock out → "Opening stock".</div>}
        </div>
      )}

      {tab === "moves" && (
        <div className="card table-wrap">
          {moves.loading ? <Loading /> : (
            <table className="t">
              <thead><tr><th>When</th><th>Type</th><th className="num">Qty</th><th className="hide-sm">By</th><th>Ref / note</th><th></th></tr></thead>
              <tbody>
                {(moves.data || []).map((m) => (
                  <tr key={m.id}>
                    <td className="small">{when(m.created_at)}</td>
                    <td>{KINDS[m.kind]?.[0] || m.kind}</td>
                    <td className="num"><span className={m.qty > 0 ? "qty-in" : "qty-out"}>{m.qty > 0 ? "+" : ""}{qtyFmt(m.qty)}</span></td>
                    <td className="hide-sm small">{m.created_by_name || "—"}</td>
                    <td className="small">{m.reference}{m.note ? <div className="muted">{m.note}</div> : null}</td>
                    <td>{can("stock.adjust") && !["reversal", "purchase"].includes(m.kind) && (
                      <button className="btn sm ghost" title="Undo this entry" onClick={() => setUndo(m)}><Icon name="undo" /></button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {moves.data?.length === 0 && <div className="empty">No movements yet.</div>}
        </div>
      )}

      {tab === "changes" && <AuditList table="products" recordId={p.id} />}

      {undo && (
        <ReasonModal title="Undo this entry?" text={`Books the opposite (${-undo.qty}) of "${KINDS[undo.kind]?.[0]}" from ${when(undo.created_at)}. The original stays in history.`}
          confirmLabel="Undo entry" danger onClose={() => setUndo(null)}
          onConfirm={async (reason) => { await api.reverseMovement(undo.id, reason); toast("Entry reversed"); moves.reload(); onSaved(); const fresh = (await api.listProducts()).find((x) => x.id === p.id); if (fresh) setP(fresh); }} />
      )}
    </Drawer>
  );
}

// Resize photos from a phone camera before uploading (max 800px)
async function shrink(file, max = 800) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
}
