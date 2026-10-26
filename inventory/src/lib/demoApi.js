// Demo backend: same API as supabaseApi.js, stored in this browser's
// localStorage. For trying the app before Supabase is set up — NOT secure,
// not shared between devices. Mirrors the rules in supabase/schema.sql.
import { PERMISSIONS, KINDS, normalizePhone, isEmail } from "./constants.js";

const KEY = "stockroom_demo_v1";
const SESSION = "stockroom_demo_session";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
const now = () => new Date().toISOString();
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

function seed() {
  const db = {
    users: [], profiles: [], invitations: [], suppliers: [], products: [], purchases: [],
    purchase_items: [], movements: [], audit: [], seq: { movement: 0, audit: 0 },
    settings: { allow_negative_stock: false },
    roles: [
      { key: "admin", name: "Admin", description: "Full control including people and permissions", is_system: true, created_at: now() },
      { key: "manager", name: "Manager", description: "Runs the stock: imports, edits, adjustments, reports", created_at: now() },
      { key: "staff", name: "Staff", description: "Day-to-day: sees stock, records sales, receives goods", created_at: now() },
      { key: "viewer", name: "Viewer", description: "Read-only access to stock levels", created_at: now() },
    ],
    role_permissions: [],
  };
  const all = PERMISSIONS.map(([k]) => k);
  const grant = (r, ps) => ps.forEach((p) => db.role_permissions.push({ role_key: r, permission_key: p }));
  grant("admin", all);
  grant("manager", all.filter((p) => p !== "users.manage"));
  grant("staff", ["inventory.view", "stock.out", "stock.in"]);
  grant("viewer", ["inventory.view"]);
  db.suppliers.push({ id: uid(), name: "EBC EMPIRE BIZCORP PVT LTD", gstin: "33AAFCE8079F1ZJ", phone: "7540022800",
    address: "No.76, Thendral Nagar, Thiruvarur, Tamil Nadu, India, 610001", created_at: now() });
  // Ready-made demo people so every role can be tried (password: demo1234)
  [
    ["Asha Admin", "admin@demo.in", "+919800000001", "admin"],
    ["Manoj Manager", "manager@demo.in", "+919800000002", "manager"],
    ["Selvi Staff", "staff@demo.in", "+919800000003", "staff"],
    ["Vijay Viewer", "viewer@demo.in", "+919800000004", "viewer"],
  ].forEach(([full_name, email, phone, role_key]) => {
    const id = uid();
    db.users.push({ id, email, password: "demo1234" });
    db.profiles.push({ id, full_name, email, phone, role_key, status: "active", created_at: now(), updated_at: now() });
  });
  return db;
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (d) return d;
  } catch {}
  const d = seed();
  save(d);
  return d;
}
function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {
    throw new Error("Browser storage is full — product photos take space in demo mode. Connect Supabase for real use.");
  }
}

