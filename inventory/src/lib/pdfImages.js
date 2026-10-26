// Finds where raster images are drawn on a PDF page (in PDF user space), so
// product photos printed next to invoice lines can be cropped from a render.
const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

export async function imageBoxes(page, OPS) {
  const ops = await page.getOperatorList();
  const boxes = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const paintOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintJpegXObject].filter((v) => v != null));
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (paintOps.has(fn)) {
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
      boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
  }
  return boxes;
}

// Pair each invoice item with the image whose vertical centre is nearest to
// the item's qty/price line on the same page (and left of the product name).
export function matchImagesToItems(items, boxesByPage) {
  const out = new Map();
  for (const it of items) {
    const boxes = boxesByPage[it.page - 1] || [];
    let best = null;
    for (const b of boxes) {
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      if (w < 15 || h < 15 || w / h > 2 || h / w > 2) continue; // skip logos/banners
      if (it.y < b.y0 - 10 || it.y > b.y1 + 10) continue;
      const d = Math.abs((b.y0 + b.y1) / 2 - it.y);
      if (!best || d < best.d) best = { d, box: b };
    }
    if (best) out.set(it.sku, best.box);
  }
  return out;
}
