import React, { useState } from "react";
import { api } from "../lib/api.js";
import { useLoad, Loading, ErrorBox, Icon, ReasonModal, useToast } from "../ui.jsx";
import { KINDS, qtyFmt, when, inr } from "../lib/constants.js";
import { downloadCSV } from "../lib/csv.js";

export default function History({ can }) {
  const [tab, setTab] = useState(can("inventory.view") ? "moves" : "audit");
  return (
    <>
      <div className="page-head"><div><h1>History</h1><div className="muted">Nothing is ever silently changed — every entry and edit is recorded here.</div></div></div>
      <div className="tabs">
        {can("inventory.view") && <button className={tab === "moves" ? "on" : ""} onClick={() => setTab("moves")}>Stock movements</button>}
        {can("audit.view") && <button className={tab === "audit" ? "on" : ""} onClick={() => setTab("audit")}>All changes (audit log)</button>}
      </div>
      {tab === "moves" ? <Movements can={can} /> : <AuditList withFilter />}
    </>
  );
}

function Movements({ can }) {
  const toast = useToast();
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, loading, error, reload } = useLoad(() => api.listMovements({ kind, from, to, limit: 1000 }), [kind, from, to]);
  const [undo, setUndo] = useState(null);
  const reversed = new Set((data || []).map((m) => m.reverses_id).filter(Boolean));
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="input" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(KINDS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="row small">From <input className="input" type="date" style={{ width: "auto" }} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="row small">To <input className="input" type="date" style={{ width: "auto" }} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <span className="grow" />
        <button className="btn" disabled={!data?.length} onClick={() => downloadCSV("stock-movements.csv", data, [
          ["id", "#"], ["created_at", "When"], [(m) => KINDS[m.kind]?.[0] || m.kind, "Type"], ["sku", "SKU"], ["product_name", "Product"], ["qty", "Qty"], ["unit_price", "Unit price"],
          ["reference", "Reference"], ["note", "Note"], ["created_by_name", "By"]])}><Icon name="download" /> Export</button>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="card table-wrap">
          <table className="t">
            <thead><tr><th>#</th><th>When</th><th>Type</th><th>Product</th><th className="num">Qty</th><th className="num hide-sm">Price</th><th className="hide-sm">By</th><th>Ref / note</th><th></th></tr></thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id} style={reversed.has(m.id) ? { opacity: 0.55 } : undefined}>
                  <td className="muted small">{m.id}</td>
                  <td className="small">{when(m.created_at)}</td>
                  <td>{KINDS[m.kind]?.[0] || m.kind}{reversed.has(m.id) && <div><span className="badge">undone</span></div>}</td>
                  <td>{m.product_name}<div className="muted small mono">{m.sku}</div></td>
                  <td className="num"><span className={m.qty > 0 ? "qty-in" : "qty-out"}>{m.qty > 0 ? "+" : ""}{qtyFmt(m.qty)}</span></td>
                  <td className="num hide-sm small">{m.unit_price != null ? inr(m.unit_price) : ""}</td>
                  <td className="hide-sm small">{m.created_by_name || "—"}</td>
                  <td className="small">{m.reference}{m.note && <div className="muted">{m.note}</div>}</td>
                  <td>{can("stock.adjust") && !["reversal", "purchase"].includes(m.kind) && !reversed.has(m.id) && (
                    <button className="btn sm ghost" title="Undo" onClick={() => setUndo(m)}><Icon name="undo" /></button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 && <div className="empty">No movements for this filter.</div>}
        </div>
      )}
      {undo && (
        <ReasonModal title="Undo this entry?" text={`Books ${-undo.qty} of ${undo.product_name} as a reversal. The original stays visible.`} confirmLabel="Undo entry" danger
          onClose={() => setUndo(null)} onConfirm={async (r) => { await api.reverseMovement(undo.id, r); toast("Entry reversed"); reload(); }} />
      )}
    </>
  );
}

const TABLE_LABEL = {
  products: "Product", stock_movements: "Stock movement", purchases: "Purchase", purchase_items: "Purchase line", profiles: "Person",
  roles: "Role", role_permissions: "Permission", invitations: "Invitation", suppliers: "Supplier", settings: "Setting",
};
const HIDE = new Set(["id", "created_at", "updated_at", "created_by"]);
const short = (v) => {
  if (v == null || v === "") return "∅";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (s.startsWith("data:image")) return "(photo)";
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
};
const title = (a) => {
  const d = a.new_data || a.old_data || {};
  return d.name || d.full_name || d.invoice_no || d.sku || d.email || (d.role_key && d.permission_key ? `${d.role_key} → ${d.permission_key}` : null) || d.key || `#${a.record_id}`;
};

export function AuditList({ table, recordId, withFilter }) {
  const [t, setT] = useState(table || "");
  const { data, loading, error } = useLoad(() => api.listAudit({ table: t || undefined, recordId, limit: 500 }), [t, recordId]);
  return (
    <div className="stack">
      {withFilter && (
        <div className="row">
          <select className="input" style={{ width: "auto" }} value={t} onChange={(e) => setT(e.target.value)}>
            <option value="">Everything</option>
            {Object.entries(TABLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}s</option>)}
          </select>
          <span className="grow" />
          <button className="btn" disabled={!data?.length} onClick={() => downloadCSV("audit-log.csv", data, [
            ["at", "When"], ["actor_name", "By"], ["table_name", "Table"], ["record_id", "Record"], ["action", "Action"],
            [(a) => (a.changed_fields || []).join(" "), "Fields"], [(a) => JSON.stringify(a.old_data), "Old"], [(a) => JSON.stringify(a.new_data), "New"]])}><Icon name="download" /> Export</button>
        </div>
      )}
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : data.length === 0 ? <div className="card empty">No changes recorded.</div> : (
        <div className="card">
          {data.map((a) => (
            <div key={a.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
              <div className="row between">
                <div>
                  <span className={"badge " + (a.action === "INSERT" ? "ok" : a.action === "DELETE" ? "bad" : "info")}>{a.action === "INSERT" ? "Added" : a.action === "DELETE" ? "Removed" : "Changed"}</span>{" "}
                  <b>{TABLE_LABEL[a.table_name] || a.table_name}</b> · {title(a)}
                </div>
                <div className="muted small">{a.actor_name || "System"} · {when(a.at)}</div>
              </div>
              {a.action === "UPDATE" && a.changed_fields?.length > 0 && (
                <div className="diff" style={{ marginTop: 6 }}>
                  {a.changed_fields.filter((f) => !HIDE.has(f)).map((f) => (
                    <div key={f}>
                      <span className="muted">{f.replace(/_/g, " ")}:</span>{" "}
                      {a.old_data?.[f] == null || a.old_data?.[f] === "" ? <span className="muted">(empty)</span> : <span className="old">{short(a.old_data[f])}</span>}
                      {" → "}<span className="new">{short(a.new_data?.[f])}</span>
                    </div>
                  ))}
                </div>
              )}
              {a.action !== "UPDATE" && a.table_name === "stock_movements" && (
                <div className="muted small">{KINDS[a.new_data?.kind]?.[0]} {a.new_data?.qty > 0 ? "+" : ""}{a.new_data?.qty} {a.new_data?.reference ? `· ${a.new_data.reference}` : ""}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
