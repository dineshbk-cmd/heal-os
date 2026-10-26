import React, { useState } from "react";
import { api } from "../lib/api.js";
import { Logo } from "../ui.jsx";
import { isEmail, isPhone, normalizePhone } from "../lib/constants.js";

export default function Auth() {
  const [tab, setTab] = useState("in");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ id: "", password: "", full_name: "", email: "", phone: "", password2: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const run = async (fn) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ kind: "err", text: e.message }); }
    setBusy(false);
  };

  const signIn = (e) => {
    e.preventDefault();
    run(async () => {
      if (!isEmail(f.id) && !isPhone(f.id)) throw new Error("Enter your email or 10-digit mobile number");
      await api.signIn(f.id, f.password);
    });
  };
  const signUp = (e) => {
    e.preventDefault();
    run(async () => {
      if (!f.full_name.trim()) throw new Error("Please enter your name");
      if (!isEmail(f.email)) throw new Error("Enter a valid email — it's used to reset your password");
      if (!isPhone(f.phone)) throw new Error("Enter a valid mobile number");
      if (f.password.length < 8) throw new Error("Password must be at least 8 characters");
      if (f.password !== f.password2) throw new Error("Passwords don't match");
      const r = await api.signUp({ full_name: f.full_name.trim(), email: f.email, phone: normalizePhone(f.phone), password: f.password });
      if (r.needsConfirmation) {
        setTab("in");
        setMsg({ kind: "ok", text: "Account created. Check your email and click the confirmation link, then sign in." });
      }
    });
  };
  const forgot = (e) => {
    e.preventDefault();
    run(async () => {
      if (!isEmail(f.id) && !isPhone(f.id)) throw new Error("Enter your email or mobile number");
      await api.requestReset(f.id);
      setMsg({ kind: "ok", text: api.mode === "demo"
        ? "Demo mode: no email is sent — you can set a new password now."
        : "If this account exists, a password reset link has been sent to its registered email." });
    });
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="row"><Logo size={36} /><div><h1>Stock Room</h1><div className="muted small">Inventory for your Empire Biz Corp stock</div></div></div>
        <div className="seg" role="tablist" style={{ width: "100%" }}>
          {[["in", "Sign in"], ["up", "Create account"], ["forgot", "Forgot password"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} style={{ flex: 1 }} onClick={() => { setTab(k); setMsg(null); }}>{l}</button>
          ))}
        </div>

        {tab === "in" && (
          <form className="stack" onSubmit={signIn}>
            <label className="field">Email or mobile number
              <input className="input" value={f.id} onChange={set("id")} autoComplete="username" placeholder="you@example.com or 98765 43210" autoFocus />
            </label>
            <label className="field">Password
              <input className="input" type="password" value={f.password} onChange={set("password")} autoComplete="current-password" />
            </label>
            <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        )}

        {tab === "up" && (
          <form className="stack" onSubmit={signUp}>
            <label className="field">Full name<input className="input" value={f.full_name} onChange={set("full_name")} autoComplete="name" /></label>
            <label className="field">Email <span className="hint">— for sign-in and password recovery</span>
              <input className="input" type="email" value={f.email} onChange={set("email")} autoComplete="email" />
            </label>
            <label className="field">Mobile number <span className="hint">— for sign-in and recovery</span>
              <input className="input" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="98765 43210" />
            </label>
            <div className="form-grid">
              <label className="field">Password<input className="input" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" /></label>
              <label className="field">Repeat password<input className="input" type="password" value={f.password2} onChange={set("password2")} autoComplete="new-password" /></label>
            </div>
            <button className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
            <div className="muted small">New accounts wait for an admin to approve them and assign a role. The very first account becomes the admin.</div>
          </form>
        )}

        {tab === "forgot" && (
          <form className="stack" onSubmit={forgot}>
            <label className="field">Email or mobile number
              <input className="input" value={f.id} onChange={set("id")} autoComplete="username" />
            </label>
            <button className="btn primary" disabled={busy}>Send reset link</button>
            <div className="muted small">The reset link goes to the email registered with your account, whichever one you type here.</div>
          </form>
        )}

        {msg && <div className={"alert " + msg.kind}>{msg.text}</div>}

        {api.mode === "demo" && tab === "in" && (
          <div className="alert info small">
            <b>Demo mode.</b> Try a role — password <span className="mono">demo1234</span>:
            <div className="row" style={{ marginTop: 6 }}>
              {[["Admin", "admin@demo.in"], ["Manager", "manager@demo.in"], ["Staff", "9800000003"], ["Viewer", "viewer@demo.in"]].map(([r, id]) => (
                <button key={r} className="btn sm" type="button" onClick={() => run(() => api.signIn(id, "demo1234"))}>{r}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SetNewPassword({ onDone }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={async (e) => {
        e.preventDefault();
        if (p1.length < 8) return setErr("Password must be at least 8 characters");
        if (p1 !== p2) return setErr("Passwords don't match");
        setBusy(true);
        try { await api.updatePassword(p1); onDone(); } catch (e2) { setErr(e2.message); setBusy(false); }
      }}>
        <div className="row"><Logo /><h1>Set a new password</h1></div>
        <label className="field">New password<input className="input" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" autoFocus /></label>
        <label className="field">Repeat<input className="input" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></label>
        {err && <div className="alert err">{err}</div>}
        <button className="btn primary" disabled={busy}>Save password</button>
      </form>
    </div>
  );
}
