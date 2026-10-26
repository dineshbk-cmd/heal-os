import React, { useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useLoad, Loading, ErrorBox, Thumb, Icon, useToast, ProductPicker } from "../ui.jsx";
import { inr, qtyFmt } from "../lib/constants.js";
import { readTable, pick, downloadCSV } from "../lib/csv.js";
import { money, splitPack } from "../lib/invoiceParser.js";

export default function Receive({ can, go }) {
  const [mode, setMode] = useState(can("stock.in") ? "invoice" : "catalog");
  return (
    <>
      <div className="page-head">
        <div><h1>Receive / Import</h1><div className="muted">Bring stock in from a supplier invoice, a spreadsheet, or by hand.</div></div>
      </div>
      <div className="tabs">
        {can("stock.in") && <button className={mode === "invoice" ? "on" : ""} onClick={() => setMode("invoice")}>Supplier invoice (PDF)</button>}
        {can("stock.in") && <button className={mode === "sheet" ? "on" : ""} onClick={() => setMode("sheet")}>Purchase from Excel / CSV / by hand</button>}
        {can("products.edit") && <button className={mode === "catalog" ? "on" : ""} onClick={() => setMode("catalog")}>Product list (bulk update)</button>}
      </div>
      {mode === "catalog" ? <CatalogImport can={can} /> : <PurchaseImport key={mode} mode={mode} can={can} go={go} />}
    </>
  );
}

