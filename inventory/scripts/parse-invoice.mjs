// Usage: node scripts/parse-invoice.mjs path/to/invoice.pdf [--json]
// Runs the same parser the app uses, so you can check a new invoice layout.
import { readFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseInvoice } from "../src/lib/invoiceParser.js";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/parse-invoice.mjs invoice.pdf [--json]"); process.exit(1); }
const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(file)) }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const tc = await (await doc.getPage(i)).getTextContent();
  pages.push(tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] })));
}
const out = parseInvoice(pages);
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(out.header, out.totals, out.checks);
  for (const i of out.items) console.log(i.line_no, i.sku, JSON.stringify(i.name), i.pack, i.qty, i.unit_price, i.gst_amount, i.taxable_amount, i.gst_rate + "%", i.check ? "" : "CHECK");
  console.log("warnings:", out.warnings);
}
