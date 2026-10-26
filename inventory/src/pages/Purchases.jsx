import React, { useState } from "react";
import { api } from "../lib/api.js";
import { useLoad, Loading, ErrorBox, Thumb, Drawer, ReasonModal, useToast, Icon } from "../ui.jsx";
import { inr, qtyFmt, day, when } from "../lib/constants.js";
import { downloadCSV } from "../lib/csv.js";

export default function Purchases({ can }) {
  const { data, loading, error, reload } = useLoad(() => api.listPurchases());
  const [open, setOpen] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <div className="page-head"><div><h1>Purchases</h1><div className="muted">Every supplier invoice brought into stock.</div></div></div>
      <div className="card table-wrap">
        <table className="t">
          <thead><tr><th>Invoice</th><th>Date</th><th className="hide-sm">Supplier</th><th className="num">Lines</th><th className="num">Total</th><th>Status</th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} className="click" onClick={() => setOpen(p.id)}>
                <td><b>{p.invoice_no}</b><div className="muted small">{p.source.toUpperCase()} · added {when(p.created_at)}</div></td>
                <td>{day(p.invoice_date)}</td>
                <td className="hide-sm">{p.suppliers?.name}</td>
                <td className="num">{p.purchase_items?.[0]?.count ?? "—"}</td>
                <td className="num">{inr(p.grand_total)}</td>
                <td>{p.status === "void" ? <span className="badge bad">Void</span> : <span className="badge ok">Posted</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="empty">No purchases yet.</div>}
      </div>
      {open && <PurchaseDrawer id={open} can={can} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function PurchaseDrawer({ id, can, onClose, onChanged }) {
  const toast = useToast();
  const { data: p, loading, error, reload } = useLoad(() => api.getPurchase(id), [id]);
  const [voiding, setVoiding] = useState(false);
  if (loading && !p) return <Drawer title="Purchase" onClose={onClose}><Loading /></Drawer>;
  if (error) return <Drawer title="Purchase" onClose={onClose}><ErrorBox error={error} /></Drawer>;
  const items = (p.purchase_items || []).slice().sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0));
  const units = items.reduce((s, i) => s + Number(i.qty), 0);
  return (
    <Drawer title={`Invoice ${p.invoice_no}`} sub={`${p.suppliers?.name} · ${day(p.invoice_date)}`} onClose={onClose}
      actions={<>
        <button className="btn sm" onClick={() => downloadCSV(`invoice-${p.invoice_no}.csv`, items, [[(i) => i.products?.sku, "SKU"], [(i) => i.products?.name, "Product"], ["qty", "Qty"], ["unit_price", "Price"], ["gst_amount", "GST"], ["taxable_amount", "Taxable"]])}><Icon name="download" /></button>
        {p.file_path && <button className="btn sm" onClick={async () => { const u = await api.purchaseFileUrl(p.file_path); if (u) window.open(u, "_blank"); }}>Original PDF</button>}
      </>}>
      {p.status === "void" && <div className="alert err">Voided: {p.void_reason}. Its stock was reversed.</div>}
      <div className="kpis" style={{ marginBottom: 0 }}>
        <div className="card kpi"><div className="label">Lines / units</div><div className="value">{items.length} / {qtyFmt(units)}</div></div>
        <div className="card kpi"><div className="label">Sub total</div><div className="value" style={{ fontSize: 18 }}>{inr(p.subtotal)}</div></div>
        <div className="card kpi"><div className="label">GST</div><div className="value" style={{ fontSize: 18 }}>{inr(Number(p.cgst || 0) + Number(p.sgst || 0) + Number(p.igst || 0))}</div></div>
        <div className="card kpi"><div className="label">Grand total</div><div className="value" style={{ fontSize: 18 }}>{inr(p.grand_total)}</div></div>
      </div>
      {p.notes && <div className="muted">Note: {p.notes}</div>}
      <div className="card table-wrap">
        <table className="t">
          <thead><tr><th>#</th><th style={{ width: 44 }}></th><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num hide-sm">GST</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id}>
              <td className="muted small">{i.line_no}</td>
              <td><Thumb src={i.products?.image_url} name={i.products?.name} /></td>
              <td>{i.products?.name}<div className="muted small mono">{i.products?.sku}</div></td>
              <td className="num">{qtyFmt(i.qty)}</td>
              <td className="num">{inr(i.unit_price)}</td>
              <td className="num hide-sm small">{inr(i.gst_amount)}{i.gst_rate != null && <span className="muted"> · {Number(i.gst_rate)}%</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {p.status !== "void" && can("stock.adjust") && (
        <div><button className="btn danger" onClick={() => setVoiding(true)}>Void this invoice…</button>
          <div className="muted small" style={{ marginTop: 4 }}>Use if it was imported by mistake or twice. Stock is reversed; the record stays in history. You can re-import a corrected version afterwards.</div></div>
      )}
      {voiding && (
        <ReasonModal title={`Void invoice ${p.invoice_no}?`} text={`This removes ${qtyFmt(units)} units from stock.`} confirmLabel="Void invoice" danger
          onClose={() => setVoiding(false)} onConfirm={async (r) => { await api.voidPurchase(p.id, r); toast("Invoice voided"); reload(); onChanged(); }} />
      )}
    </Drawer>
  );
}
