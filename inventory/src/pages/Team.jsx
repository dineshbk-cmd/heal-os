import React, { useState } from "react";
import { api } from "../lib/api.js";
import { useLoad, Loading, ErrorBox, Icon, useToast, Modal } from "../ui.jsx";
import { PERMISSIONS, when, isEmail, isPhone } from "../lib/constants.js";

export default function Team({ me, reloadMe }) {
  const [tab, setTab] = useState("people");
  return (
    <>
      <div className="page-head"><div><h1>Team & roles</h1><div className="muted">Who can sign in, and what each role is allowed to do.</div></div></div>
      <div className="tabs">
        {[["people", "People"], ["roles", "Roles & permissions"], ["settings", "Settings"]].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "people" && <People me={me} />}
      {tab === "roles" && <Roles reloadMe={reloadMe} />}
      {tab === "settings" && <Settings />}
    </>
  );
}

function People({ me }) {
  const toast = useToast();
  const users = useLoad(() => api.listUsers());
  const roles = useLoad(() => api.listRoles());
  const invites = useLoad(() => api.listInvitations());
  const [inviting, setInviting] = useState(false);
  if (users.loading || roles.loading) return <Loading />;
  if (users.error) return <ErrorBox error={users.error} />;
  const order = { pending: 0, active: 1, disabled: 2 };
  const list = users.data.slice().sort((a, b) => order[a.status] - order[b.status] || a.full_name.localeCompare(b.full_name));
  const pending = list.filter((u) => u.status === "pending").length;

  const change = async (u, patch, msg) => {
    try { await api.updateUser(u.id, patch); toast(msg); users.reload(); } catch (e) { toast(e.message, "err"); }
  };

  return (
    <div className="stack">
      {pending > 0 && <div className="alert warn">{pending} {pending > 1 ? "people are" : "person is"} waiting for approval. Pick a role to let them in.</div>}
      <div className="card table-wrap">
        <div className="card-head"><h2>People ({list.length})</h2><button className="btn sm primary" onClick={() => setInviting(true)}><Icon name="plus" /> Pre-approve someone</button></div>
        <table className="t">
          <thead><tr><th>Name</th><th className="hide-sm">Email</th><th className="hide-sm">Mobile</th><th>Role</th><th>Status</th><th className="hide-sm">Joined</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name || "—"}</b>{u.id === me.id && <span className="muted small"> (you)</span>}
                  <div className="small muted show-sm">{u.email}<br /><span className="mono">{u.phone}</span></div></td>
                <td className="hide-sm small">{u.email}</td>
                <td className="hide-sm small mono">{u.phone}</td>
                <td>
                  <select className="input sm" style={{ width: "auto" }} value={u.role_key || ""}
                    onChange={(e) => change(u, { role_key: e.target.value || null, ...(u.status === "pending" && e.target.value ? { status: "active" } : {}) }, "Role updated")}>
                    <option value="">— no role —</option>
                    {roles.data.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </select>
                </td>
                <td>
                  {u.status === "pending" && <span className="badge warn">Waiting</span>}
                  {u.status === "active" && <span className="badge ok">Active</span>}
                  {u.status === "disabled" && <span className="badge bad">Disabled</span>}
                  {u.id !== me.id && (
                    <div style={{ marginTop: 4 }}>
                      {u.status !== "disabled"
                        ? <button className="btn sm ghost" onClick={() => change(u, { status: "disabled" }, "Access removed")}>Disable</button>
                        : <button className="btn sm ghost" onClick={() => change(u, { status: "active" }, "Access restored")} disabled={!u.role_key}>Enable</button>}
                    </div>
                  )}
                </td>
                <td className="hide-sm small muted">{when(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head"><h2>Pre-approved (not signed up yet)</h2></div>
        {invites.loading ? <Loading /> : invites.data?.length ? (
          <table className="t"><tbody>
            {invites.data.map((i) => (
              <tr key={i.id}>
                <td>{i.email || ""}{i.email && i.phone ? " · " : ""}<span className="mono">{i.phone || ""}</span></td>
                <td>{roles.data.find((r) => r.key === i.role_key)?.name}</td>
                <td className="num"><button className="btn sm ghost" onClick={async () => { await api.deleteInvitation(i.id); invites.reload(); }}><Icon name="trash" /></button></td>
              </tr>
            ))}
          </tbody></table>
        ) : <div className="empty small">When someone signs up with a pre-approved email or mobile, they get their role straight away.</div>}
      </div>

      {inviting && <InviteModal roles={roles.data} onClose={() => setInviting(false)} onDone={() => { invites.reload(); toast("Pre-approved"); }} />}
    </div>
  );
}

function InviteModal({ roles, onClose, onDone }) {
  const [f, setF] = useState({ email: "", phone: "", role_key: "staff" });
  const [err, setErr] = useState("");
  return (
    <Modal title="Pre-approve someone" onClose={onClose}>
      <div className="muted small">Share the app link with them. When they create an account with this email or mobile, they're let in with the role below.</div>
      <label className="field">Email<input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label className="field">Mobile<input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      <label className="field">Role
        <select className="input" value={f.role_key} onChange={(e) => setF({ ...f, role_key: e.target.value })}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </label>
      {err && <div className="alert err">{err}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => {
          if (f.email && !isEmail(f.email)) return setErr("Email looks wrong");
          if (f.phone && !isPhone(f.phone)) return setErr("Mobile looks wrong");
          if (!f.email && !f.phone) return setErr("Enter an email or a mobile");
          try { await api.invite(f); onDone(); onClose(); } catch (e) { setErr(e.message); }
        }}>Save</button>
      </div>
    </Modal>
  );
}

function Roles({ reloadMe }) {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.listRoles());
  const [adding, setAdding] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const toggle = async (r, p, on) => {
    try { await api.setRolePermission(r.key, p, on); reload(); reloadMe(); } catch (e) { toast(e.message, "err"); }
  };
  return (
    <div className="stack">
      <div className="card table-wrap">
        <div className="card-head"><h2>What each role can do</h2><button className="btn sm" onClick={() => setAdding(true)}><Icon name="plus" /> New role</button></div>
        <table className="t perm-grid">
          <thead><tr><th>Permission</th>{data.map((r) => <th key={r.key} title={r.description}>{r.name}</th>)}</tr></thead>
          <tbody>
            {PERMISSIONS.map(([p, label]) => (
              <tr key={p}>
                <td>{label}<div className="muted small mono">{p}</div></td>
                {data.map((r) => {
                  const locked = r.key === "admin";
                  return (
                    <td key={r.key}>
                      <input type="checkbox" style={{ width: 18, height: 18, accentColor: "var(--brand)" }} checked={r.permissions.includes(p)} disabled={locked}
                        title={locked ? "Admin always has every permission" : ""} onChange={(e) => toggle(r, p, e.target.checked)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted small">Changes apply immediately and are recorded in the audit log. Admin is locked so nobody can lock everyone out.</div>
      {adding && <NewRole onClose={() => setAdding(false)} onDone={reload} />}
    </div>
  );
}

function NewRole({ onClose, onDone }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState("");
  return (
    <Modal title="New role" onClose={onClose}>
      <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accountant" /></label>
      <label className="field">Description<input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      {err && <div className="alert err">{err}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!name.trim()} onClick={async () => {
          const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
          try { await api.saveRole({ key, name: name.trim(), description: desc.trim() }); onDone(); onClose(); } catch (e) { setErr(e.message); }
        }}>Create</button>
      </div>
    </Modal>
  );
}

function Settings() {
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.getSettings());
  if (loading && !data) return <Loading />;
  const neg = data.allow_negative_stock === true || data.allow_negative_stock === "true";
  return (
    <div className="card card-pad stack">
      <label className="check">
        <input type="checkbox" checked={neg} onChange={async (e) => { try { await api.setSetting("allow_negative_stock", e.target.checked); toast("Saved"); reload(); } catch (er) { toast(er.message, "err"); } }} />
        Allow selling more than the system shows in stock
      </label>
      <div className="muted small">Off (recommended): a sale that would take stock below zero is blocked, which catches typing mistakes and missing invoices early.</div>
    </div>
  );
}
