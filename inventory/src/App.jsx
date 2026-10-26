import React, { useEffect, useState, useCallback } from "react";
import { api } from "./lib/api.js";
import { ToastProvider, Icon, Logo, Loading } from "./ui.jsx";
import Auth, { SetNewPassword } from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Stock from "./pages/Stock.jsx";
import Receive from "./pages/Receive.jsx";
import StockOut from "./pages/StockOut.jsx";
import Count from "./pages/Count.jsx";
import Purchases from "./pages/Purchases.jsx";
import History from "./pages/History.jsx";
import Team from "./pages/Team.jsx";
import Account from "./pages/Account.jsx";

// id, label, icon, permission (any of), component, show in mobile tab bar
const PAGES = [
  ["home", "Dashboard", "home", ["inventory.view"], Dashboard, true],
  ["stock", "Stock", "box", ["inventory.view"], Stock, true],
  ["receive", "Receive / Import", "upload", ["stock.in", "products.edit"], Receive, true],
  ["out", "Stock out", "out", ["stock.out", "stock.adjust"], StockOut, true],
  ["count", "Stock count", "count", ["stock.adjust"], Count, false],
  ["purchases", "Purchases", "receipt", ["purchases.view"], Purchases, false],
  ["history", "History", "history", ["inventory.view", "audit.view"], History, false],
  ["team", "Team & roles", "users", ["users.manage"], Team, false],
  ["account", "My account", "user", [], Account, false],
];

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function Root() {
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);
  const [me, setMe] = useState(null);

  const loadMe = useCallback(async () => {
    try { setMe(await api.me()); } catch { setMe(null); }
  }, []);

  useEffect(() => {
    api.getSession().then(setSession);
    return api.onAuthChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
  }, []);
  useEffect(() => {
    if (session) loadMe();
    else setMe(null);
  }, [session, loadMe]);

  if (session === undefined) return <Loading />;
  if (recovery && session) return <SetNewPassword onDone={() => setRecovery(false)} />;
  if (!session) return <Auth />;
  if (!me) return <Loading />;
  if (me.status !== "active") return <Waiting me={me} />;
  return <Shell me={me} reloadMe={loadMe} />;
}

function Waiting({ me }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="row"><Logo /><h1>Almost there</h1></div>
        {me.status === "pending" ? (
          <p>Thanks {me.full_name || ""}. Your account is waiting for an admin to approve it and give you a role. Ask your admin to open <b>Team &amp; roles</b>.</p>
        ) : (
          <p>Your account has been disabled. Contact your admin if this is a mistake.</p>
        )}
        <div className="muted small">Signed in as {me.email} · {me.phone}</div>
        <div className="row">
          <button className="btn" onClick={() => location.reload()}>Check again</button>
          <button className="btn ghost" onClick={() => api.signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

function Shell({ me, reloadMe }) {
  const can = useCallback((p) => me.permissions.includes(p), [me]);
  const pages = PAGES.filter(([, , , need]) => need.length === 0 || need.some(can));
  const [page, setPage] = useState(() => {
    const h = location.hash.slice(1);
    return pages.some((p) => p[0] === h) ? h : pages[0][0];
  });
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = () => {
      const h = location.hash.slice(1);
      if (pages.some((p) => p[0] === h)) setPage(h);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [pages]);
  const go = (id) => { location.hash = id; setPage(id); setMenu(false); window.scrollTo(0, 0); };
  const current = pages.find((p) => p[0] === page) || pages[0];
  const Comp = current[4];
  const roleName = me.role_key ? me.role_key[0].toUpperCase() + me.role_key.slice(1) : "";

  const navBtn = ([id, label, icon]) => (
    <button key={id} className={"nav-btn" + (id === page ? " on" : "")} onClick={() => go(id)} aria-current={id === page ? "page" : undefined}>
      <Icon name={icon} /> <span>{label}</span>
    </button>
  );
  const mobileTabs = pages.filter((p) => p[5]).slice(0, 4);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><Logo /> Stock Room</div>
        {pages.map(navBtn)}
        <div className="side-foot">
          <div style={{ fontWeight: 600 }}>{me.full_name || me.email}</div>
          <div className="muted small">{roleName}</div>
          <button className="btn ghost sm" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => api.signOut()}><Icon name="logout" /> Sign out</button>
        </div>
      </aside>
      <header className="topbar">
        <div className="row"><Logo size={24} /><b>Stock Room</b></div>
        <span className="badge brand">{roleName}</span>
      </header>
      <main className="main">
        {api.mode === "demo" && (
          <div className="demo-bar">
            <b>Demo mode</b> — data is saved only in this browser. Connect Supabase (see README) to share it with your team.
            <button className="btn sm" onClick={() => { if (confirm("Erase all demo data and start again?")) api.reset(); }}>Reset demo</button>
          </div>
        )}
        <Comp me={me} can={can} go={go} reloadMe={reloadMe} key={current[0]} />
      </main>
      <nav className="tabbar">
        {mobileTabs.map(([id, label, icon]) => (
          <button key={id} className={"nav-btn" + (id === page ? " on" : "")} onClick={() => go(id)}><Icon name={icon} />{label.split(" ")[0]}</button>
        ))}
        <button className={"nav-btn" + (!mobileTabs.some((t) => t[0] === page) ? " on" : "")} onClick={() => setMenu(true)}><Icon name="menu" />More</button>
      </nav>
      {menu && (
        <div className="menu-sheet" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="sheet">
            {pages.map(navBtn)}
            <button className="nav-btn" onClick={() => api.signOut()}><Icon name="logout" /> Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
