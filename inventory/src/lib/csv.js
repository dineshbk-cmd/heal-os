// Minimal CSV helpers (quotes, commas, newlines) + Excel reading.
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

// rows (array of arrays, first = header) → array of objects keyed by normalised header
export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0].map((h) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] == null ? "" : String(r[i]).trim()])));
}

export async function readTable(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file");
    return rowsToObjects(await readXlsxFile(file));
  }
  return rowsToObjects(parseCSV(await file.text()));
}

// Pick the first present column among aliases
export function pick(obj, ...names) {
  for (const n of names) if (obj[n] != null && obj[n] !== "") return obj[n];
  return "";
}

const esc = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function downloadCSV(filename, rows, columns) {
  const cols = columns || Object.keys(rows[0] || {}).map((k) => [k, k]);
  const lines = [cols.map(([, label]) => esc(label)).join(",")];
  for (const r of rows) lines.push(cols.map(([k]) => esc(typeof k === "function" ? k(r) : r[k])).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
