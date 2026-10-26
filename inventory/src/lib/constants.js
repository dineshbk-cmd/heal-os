export const PERMISSIONS = [
  ["inventory.view", "See products and stock levels"],
  ["products.edit", "Add / edit products, prices, photos"],
  ["stock.in", "Receive stock & import invoices"],
  ["stock.out", "Record sales / stock going out"],
  ["stock.adjust", "Adjust, count, write off, undo entries"],
  ["purchases.view", "See purchase invoices and costs"],
  ["reports.view", "See stock value & reports"],
  ["audit.view", "See full change history"],
  ["users.manage", "Approve people, assign roles, change permissions"],
];

// kind → [label, direction, permission needed]
export const KINDS = {
  opening: ["Opening stock", +1, "stock.in"],
  purchase: ["Purchase", +1, "stock.in"],
  sale: ["Sale", -1, "stock.out"],
  return_in: ["Customer return", +1, "stock.out"],
  return_out: ["Return to supplier", -1, "stock.adjust"],
  damage: ["Damaged", -1, "stock.adjust"],
  expired: ["Expired", -1, "stock.adjust"],
  sample: ["Free sample / gift", -1, "stock.out"],
  adjustment: ["Adjustment (±)", 0, "stock.adjust"],
  count: ["Stock count", 0, "stock.adjust"],
  reversal: ["Reversal", 0, "stock.adjust"],
  transfer: ["Transfer out", -1, "stock.out"],
};

export const inr = (n) =>
  n == null || n === "" || Number.isNaN(Number(n))
    ? "—"
    : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const qtyFmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

export const when = (ts) =>
  ts ? new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function normalizePhone(p) {
  if (!p) return "";
  const raw = String(p).replace(/[^\d+]/g, "");
  if (raw.startsWith("+")) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  return d;
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
export const isPhone = (s) => /^\+\d{10,15}$/.test(normalizePhone(s));