export function createDemoApi() {
  let db = load();
  const listeners = new Set();
  const session = () => { try { return JSON.parse(localStorage.getItem(SESSION) || "null"); } catch { return null; } };
  const meId = () => session()?.user?.id;
  const me = () => db.profiles.find((p) => p.id === meId());
  const perms = () => {
    const p = me();
    if (!p || p.status !== "active") return [];
    return db.role_permissions.filter((r) => r.role_key === p.role_key).map((r) => r.permission_key);
  };
  const need = (p) => { if (!perms().includes(p)) throw new Error("Permission denied: " + p); };
  const emit = (event) => listeners.forEach((cb) => cb(event, session()));

  function audit(table, action, oldRow, newRow, id) {
    let changed = null;
    if (action === "UPDATE") {
      changed = Object.keys(newRow).filter((k) => k !== "updated_at" && JSON.stringify(oldRow?.[k]) !== JSON.stringify(newRow[k])).sort();
      if (!changed.length) return;
    }
    db.audit.push({ id: ++db.seq.audit, table_name: table, record_id: String(id ?? newRow?.id ?? oldRow?.id), action,
      changed_fields: changed, old_data: clone(oldRow), new_data: clone(newRow), actor: meId() || null,
      actor_name: me()?.full_name || null, at: now() });
  }
  function insert(table, coll, row) {
    db[coll].push(row);
    audit(table, "INSERT", null, row);
    return row;
  }
  function update(table, row, patch) {
    const old = clone(row);
    Object.assign(row, patch, "updated_at" in row ? { updated_at: now() } : {});
    audit(table, "UPDATE", old, row);
    return row;
  }
  const onHand = (pid) => db.movements.filter((m) => m.product_id === pid).reduce((s, m) => s + Number(m.qty), 0);
  const tx = (fn) => {
    const snapshot = JSON.stringify(db);
    try { const r = fn(); save(db); return r; } catch (e) { db = JSON.parse(snapshot); throw e; }
  };
  const addMovement = (m) => {
    const row = { id: ++db.seq.movement, created_by: meId(), created_at: now(), unit_price: null, purchase_id: null,
      reverses_id: null, reference: null, note: null, ...m };
    insert("stock_movements", "movements", row);
    return row;
  };
  const productStock = (p) => {
    const oh = onHand(p.id);
    const last = db.movements.filter((m) => m.product_id === p.id).map((m) => m.created_at).sort().pop() || null;
    return { ...p, supplier_name: db.suppliers.find((s) => s.id === p.supplier_id)?.name || null, on_hand: oh,
      stock_value: oh * Number(p.purchase_price || 0), last_movement_at: last, low_stock: oh <= Number(p.reorder_level || 0) && p.active };
  };
  const feed = (m) => {
    const p = db.products.find((x) => x.id === m.product_id) || {};
    return { ...m, sku: p.sku, product_name: p.name, created_by_name: db.profiles.find((x) => x.id === m.created_by)?.full_name,
      invoice_no: db.purchases.find((x) => x.id === m.purchase_id)?.invoice_no || null };
  };
  const later = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 60));

  function newProfile(user, meta) {
    const ph = normalizePhone(meta.phone);
    const first = db.profiles.length === 0;
    const inv = db.invitations.filter((i) => !i.accepted_by && ((i.email && i.email.toLowerCase() === user.email.toLowerCase()) || (i.phone && i.phone === ph))).pop();
    const prof = { id: user.id, full_name: meta.full_name || "", email: user.email, phone: ph,
      role_key: first ? "admin" : inv?.role_key || null, status: first || inv ? "active" : "pending", created_at: now(), updated_at: now() };
    insert("profiles", "profiles", prof);
    if (inv) update("invitations", inv, { accepted_by: user.id });
  }

  return {
    mode: "demo",
    reset() { localStorage.removeItem(KEY); localStorage.removeItem(SESSION); db = load(); emit("SIGNED_OUT"); },

    async getSession() { return session(); },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async signIn(identifier, password) {
      let user;
      if (isEmail(identifier)) user = db.users.find((u) => u.email.toLowerCase() === identifier.trim().toLowerCase());
      else {
        const p = db.profiles.find((x) => x.phone === normalizePhone(identifier));
        user = p && db.users.find((u) => u.id === p.id);
      }
      if (!user || user.password !== password) throw new Error("Invalid login credentials");
      localStorage.setItem(SESSION, JSON.stringify({ user: { id: user.id, email: user.email } }));
      emit("SIGNED_IN");
    },
    async signUp({ full_name, email, phone, password }) {
      tx(() => {
        if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) throw new Error("This email is already registered");
        if (db.profiles.some((p) => p.phone === normalizePhone(phone))) throw new Error("This mobile number is already registered");
        const user = { id: uid(), email: email.trim(), password };
        db.users.push(user);
        newProfile(user, { full_name, phone });
        localStorage.setItem(SESSION, JSON.stringify({ user: { id: user.id, email: user.email } }));
      });
      emit("SIGNED_IN");
      return { needsConfirmation: false };
    },
    async requestReset(identifier) {
      // Demo: no email is sent. Pretend, and let the user set a new password.
      let user;
      if (isEmail(identifier)) user = db.users.find((u) => u.email.toLowerCase() === identifier.trim().toLowerCase());
      else { const p = db.profiles.find((x) => x.phone === normalizePhone(identifier)); user = p && db.users.find((u) => u.id === p.id); }
      if (user) {
        localStorage.setItem(SESSION, JSON.stringify({ user: { id: user.id, email: user.email } }));
        setTimeout(() => emit("PASSWORD_RECOVERY"), 400);
      }
    },
    async updatePassword(password) {
      tx(() => { db.users.find((u) => u.id === meId()).password = password; });
    },
    async updateEmail(email) {
      tx(() => {
        if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== meId())) throw new Error("Email already in use");
        db.users.find((u) => u.id === meId()).email = email;
        update("profiles", me(), { email });
      });
    },
    async signOut() { localStorage.removeItem(SESSION); emit("SIGNED_OUT"); },

    async me() { const p = me(); return p ? later({ ...p, permissions: perms() }) : null; },
    async updateMyProfile(id, { full_name, phone }) {
      tx(() => {
        if (id !== meId()) need("users.manage");
        const ph = normalizePhone(phone);
        if (db.profiles.some((p) => p.phone === ph && p.id !== id)) throw new Error("This mobile number is already registered");
        update("profiles", db.profiles.find((p) => p.id === id), { full_name, phone: ph });
      });
    },

    async listProducts() { need("inventory.view"); return later(db.products.map(productStock).sort((a, b) => a.name.localeCompare(b.name))); },
    async saveProduct(p) {
      need("products.edit");
      return tx(() => {
        const row = { ...p };
        for (const k of ["on_hand", "stock_value", "last_movement_at", "low_stock", "supplier_name"]) delete row[k];
        row.sku = (row.sku || "").trim().toUpperCase();
        if (!row.sku || !row.name) throw new Error("SKU and name are required");
        if (db.products.some((x) => x.sku === row.sku && x.id !== row.id)) throw new Error("Another product already has SKU " + row.sku);
        if (row.id) return clone(update("products", db.products.find((x) => x.id === row.id), row));
        return clone(insert("products", "products", { id: uid(), active: true, reorder_level: 0, created_at: now(), updated_at: now(), ...row }));
      });
    },
    async upsertProducts(rows) {
      need("products.edit");
      return tx(() => {
        let created = 0, updated = 0;
        for (const r of rows) {
          const ex = db.products.find((p) => p.sku === r.sku.toUpperCase());
          if (ex) { update("products", ex, r); updated++; }
          else { insert("products", "products", { id: uid(), active: true, reorder_level: 0, created_at: now(), updated_at: now(), ...r, sku: r.sku.toUpperCase() }); created++; }
        }
        return { created, updated };
      });
    },
    async uploadProductImage(productId, blob) {
      need("products.edit");
      const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      tx(() => update("products", db.products.find((p) => p.id === productId), { image_url: url }));
      return url;
    },
    async listSuppliers() { need("inventory.view"); return later(db.suppliers); },
    async saveSupplier(s) {
      need("products.edit");
      return tx(() => s.id ? clone(update("suppliers", db.suppliers.find((x) => x.id === s.id), s)) : clone(insert("suppliers", "suppliers", { id: uid(), created_at: now(), ...s })));
    },

    async listMovements({ productId, kind, from, to, limit = 300 } = {}) {
      need("inventory.view");
      return later(db.movements.filter((m) => (!productId || m.product_id === productId) && (!kind || m.kind === kind)
        && (!from || m.created_at >= from) && (!to || m.created_at <= to + "T23:59:59"))
        .slice().reverse().slice(0, limit).map(feed));
    },
    async recordMovements(kind, items, reference, note) {
      const def = KINDS[kind];
      if (!def || kind === "purchase" || kind === "count" || kind === "reversal") throw new Error("Unknown movement kind " + kind);
      need(kind === "opening" ? "stock.in" : ["sale", "return_in", "sample", "transfer"].includes(kind) ? "stock.out" : "stock.adjust");
      if (["adjustment", "damage", "expired"].includes(kind) && !String(note || "").trim()) throw new Error("Please give a reason for this " + kind);
      return tx(() => {
        let n = 0;
        for (const it of items) {
          let q = Number(it.qty);
          if (!q) continue;
          if (def[1] !== 0) q = Math.abs(q) * def[1];
          if (q < 0 && !db.settings.allow_negative_stock) {
            const have = onHand(it.product_id);
            if (have + q < 0) throw new Error(`Not enough stock for ${db.products.find((p) => p.id === it.product_id)?.name} (have ${have}, need ${-q})`);
          }
          addMovement({ product_id: it.product_id, qty: q, kind, unit_price: it.unit_price === "" || it.unit_price == null ? null : Number(it.unit_price), reference: reference || null, note: note || null });
          n++;
        }
        if (!n) throw new Error("Nothing to record");
        return n;
      });
    },
    async applyStockCount(items, note) {
      need("stock.adjust");
      return tx(() => {
        let n = 0;
        for (const it of items) {
          if (it.counted === "" || it.counted == null) continue;
          const have = onHand(it.product_id);
          const diff = Number(it.counted) - have;
          if (diff) { addMovement({ product_id: it.product_id, qty: diff, kind: "count", reference: "Stock count", note: `${note || ""} (system ${have} → counted ${it.counted})` }); n++; }
        }
        return n;
      });
    },
    async reverseMovement(id, reason) {
      need("stock.adjust");
      if (!String(reason || "").trim()) throw new Error("A reason is required");
      return tx(() => {
        const m = db.movements.find((x) => x.id === id);
        if (!m) throw new Error("Movement not found");
        if (m.kind === "reversal") throw new Error("A reversal cannot be reversed — record a new movement instead");
        if (m.kind === "purchase") throw new Error("Void the whole invoice from Purchases instead");
        if (db.movements.some((x) => x.reverses_id === id)) throw new Error("Already reversed");
        return addMovement({ product_id: m.product_id, qty: -m.qty, kind: "reversal", unit_price: m.unit_price, reverses_id: m.id, reference: "Reversal of #" + m.id, note: reason }).id;
      });
    },

    async importPurchase(payload) {
      need("stock.in");
      if (!String(payload.invoice_no || "").trim()) throw new Error("Invoice number is required");
      if (!payload.items?.length) throw new Error("Invoice has no items");
      return tx(() => {
        const supName = payload.supplier.name.trim();
        let sup = db.suppliers.find((s) => s.name.toLowerCase() === supName.toLowerCase());
        if (!sup) sup = insert("suppliers", "suppliers", { id: uid(), name: supName, gstin: payload.supplier.gstin || null, phone: payload.supplier.phone || null, created_at: now() });
        if (db.purchases.some((p) => p.supplier_id === sup.id && p.invoice_no.toUpperCase() === payload.invoice_no.trim().toUpperCase() && p.status === "posted"))
          throw new Error(`Invoice ${payload.invoice_no} from this supplier is already imported`);
        const pur = insert("purchases", "purchases", { id: uid(), supplier_id: sup.id, invoice_no: payload.invoice_no.trim(), invoice_date: payload.invoice_date || null,
          subtotal: payload.subtotal ?? null, cgst: payload.cgst ?? null, sgst: payload.sgst ?? null, igst: payload.igst ?? null,
          other_charges: payload.other_charges || 0, grand_total: payload.grand_total ?? null, notes: payload.notes || null,
          source: payload.source || "manual", file_path: null, status: "posted", void_reason: null, created_by: meId(), created_at: now(), updated_at: now() });
        for (const it of payload.items) {
          if (!(Number(it.qty) > 0)) continue;
          const sku = it.sku.trim().toUpperCase();
          let prod = db.products.find((p) => p.sku === sku);
          if (!prod) {
            need("products.edit");
            prod = insert("products", "products", { id: uid(), sku, name: it.name.trim(), pack: it.pack || null, supplier_id: sup.id, purchase_price: Number(it.unit_price),
              gst_rate: it.gst_rate ?? null, sell_price: null, reorder_level: 0, active: true, image_url: null, created_at: now(), updated_at: now() });
          } else if (payload.update_prices !== false) {
            update("products", prod, { purchase_price: Number(it.unit_price), gst_rate: it.gst_rate ?? prod.gst_rate, supplier_id: prod.supplier_id || sup.id });
          }
          insert("purchase_items", "purchase_items", { id: uid(), purchase_id: pur.id, product_id: prod.id, line_no: it.line_no ?? null, qty: Number(it.qty),
            unit_price: Number(it.unit_price), gst_amount: Number(it.gst_amount || 0), taxable_amount: it.taxable_amount ?? null, gst_rate: it.gst_rate ?? null });
          addMovement({ product_id: prod.id, qty: Number(it.qty), kind: "purchase", unit_price: Number(it.unit_price), purchase_id: pur.id, reference: "Invoice " + pur.invoice_no });
        }
        return pur.id;
      });
    },
    async listPurchases() {
      need("purchases.view");
      return later(db.purchases.slice().reverse().map((p) => ({ ...p, suppliers: { name: db.suppliers.find((s) => s.id === p.supplier_id)?.name },
        purchase_items: [{ count: db.purchase_items.filter((i) => i.purchase_id === p.id).length }] })));
    },
    async getPurchase(id) {
      need("purchases.view");
      const p = db.purchases.find((x) => x.id === id);
      return later({ ...p, suppliers: { name: db.suppliers.find((s) => s.id === p.supplier_id)?.name },
        purchase_items: db.purchase_items.filter((i) => i.purchase_id === id).map((i) => {
          const pr = db.products.find((x) => x.id === i.product_id);
          return { ...i, products: { sku: pr?.sku, name: pr?.name, image_url: pr?.image_url } };
        }) });
    },
    async purchaseFileUrl() { return null; },
    async voidPurchase(id, reason) {
      need("stock.adjust");
      if (!String(reason || "").trim()) throw new Error("A reason is required");
      tx(() => {
        const pur = db.purchases.find((p) => p.id === id);
        if (pur.status === "void") throw new Error("Already void");
        for (const m of db.movements.filter((x) => x.purchase_id === id && x.kind === "purchase" && !db.movements.some((r) => r.reverses_id === x.id)))
          addMovement({ product_id: m.product_id, qty: -m.qty, kind: "reversal", unit_price: m.unit_price, purchase_id: id, reverses_id: m.id, reference: "Void invoice " + pur.invoice_no, note: reason });
        update("purchases", pur, { status: "void", void_reason: reason });
      });
    },

    async listUsers() {
      const p = me();
      return later(perms().includes("users.manage") ? db.profiles : db.profiles.filter((x) => x.id === p?.id || x.status === "active"));
    },
    async updateUser(id, patch) {
      tx(() => {
        const target = db.profiles.find((p) => p.id === id);
        if (!perms().includes("users.manage")) throw new Error("Not allowed to change role, status or email");
        if (target.role_key === "admin" && ((patch.role_key && patch.role_key !== "admin") || (patch.status && patch.status !== "active"))
          && !db.profiles.some((p) => p.role_key === "admin" && p.status === "active" && p.id !== id))
          throw new Error("This is the last admin — make someone else admin first");
        update("profiles", target, patch);
      });
    },
    async listRoles() {
      return later(db.roles.map((r) => ({ ...r, permissions: db.role_permissions.filter((x) => x.role_key === r.key).map((x) => x.permission_key) })));
    },
    async saveRole({ key, name, description }) {
      need("users.manage");
      tx(() => {
        const r = db.roles.find((x) => x.key === key);
        if (r) update("roles", r, { name, description });
        else insert("roles", "roles", { key, name, description, is_system: false, created_at: now() });
      });
    },
    async setRolePermission(role_key, permission_key, on) {
      need("users.manage");
      tx(() => {
        const i = db.role_permissions.findIndex((x) => x.role_key === role_key && x.permission_key === permission_key);
        if (on && i < 0) { db.role_permissions.push({ role_key, permission_key }); audit("role_permissions", "INSERT", null, { role_key, permission_key }, `${role_key}:${permission_key}`); }
        if (!on && i >= 0) { db.role_permissions.splice(i, 1); audit("role_permissions", "DELETE", { role_key, permission_key }, null, `${role_key}:${permission_key}`); }
      });
    },
    async listInvitations() { need("users.manage"); return later(db.invitations.filter((i) => !i.accepted_by).reverse()); },
    async invite({ email, phone, role_key }) {
      need("users.manage");
      if (!email && !phone) throw new Error("Enter an email or a mobile number");
      tx(() => insert("invitations", "invitations", { id: uid(), email: email || null, phone: phone ? normalizePhone(phone) : null, role_key, invited_by: meId(), accepted_by: null, created_at: now() }));
    },
    async deleteInvitation(id) {
      need("users.manage");
      tx(() => { const i = db.invitations.findIndex((x) => x.id === id); audit("invitations", "DELETE", db.invitations[i], null); db.invitations.splice(i, 1); });
    },

    async listAudit({ table, recordId, limit = 300 } = {}) {
      need("audit.view");
      return later(db.audit.filter((a) => (!table || a.table_name === table) && (!recordId || a.record_id === String(recordId))).slice().reverse().slice(0, limit));
    },
    async getSettings() { return later(db.settings); },
    async setSetting(key, value) {
      need("users.manage");
      tx(() => { const old = { key, value: db.settings[key] }; db.settings[key] = value; audit("settings", "UPDATE", old, { key, value }, key); });
    },
  };
}
