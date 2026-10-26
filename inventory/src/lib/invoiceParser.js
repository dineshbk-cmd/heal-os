// Turns the text of a supplier tax invoice (Empire Biz Corp layout, and
// similar "product (SKU) / qty / price / GST / total" invoices) into
// structured data. Pure: it takes positioned text items, so it can be
// tested in Node and reused in the browser.
//
// pages: [[{ str, x, y }]]  — PDF user-space coordinates (y grows upward)

const SKU_RE = /^\(\s*([A-Z]{2,}[A-Z0-9-]*\d{3,})\s*\)$/;
const MONEY_RE = /^₹?\s*-?[\d,]+(\.\d+)?$/;

export function money(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Group text items into visual lines (same y within tolerance), left → right.
function toLines(items, tol = 2.5) {
  const sorted = items
    .filter((it) => it.str && it.str.trim())
    .slice()
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

const lineText = (l) => l.items.map((i) => i.str.trim()).join(" ").replace(/\s+/g, " ").trim();

function grab(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

// dd-mm-yyyy / dd/mm/yyyy → yyyy-mm-dd
function isoDate(s) {
  if (!s) return null;
  const m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = "20" + y;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// "AYUR TEA TABLET - 60TAB" → { name, pack: "60TAB" }
export function splitPack(full) {
  const m = full.match(/^(.*?)\s*[-–]\s*([^-–]*\d[^-–]*)$/);
  if (m && m[1].trim()) return { name: m[1].trim(), pack: m[2].trim() };
  return { name: full.trim(), pack: "" };
}

export function parseInvoice(pages) {
  const allLines = pages.map((items) => toLines(items));
  const fullText = allLines.flat().map(lineText).join("\n");

  const header = {
    supplier_name: null,
    supplier_gstin: grab(fullText, /GSTIN[:\s]*([0-9A-Z]{15})/i),
    supplier_phone: grab(fullText, /Mobile[:\s]*([+\d][\d\s-]{7,})/i),
    invoice_no: grab(fullText, /Invoice\s*No[.:\s]*([A-Za-z0-9/-]+)/i),
    invoice_date: isoDate(grab(fullText, /Date[:\s]*([\d]{1,2}[-/.][\d]{1,2}[-/.][\d]{2,4})/i)),
    customer: grab(fullText, /Customer[:\s]*([^\n]+?)(?:\s{2,}|\n|$)/i),
    customer_ref: grab(fullText, /User\s*ID[:\s]*([A-Za-z0-9-]+)/i),
  };
  // First line that looks like a company name ("… PVT LTD", "… LLP", "… CORP")
  const nameLine = allLines.flat().map(lineText).find((t) => /\b(PVT|LTD|LIMITED|LLP|CORP|BIZCORP|TRADERS|ENTERPRISES)\b/i.test(t));
  header.supplier_name = nameLine || null;

  const totals = {
    subtotal: money(grab(fullText, /Sub\s*Total\s*(₹?[\d,.]+)/i)),
    cgst: money(grab(fullText, /CGST\s*(₹?[\d,.]+)/i)),
    sgst: money(grab(fullText, /SGST\s*(₹?[\d,.]+)/i)),
    igst: money(grab(fullText, /IGST\s*(₹?[\d,.]+)/i)),
    total: money(grab(fullText, /(?:^|\n)\s*Total\s*(₹?[\d,.]+)/i)),
    grand_total: money(grab(fullText, /Grand\s*Total\s*(₹?[\d,.]+)/i)),
    other_charges: [],
  };
  // Lines between "Total" and "Grand Total" are extra charges (e.g. "Product Book ₹100.00")
  const tm = fullText.match(/\n\s*Total\s*₹?[\d,.]+\n([\s\S]*?)\n\s*Grand\s*Total/i);
  if (tm) {
    for (const l of tm[1].split("\n")) {
      const m = l.match(/^(.*?)\s*₹?\s*([\d,]+\.\d{2})\s*$/);
      if (m && m[1].trim()) totals.other_charges.push({ label: m[1].trim(), amount: money(m[2]) });
    }
  }

  // ── Line items ─────────────────────────────────────────────
  // Each item: some name lines, one numeric line (#, qty, ₹price, ₹gst, ₹total,
  // possibly with a name fragment), and a "(SKU)" line that closes the item.
  const items = [];
  const warnings = [];
  for (let p = 0; p < allLines.length; p++) {
    let pending = [];
    for (const line of allLines[p]) {
      const text = lineText(line);
      if (/Sub\s*Total/i.test(text)) break;
      const skuItem = line.items.find((i) => SKU_RE.test(i.str.trim()));
      const moneyItems = line.items.filter((i) => i.str.trim().startsWith("₹") && MONEY_RE.test(i.str.trim()));
      pending.push({ line, text, skuItem, moneyItems, page: p });
      if (!skuItem) continue;

      const block = pending;
      pending = [];
      const num = block.find((b) => b.moneyItems.length >= 3);
      if (!num) {
        warnings.push(`Page ${p + 1}: found SKU ${skuItem.str.trim()} but no qty/price line`);
        continue;
      }
      const firstMoneyX = num.moneyItems[0].x;
      const ints = num.line.items.filter((i) => /^\d+$/.test(i.str.trim()) && i.x < firstMoneyX);
      const qtyItem = ints.length ? ints[ints.length - 1] : null;
      const idxItem = ints.length > 1 ? ints[0] : null;
      const leftEdge = idxItem ? idxItem.x : -Infinity;
      const nameParts = [];
      // Name lines sit just above/below the qty line; anything further away on
      // the page (company header, customer block) is not part of this item.
      for (const b of block) {
        if (Math.abs(b.line.y - num.line.y) > 22) continue;
        for (const i of b.line.items) {
          const s = i.str.trim();
          if (i === qtyItem || i === idxItem || b.moneyItems.includes(i) || i === skuItem) continue;
          if (SKU_RE.test(s)) continue;
          if (qtyItem && i.x >= qtyItem.x) continue; // anything right of qty is not name
          if (i.x <= leftEdge) continue;
          if (/^(#|Image|Product|Quantity|Price|GST|Total.*|\(Exclusive|GST\))$/i.test(s)) continue;
          nameParts.push(s);
        }
      }
      const fullName = nameParts.join(" ").replace(/\s+/g, " ").trim();
      const [price, gst, total] = num.moneyItems.slice(0, 3).map((i) => money(i.str));
      const qty = qtyItem ? Number(qtyItem.str) : null;
      const { name, pack } = splitPack(fullName);
      const taxable = total;
      const lineGross = round2(taxable + gst);
      const gstRate = taxable ? Math.round((gst / taxable) * 1000) / 10 : 0;
      const item = {
        line_no: idxItem ? Number(idxItem.str) : items.length + 1,
        sku: skuItem.str.trim().replace(/[()\s]/g, ""),
        full_name: fullName,
        name,
        pack,
        qty,
        unit_price: price, // per-unit price as printed (GST inclusive on EBC invoices)
        gst_amount: gst,
        taxable_amount: taxable,
        line_total: lineGross,
        gst_rate: gstRate,
        page: p + 1,
        y: num.line.y,
        check: qty && price ? Math.abs(qty * price - lineGross) < 0.05 : false,
      };
      if (!item.check) warnings.push(`Line ${item.line_no} (${item.sku}): qty × price ≠ taxable + GST`);
      items.push(item);
    }
  }

  const sumTaxable = round2(items.reduce((s, i) => s + (i.taxable_amount || 0), 0));
  const sumGst = round2(items.reduce((s, i) => s + (i.gst_amount || 0), 0));
  const checks = {
    item_count: items.length,
    sum_taxable: sumTaxable,
    sum_gst: sumGst,
    subtotal_matches: totals.subtotal == null ? null : Math.abs(sumTaxable - totals.subtotal) < 1,
    gst_matches:
      totals.cgst == null ? null : Math.abs(sumGst - ((totals.cgst || 0) + (totals.sgst || 0) + (totals.igst || 0))) < 1,
  };
  if (checks.subtotal_matches === false) warnings.push(`Sum of items ₹${sumTaxable} ≠ invoice sub total ₹${totals.subtotal}`);
  if (checks.gst_matches === false) warnings.push(`Sum of item GST ₹${sumGst} ≠ invoice CGST+SGST`);
  const seen = new Set();
  for (const i of items) {
    if (seen.has(i.sku)) warnings.push(`SKU ${i.sku} appears more than once`);
    seen.add(i.sku);
  }

  return { header, totals, items, checks, warnings };
}