function DropZone({ accept, label, hint, onFile }) {
  const [over, setOver] = useState(false);
  const ref = useRef();
  return (
    <div className={"drop" + (over ? " over" : "")} onClick={() => ref.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }}>
      <Icon name="upload" size={28} />
      <div style={{ fontWeight: 600, marginTop: 6 }}>{label}</div>
      <div className="muted small">{hint}</div>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => { e.target.files[0] && onFile(e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}

const EBC = "EBC EMPIRE BIZCORP PVT LTD";
const blankHeader = { supplier: EBC, invoice_no: "", invoice_date: new Date().toISOString().slice(0, 10), other_charges: 0, notes: "" };

function PurchaseImport({ mode, can, go }) {
  const toast = useToast();
  const catalog = useLoad(() => api.listProducts());
  const suppliers = useLoad(() => api.listSuppliers());
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [head, setHead] = useState(blankHeader);
  const [items, setItems] = useState(mode === "sheet" ? [] : null);
  const [images, setImages] = useState({});
  const [opts, setOpts] = useState({ photos: true, prices: true });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  const bySku = useMemo(() => new Map((catalog.data || []).map((p) => [p.sku.toUpperCase(), p])), [catalog.data]);

  const onPdf = async (f) => {
    setErr(""); setBusy("Reading invoice…"); setFile(f);
    try {
      const { readInvoicePdf } = await import("../lib/pdfInvoice.js");
      const r = await readInvoicePdf(f, { withImages: true });
      if (!r.items.length) throw new Error("No product lines found. Is this an Empire Biz Corp tax invoice? Try the Excel/CSV tab instead.");
      setParsed(r);
      setHead({
        supplier: r.header.supplier_name || EBC, invoice_no: r.header.invoice_no || "", invoice_date: r.header.invoice_date || blankHeader.invoice_date,
        other_charges: r.totals.other_charges.reduce((s, c) => s + c.amount, 0), notes: r.totals.other_charges.map((c) => `${c.label} ${inr(c.amount)}`).join(", "),
        gstin: r.header.supplier_gstin, phone: r.header.supplier_phone,
      });
      setItems(r.items.map((i) => ({ ...i, name: i.full_name })));
      setImages(r.images || {});
    } catch (e) { setErr(e.message); setFile(null); }
    setBusy("");
  };

  const onSheet = async (f) => {
    setErr("");
    try {
      const rows = await readTable(f);
      const its = rows.map((r, i) => {
        const qty = money(pick(r, "qty", "quantity", "received", "units"));
        const price = money(pick(r, "unit_price", "price", "rate", "cost", "purchase_price"));
        const name = pick(r, "name", "product", "product_name", "item", "description");
        const gst = money(pick(r, "gst_amount", "gst", "tax")) || 0;
        return { line_no: i + 1, sku: pick(r, "sku", "code", "product_code", "item_code").toUpperCase(), name, pack: pick(r, "pack", "size") || splitPack(name).pack,
          qty, unit_price: price, gst_amount: gst, gst_rate: money(pick(r, "gst_rate", "gst_percent", "gst")) ?? null, taxable_amount: qty && price ? qty * price - gst : null };
      }).filter((i) => i.sku || i.name);
      if (!its.length) throw new Error("No rows found. The first row must be headings such as: sku, name, qty, price");
      setItems(its);
      setFile(f);
    } catch (e) { setErr(e.message); }
  };

  const setItem = (idx, patch) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const valid = items?.filter((i) => i.sku && Number(i.qty) > 0 && i.unit_price !== "" && i.unit_price != null) || [];
  const newOnes = valid.filter((i) => !bySku.has(i.sku.toUpperCase()));
  const total = valid.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0);
  const problems = [];
  if (!head.invoice_no.trim()) problems.push("Enter the invoice number");
  if (!head.supplier.trim()) problems.push("Enter the supplier");
  if (items && items.length !== valid.length) problems.push(`${items.length - valid.length} line(s) are missing SKU, qty or price and will be skipped`);
  if (newOnes.length && !can("products.edit")) problems.push(`${newOnes.length} new product(s) — ask a manager to import (you can't create products)`);

  const submit = async () => {
    setBusy("Saving…"); setErr("");
    try {
      const payload = {
        supplier: { name: head.supplier.trim(), gstin: head.gstin || null, phone: head.phone || null },
        invoice_no: head.invoice_no.trim(), invoice_date: head.invoice_date || null,
        subtotal: parsed?.totals.subtotal ?? null, cgst: parsed?.totals.cgst ?? null, sgst: parsed?.totals.sgst ?? null, igst: parsed?.totals.igst ?? null,
        other_charges: Number(head.other_charges) || 0, grand_total: parsed?.totals.grand_total ?? (total + (Number(head.other_charges) || 0)),
        notes: head.notes || null, source: parsed ? "pdf" : file ? "csv" : "manual", update_prices: opts.prices,
        items: valid.map((i) => ({ sku: i.sku.trim().toUpperCase(), name: (i.name || i.sku).trim(), pack: i.pack || null, qty: Number(i.qty), unit_price: Number(i.unit_price),
          gst_amount: Number(i.gst_amount) || 0, taxable_amount: i.taxable_amount ?? null, gst_rate: i.gst_rate === "" ? null : i.gst_rate, line_no: i.line_no })),
      };
      await api.importPurchase(payload, file);
      let photos = 0;
      if (opts.photos && Object.keys(images).length && can("products.edit")) {
        setBusy("Saving product photos…");
        const { dataUrlToBlob } = await import("../lib/pdfInvoice.js");
        const fresh = await api.listProducts();
        for (const p of fresh) {
          const img = images[p.sku];
          if (img && !p.image_url) {
            try { await api.uploadProductImage(p.id, await dataUrlToBlob(img)); photos++; } catch (e) { console.warn(e); break; }
          }
        }
      }
      setDone({ invoice: head.invoice_no, lines: valid.length, units: valid.reduce((s, i) => s + Number(i.qty), 0), newProducts: newOnes.length, photos });
      toast("Invoice imported");
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  if (catalog.loading || suppliers.loading) return <Loading />;
  if (done) {
    return (
      <div className="card card-pad stack">
        <div className="alert ok"><b>Invoice {done.invoice} imported.</b> {done.lines} lines, {qtyFmt(done.units)} units added to stock
          {done.newProducts ? `, ${done.newProducts} new products created` : ""}{done.photos ? `, ${done.photos} product photos saved` : ""}.</div>
        <div className="row">
          <button className="btn primary" onClick={() => go("stock")}>View stock</button>
          {can("purchases.view") && <button className="btn" onClick={() => go("purchases")}>View purchase</button>}
          <button className="btn" onClick={() => { setDone(null); setParsed(null); setItems(mode === "sheet" ? [] : null); setFile(null); setHead(blankHeader); setImages({}); catalog.reload(); }}>Import another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {mode === "invoice" && !items && (
        <>
          <DropZone accept="application/pdf,.pdf" label="Drop the Empire Biz Corp invoice PDF here" hint="or tap to choose a file — nothing is saved until you confirm" onFile={onPdf} />
          {busy && <div className="alert info">{busy}</div>}
        </>
      )}
      {mode === "sheet" && (
        <div className="card card-pad stack">
          <div className="row between">
            <div><b>From a spreadsheet</b><div className="muted small">Headings: sku, name, qty, price (GST incl.), optional gst_amount, gst_rate, pack</div></div>
            <button className="btn sm" onClick={() => downloadCSV("purchase-template.csv", [{ sku: "EMPP000001", name: "AYUR TEA TABLET - 60TAB", pack: "60TAB", qty: 5, price: 660, gst_amount: 64.71, gst_rate: 2 }])}><Icon name="download" /> Template</button>
          </div>
          <DropZone accept=".csv,.xlsx,text/csv" label="Drop a .csv or .xlsx file" hint="or add lines by hand below" onFile={onSheet} />
        </div>
      )}
      <ErrorBox error={err} />

      {items && (
        <>
          <div className="card card-pad stack">
            <h2>Invoice details</h2>
            <div className="form-grid">
              <label className="field">Supplier
                <input className="input" list="supplier-list" value={head.supplier} onChange={(e) => setHead({ ...head, supplier: e.target.value })} />
                <datalist id="supplier-list">{(suppliers.data || []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
              </label>
              <label className="field">Invoice number<input className="input" value={head.invoice_no} onChange={(e) => setHead({ ...head, invoice_no: e.target.value })} /></label>
              <label className="field">Invoice date<input className="input" type="date" value={head.invoice_date || ""} onChange={(e) => setHead({ ...head, invoice_date: e.target.value })} /></label>
              <label className="field">Other charges (₹)<input className="input" type="number" step="any" value={head.other_charges} onChange={(e) => setHead({ ...head, other_charges: e.target.value })} /></label>
            </div>
            <label className="field">Notes<input className="input" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} /></label>
            {parsed && (
              <div className="row small">
                <span className={"badge " + (parsed.checks.subtotal_matches ? "ok" : "warn")}>Items total {inr(parsed.checks.sum_taxable)} {parsed.checks.subtotal_matches ? "= " : "≠ "} sub total {inr(parsed.totals.subtotal)}</span>
                <span className={"badge " + (parsed.checks.gst_matches ? "ok" : "warn")}>GST {inr(parsed.checks.sum_gst)} {parsed.checks.gst_matches ? "matches" : "differs from"} CGST+SGST</span>
                <span className="badge info">Grand total {inr(parsed.totals.grand_total)}</span>
              </div>
            )}
            {parsed?.warnings?.length > 0 && <div className="alert warn small">{parsed.warnings.map((w) => <div key={w}>{w}</div>)}</div>}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{items.length} lines · {qtyFmt(valid.reduce((s, i) => s + Number(i.qty), 0))} units · {inr(total)}</h2>
              <div className="row small">
                <span className="badge brand">{valid.length - newOnes.length} existing</span>
                <span className="badge warn">{newOnes.length} new products</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>#</th><th style={{ width: 44 }}></th><th>SKU</th><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num hide-sm">GST</th><th className="num hide-sm">Line total</th><th></th></tr></thead>
                <tbody>
                  {items.map((it, idx) => {
                    const ex = it.sku && bySku.get(it.sku.toUpperCase());
                    const priceChanged = ex && ex.purchase_price != null && Number(ex.purchase_price) !== Number(it.unit_price);
                    return (
                      <tr key={idx} className={it.check === false ? "warn" : ""}>
                        <td className="muted small">{it.line_no}</td>
                        <td><Thumb src={ex?.image_url || images[it.sku]} name={it.name} /></td>
                        <td><input className="input sm mono" style={{ width: 120 }} value={it.sku} onChange={(e) => setItem(idx, { sku: e.target.value.toUpperCase() })} /></td>
                        <td style={{ minWidth: 200 }}>
                          {ex ? <>{ex.name}<div className="small"><span className="badge brand">in catalogue · {qtyFmt(ex.on_hand)} in stock</span></div></>
                            : <><input className="input sm" value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} /><div className="small"><span className="badge warn">new product</span></div></>}
                        </td>
                        <td className="num"><input className="input sm qty" type="number" step="any" value={it.qty ?? ""} onChange={(e) => setItem(idx, { qty: e.target.value })} /></td>
                        <td className="num"><input className="input sm qty" type="number" step="any" value={it.unit_price ?? ""} onChange={(e) => setItem(idx, { unit_price: e.target.value })} />
                          {priceChanged && <div className="small" style={{ color: "var(--accent)" }}>was {inr(ex.purchase_price)}</div>}</td>
                        <td className="num hide-sm small">{inr(it.gst_amount)}{it.gst_rate != null && <div className="muted">{it.gst_rate}%</div>}</td>
                        <td className="num hide-sm">{inr(Number(it.qty) * Number(it.unit_price))}</td>
                        <td><button className="btn sm ghost" title="Remove line" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Icon name="trash" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="card-pad">
              <ProductPicker products={catalog.data || []} exclude={[]} onPick={(p) => setItems([...items, { line_no: items.length + 1, sku: p.sku, name: p.name, pack: p.pack, qty: 1, unit_price: p.purchase_price ?? "", gst_amount: 0, gst_rate: p.gst_rate }])} />
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setItems([...items, { line_no: items.length + 1, sku: "", name: "", qty: 1, unit_price: "", gst_amount: 0 }])}><Icon name="plus" /> Add a brand-new product line</button>
            </div>
          </div>

          <div className="card card-pad stack">
            {Object.keys(images).length > 0 && can("products.edit") && (
              <label className="check"><input type="checkbox" checked={opts.photos} onChange={(e) => setOpts({ ...opts, photos: e.target.checked })} /> Use the photos from the invoice for products that don't have one yet</label>
            )}
            <label className="check"><input type="checkbox" checked={opts.prices} onChange={(e) => setOpts({ ...opts, prices: e.target.checked })} /> Update each product's purchase price to this invoice's price</label>
            {problems.length > 0 && <div className="alert warn small">{problems.map((p) => <div key={p}>{p}</div>)}</div>}
            <div className="row">
              <button className="btn primary" disabled={!!busy || !valid.length || !head.invoice_no.trim() || (newOnes.length > 0 && !can("products.edit"))} onClick={submit}>
                {busy || `Add ${qtyFmt(valid.reduce((s, i) => s + Number(i.qty), 0))} units to stock`}
              </button>
              <button className="btn ghost" disabled={!!busy} onClick={() => { setItems(mode === "sheet" ? [] : null); setParsed(null); setFile(null); setImages({}); setHead(blankHeader); }}>Cancel</button>
            </div>
            <div className="muted small">Duplicate invoices are blocked automatically. A mistake can be undone later from Purchases → Void.</div>
          </div>
        </>
      )}
    </div>
  );
}

// Bulk create/update products from a spreadsheet (prices, categories,
// reorder levels…) with optional opening stock.
function CatalogImport({ can }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const catalog = useLoad(() => api.listProducts());
  const bySku = useMemo(() => new Map((catalog.data || []).map((p) => [p.sku.toUpperCase(), p])), [catalog.data]);
  const cols = [["name"], ["pack"], ["category"], ["sell_price", "mrp", "selling_price"], ["purchase_price", "cost"], ["gst_rate", "gst"], ["reorder_level", "reorder", "min_stock"], ["barcode"]];

  const onFile = async (f) => {
    setErr("");
    try {
      const data = await readTable(f);
      const out = data.map((r) => {
        const row = { sku: pick(r, "sku", "code", "product_code").toUpperCase() };
        for (const [k, ...alias] of cols) {
          const v = pick(r, k, ...alias);
          if (v !== "") row[k] = ["sell_price", "purchase_price", "gst_rate", "reorder_level"].includes(k) ? money(v) : v;
        }
        const opening = pick(r, "opening_stock", "on_hand", "stock");
        return { row, opening: opening === "" ? null : money(opening) };
      }).filter((x) => x.row.sku);
      if (!out.length) throw new Error("No rows with a sku column found");
      setRows(out);
    } catch (e) { setErr(e.message); }
  };

  const apply = async () => {
    setBusy(true); setErr("");
    try {
      const missingName = rows.filter((r) => !bySku.has(r.row.sku) && !r.row.name);
      if (missingName.length) throw new Error(`New SKUs need a name: ${missingName.slice(0, 5).map((r) => r.row.sku).join(", ")}`);
      const res = await api.upsertProducts(rows.map((r) => r.row));
      const openings = rows.filter((r) => r.opening);
      if (openings.length) {
        if (!can("stock.in")) throw new Error("Products saved, but you need 'Receive stock' permission to add opening stock");
        const fresh = await api.listProducts();
        const id = new Map(fresh.map((p) => [p.sku.toUpperCase(), p.id]));
        await api.recordMovements("opening", openings.map((r) => ({ product_id: id.get(r.row.sku), qty: r.opening })), "Opening stock import", null);
      }
      toast(`${res.created} created, ${res.updated} updated${openings.length ? `, opening stock for ${openings.length}` : ""}`);
      setRows(null);
      catalog.reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="stack">
      <div className="card card-pad stack">
        <div className="row between">
          <div><b>Update many products at once</b>
            <div className="muted small">Match by <span className="mono">sku</span>. Only columns you include are changed. Columns: sku, name, pack, category, sell_price, purchase_price, gst_rate, reorder_level, barcode, opening_stock</div></div>
          <div className="row">
            <button className="btn sm" onClick={() => downloadCSV("products-template.csv", [{ sku: "EMPP000001", name: "AYUR TEA TABLET - 60TAB", pack: "60TAB", category: "Tablets", sell_price: 750, reorder_level: 2, barcode: "", opening_stock: "" }])}><Icon name="download" /> Template</button>
            {catalog.data?.length > 0 && <button className="btn sm" onClick={() => downloadCSV("products.csv", catalog.data, [["sku", "sku"], ["name", "name"], ["pack", "pack"], ["category", "category"], ["sell_price", "sell_price"], ["purchase_price", "purchase_price"], ["gst_rate", "gst_rate"], ["reorder_level", "reorder_level"], ["barcode", "barcode"]])}><Icon name="download" /> Current list</button>}
          </div>
        </div>
        <div className="alert info small">Easiest way to set selling prices, categories and reorder levels: download <b>Current list</b>, fill the columns in Excel, save, and drop it back here.</div>
        <DropZone accept=".csv,.xlsx,text/csv" label="Drop a .csv or .xlsx file" hint="You'll see a preview first" onFile={onFile} />
      </div>
      <ErrorBox error={err} />
      {rows && (
        <div className="card">
          <div className="card-head"><h2>Preview — {rows.length} rows</h2>
            <div className="row"><button className="btn ghost" onClick={() => setRows(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={apply}>{busy ? "Saving…" : "Apply changes"}</button></div></div>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>SKU</th><th>Status</th><th>Changes</th><th className="num">Opening stock</th></tr></thead>
            <tbody>{rows.map(({ row, opening }) => {
              const ex = bySku.get(row.sku);
              const changes = Object.entries(row).filter(([k, v]) => k !== "sku" && (!ex || String(ex[k] ?? "") !== String(v ?? "")));
              return (
                <tr key={row.sku}>
                  <td className="mono">{row.sku}</td>
                  <td>{ex ? <span className="badge brand">update</span> : <span className="badge warn">new</span>}</td>
                  <td className="small">{changes.length ? changes.map(([k, v]) => <div key={k}><span className="muted">{k}:</span> {ex && ex[k] != null ? <><s className="muted">{String(ex[k])}</s> → </> : null}<b>{String(v)}</b></div>) : <span className="muted">no change</span>}</td>
                  <td className="num">{opening ?? ""}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
