// Live backend: Supabase (Postgres + Auth + Storage). All rules are enforced
// in the database (see supabase/schema.sql); this file is a thin wrapper.
import { createClient } from "@supabase/supabase-js";
import { normalizePhone, isEmail } from "./constants.js";

export function createSupabaseApi(url, anonKey) {
  const sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  const unwrap = ({ data, error }) => {
    if (error) throw new Error(friendly(error.message));
    return data;
  };
  const friendly = (m = "") =>
    m.includes("profiles_phone_key") ? "This mobile number is already registered"
    : m.includes("Database error saving new user") ? "Could not create the account — the email or mobile may already be registered"
    : m.includes("row-level security") ? "You don't have permission to do that"
    : m;

  async function phoneAuth(body) {
    const res = await fetch("/api/auth-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  return {
    mode: "live",

    // ── Auth ─────────────────────────────────────────────
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
      return () => data.subscription.unsubscribe();
    },
    async signIn(identifier, password) {
      if (isEmail(identifier)) {
        unwrap(await sb.auth.signInWithPassword({ email: identifier.trim(), password }));
        return;
      }
      const tokens = await phoneAuth({ action: "login", phone: normalizePhone(identifier), password });
      unwrap(await sb.auth.setSession(tokens));
    },
    async signUp({ full_name, email, phone, password }) {
      const ph = normalizePhone(phone);
      const free = unwrap(await sb.rpc("phone_available", { p: ph }));
      if (!free) throw new Error("This mobile number is already registered");
      const data = unwrap(
        await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name, phone: ph }, emailRedirectTo: window.location.origin },
        })
      );
      return { needsConfirmation: !data.session };
    },
    async requestReset(identifier) {
      if (isEmail(identifier)) {
        unwrap(await sb.auth.resetPasswordForEmail(identifier.trim(), { redirectTo: window.location.origin }));
      } else {
        await phoneAuth({ action: "reset", phone: normalizePhone(identifier) });
      }
    },
    async updatePassword(password) {
      unwrap(await sb.auth.updateUser({ password }));
    },
    async updateEmail(email) {
      unwrap(await sb.auth.updateUser({ email }, { emailRedirectTo: window.location.origin }));
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async me() {
      const { data: u } = await sb.auth.getUser();
      if (!u?.user) return null;
      const profile = unwrap(await sb.from("profiles").select("*").eq("id", u.user.id).maybeSingle());
      const perms = profile?.status === "active" ? unwrap(await sb.rpc("my_permissions")) : [];
      return { ...profile, permissions: (perms || []).map((p) => (typeof p === "string" ? p : p.my_permissions)) };
    },
    async updateMyProfile(id, { full_name, phone }) {
      unwrap(await sb.from("profiles").update({ full_name, phone: normalizePhone(phone) }).eq("id", id));
    },

    // ── Catalogue & stock ────────────────────────────────
    async listProducts() {
      return unwrap(await sb.from("product_stock").select("*").order("name"));
    },
    async saveProduct(p) {
      const row = { ...p };
      for (const k of ["on_hand", "stock_value", "last_movement_at", "low_stock", "supplier_name", "created_at", "updated_at"]) delete row[k];
      for (const k of ["purchase_price", "sell_price", "gst_rate", "reorder_level"]) if (row[k] === "") row[k] = k === "reorder_level" ? 0 : null;
      if (row.sku) row.sku = row.sku.trim().toUpperCase();
      if (row.id) return unwrap(await sb.from("products").update(row).eq("id", row.id).select().single());
      return unwrap(await sb.from("products").insert(row).select().single());
    },
    async upsertProducts(rows) {
      // bulk catalogue import: match by SKU, update given fields, insert new
      const existing = unwrap(await sb.from("products").select("id, sku"));
      const bySku = new Map(existing.map((p) => [p.sku.toUpperCase(), p.id]));
      let created = 0, updated = 0;
      for (const r of rows) {
        const id = bySku.get(r.sku.toUpperCase());
        if (id) { unwrap(await sb.from("products").update(r).eq("id", id)); updated++; }
        else { unwrap(await sb.from("products").insert(r)); created++; }
      }
      return { created, updated };
    },
    async uploadProductImage(productId, blob) {
      const path = `${productId}/${Date.now()}.jpg`;
      unwrap(await sb.storage.from("product-images").upload(path, blob, { contentType: blob.type || "image/jpeg" }));
      const { data } = sb.storage.from("product-images").getPublicUrl(path);
      unwrap(await sb.from("products").update({ image_url: data.publicUrl }).eq("id", productId));
      return data.publicUrl;
    },
    async listSuppliers() {
      return unwrap(await sb.from("suppliers").select("*").order("name"));
    },
    async saveSupplier(s) {
      if (s.id) return unwrap(await sb.from("suppliers").update(s).eq("id", s.id).select().single());
      return unwrap(await sb.from("suppliers").insert(s).select().single());
    },

    async listMovements({ productId, kind, from, to, limit = 300 } = {}) {
      let q = sb.from("movement_feed").select("*").order("id", { ascending: false }).limit(limit);
      if (productId) q = q.eq("product_id", productId);
      if (kind) q = q.eq("kind", kind);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      return unwrap(await q);
    },
    async recordMovements(kind, items, reference, note) {
      return unwrap(await sb.rpc("record_movements", { p_kind: kind, items, p_reference: reference || null, p_note: note || null }));
    },
    async applyStockCount(items, note) {
      return unwrap(await sb.rpc("apply_stock_count", { items, p_note: note || "" }));
    },
    async reverseMovement(id, reason) {
      return unwrap(await sb.rpc("reverse_movement", { m_id: id, reason }));
    },

    // ── Purchases ────────────────────────────────────────
    async importPurchase(payload, file) {
      if (file) {
        const safe = String(payload.invoice_no).replace(/[^A-Za-z0-9_-]/g, "_");
        const path = `${new Date().getFullYear()}/${safe}-${Date.now()}.${file.name.split(".").pop()}`;
        const up = await sb.storage.from("invoices").upload(path, file);
        if (!up.error) payload = { ...payload, file_path: path };
      }
      return unwrap(await sb.rpc("import_purchase", { payload }));
    },
    async listPurchases() {
      return unwrap(await sb.from("purchases").select("*, suppliers(name), purchase_items(count)").order("created_at", { ascending: false }));
    },
    async getPurchase(id) {
      return unwrap(await sb.from("purchases").select("*, suppliers(name), purchase_items(*, products(sku, name, image_url))").eq("id", id).single());
    },
    async purchaseFileUrl(path) {
      const { data } = await sb.storage.from("invoices").createSignedUrl(path, 300);
      return data?.signedUrl;
    },
    async voidPurchase(id, reason) {
      unwrap(await sb.rpc("void_purchase", { p_id: id, reason }));
    },

    // ── People & permissions ─────────────────────────────
    async listUsers() {
      return unwrap(await sb.from("profiles").select("*").order("created_at"));
    },
    async updateUser(id, patch) {
      unwrap(await sb.from("profiles").update(patch).eq("id", id));
    },
    async listRoles() {
      const [roles, perms] = await Promise.all([
        sb.from("roles").select("*").order("created_at"),
        sb.from("role_permissions").select("*"),
      ]);
      const rp = unwrap(perms);
      return unwrap(roles).map((r) => ({ ...r, permissions: rp.filter((x) => x.role_key === r.key).map((x) => x.permission_key) }));
    },
    async saveRole({ key, name, description }) {
      unwrap(await sb.from("roles").upsert({ key, name, description }));
    },
    async setRolePermission(role_key, permission_key, on) {
      if (on) unwrap(await sb.from("role_permissions").insert({ role_key, permission_key }));
      else unwrap(await sb.from("role_permissions").delete().match({ role_key, permission_key }));
    },
    async listInvitations() {
      return unwrap(await sb.from("invitations").select("*").is("accepted_by", null).order("created_at", { ascending: false }));
    },
    async invite({ email, phone, role_key }) {
      unwrap(await sb.from("invitations").insert({ email: email || null, phone: phone ? normalizePhone(phone) : null, role_key }));
    },
    async deleteInvitation(id) {
      unwrap(await sb.from("invitations").delete().eq("id", id));
    },

    // ── Audit & settings ─────────────────────────────────
    async listAudit({ table, recordId, limit = 300 } = {}) {
      let q = sb.from("audit_log").select("*").order("id", { ascending: false }).limit(limit);
      if (table) q = q.eq("table_name", table);
      if (recordId) q = q.eq("record_id", String(recordId));
      return unwrap(await q);
    },
    async getSettings() {
      const rows = unwrap(await sb.from("settings").select("*"));
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    async setSetting(key, value) {
      unwrap(await sb.from("settings").upsert({ key, value }));
    },
  };
}
