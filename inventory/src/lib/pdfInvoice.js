// Browser side of invoice import: read a PDF, parse it, and (optionally)
// crop the product photo printed next to each line.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { parseInvoice } from "./invoiceParser.js";
import { imageBoxes, matchImagesToItems } from "./pdfImages.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function readInvoicePdf(file, { withImages = true } = {}) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  const pageObjs = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    pageObjs.push(page);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] })));
  }
  const result = parseInvoice(pages);
  result.images = {};
  if (withImages && result.items.length) {
    try {
      const boxes = [];
      for (const p of pageObjs) boxes.push(await imageBoxes(p, pdfjs.OPS));
      const matches = matchImagesToItems(result.items, boxes);
      const byPage = {};
      for (const it of result.items) if (matches.has(it.sku)) (byPage[it.page] ||= []).push(it);
      for (const [pageNo, items] of Object.entries(byPage)) {
        const page = pageObjs[pageNo - 1];
        const viewport = page.getViewport({ scale: 3 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        for (const it of items) {
          const b = matches.get(it.sku);
          const [x0, y0, x1, y1] = viewport.convertToViewportRectangle([b.x0, b.y0, b.x1, b.y1]);
          const sx = Math.min(x0, x1), sy = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
          const c = document.createElement("canvas");
          c.width = Math.round(w);
          c.height = Math.round(h);
          c.getContext("2d").drawImage(canvas, sx, sy, w, h, 0, 0, c.width, c.height);
          result.images[it.sku] = c.toDataURL("image/jpeg", 0.85);
        }
      }
    } catch (e) {
      console.warn("Could not extract product photos", e);
    }
  }
  return result;
}

export const dataUrlToBlob = async (url) => (await fetch(url)).blob();
