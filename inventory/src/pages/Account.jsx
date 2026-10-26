import React, { useState } from "react";
import { api } from "../lib/api.js";
import { useToast, ErrorBox } from "../ui.jsx";
import { isEmail, isPhone, PERMISSIONS } from "../lib/constants.js";

export default function Account({ me, reloadMe }) {
  const toast = useToast();
  const [f, setF] = useState({ full_name: me.full_name, phone: me.phone, email: me.email, p1: "", p2: "" });
  const [err, setErr] = useState("");
  const run = async (fn) => { setErr(""); try { await fn(); } catch (e) { setErr(e.message); } };

  return (
    <>
      <div className="page-head"><div><h1>My account</h1><div className="muted">Keep your email and mobile current — both are used to sign in and to recover your password.</div></div></div>
      <div className="grid-2">
        <div className="card card-pad stack">
          <h2>Profile</h2>
          <label className="field">Full name<input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
          <label className="field">Mobile<input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <div><button className="btn primary" onClick={() => run(async () => {
            if (!isPhone(f.phone)) throw new Error("Enter a valid mobile number");
            await api.updateMyProfile(me.id, { full_name: f.full_name.trim(), phone: f.phone });
            toast("Profile saved"); reloadMe();
          })}>Save profile</button></div>
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%" }} />
          <label className="field">Email<input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <div><button className="btn" disabled={f.email === me.email} onClick={() => run(async () => {
            if (!isEmail(f.email)) throw new Error("Enter a valid email");
            await api.updateEmail(f.email.trim());
            toast(api.mode === "demo" ? "Email changed" : "Check both inboxes to confirm the change"); reloadMe();
          })}>Change email</button></div>
        </div>
        <div className="stack">
          <div className="card card-pad stack">
            <h2>Password</h2>
            <label className="field">New password<input className="input" type="password" autoComplete="new-password" value={f.p1} onChange={(e) => setF({ ...f, p1: e.target.value })} /></label>
            <label className="field">Repeat<input className="input" type="password" autoComplete="new-password" value={f.p2} onChange={(e) => setF({ ...f, p2: e.target.value })} /></label>
            <div><button className="btn" disabled={!f.p1} onClick={() => run(async () => {
              if (f.p1.length < 8) throw new Error("At least 8 characters");
              if (f.p1 !== f.p2) throw new Error("Passwords don't match");
              await api.updatePassword(f.p1); setF({ ...f, p1: "", p2: "" }); toast("Password changed");
            })}>Change password</button></div>
          </div>
          <div className="card card-pad stack">
            <h2>My access</h2>
            <div>Role: <b>{me.role_key}</b></div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {PERMISSIONS.filter(([p]) => me.permissions.includes(p)).map(([p, l]) => <li key={p}>{l}</li>)}
            </ul>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}><ErrorBox error={err} /></div>
    </>
  );
}
