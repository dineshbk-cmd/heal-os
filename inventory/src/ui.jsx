import React, { useEffect, useState, useCallback, createContext, useContext } from "react";

// ── Icons (inline, stroke) ─────────────────────────────
const P = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  out: "M5 12h14M13 6l6 6-6 6",
  count: "M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  user: "M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  menu: "M4 6h16M4 12h16M4 18h16",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  alert: "M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};
export function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#14532d" />
      <path d="M8 12l8-4 8 4v9l-8 4-8-4z M8 12l8 4 8-4 M16 16v9" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

// ── Toasts ─────────────────────────────────────────────
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const show = useCallback((msg, kind = "ok") => {
    setT({ msg, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), t.kind === "err" ? 6000 : 3200);
    return () => clearTimeout(h);
  }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={"toast " + (t.kind === "err" ? "err" : "")} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

// Load data with loading/error state and a reload function
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await fn(), loading: false, error: null });
    } catch (e) {
      setState({ data: null, loading: false, error: e.message || String(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function Drawer({ title, sub, onClose, children, actions }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-label={typeof title === "string" ? title : undefined}>
        <div className="drawer-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && <div className="muted small">{sub}</div>}
          </div>
          {actions}
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose }) {
  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="row between"><h2>{title}</h2><button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        {children}
      </div>
    </div>
  );
}

// Ask for a reason (used for undo / void / adjustments)
export function ReasonModal({ title, text, confirmLabel = "Confirm", danger, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      {text && <div className="muted">{text}</div>}
      <label className="field">Reason (saved in history)
        <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </label>
      {err && <div className="alert err">{err}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={"btn " + (danger ? "danger" : "primary")} disabled={!reason.trim() || busy}
          onClick={async () => { setBusy(true); setErr(""); try { await onConfirm(reason.trim()); onClose(); } catch (e) { setErr(e.message); setBusy(false); } }}>
          {busy ? "Saving…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Thumb({ src, name, lg }) {
  if (src) return <img className={"thumb" + (lg ? " lg" : "")} src={src} alt="" loading="lazy" />;
  const ini = (name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  return <div className={"thumb ph" + (lg ? " lg" : "")}>{ini}</div>;
}

export function Search({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="search grow" style={{ minWidth: 180 }}>
      <Icon name="search" />
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export const Loading = () => <div className="empty">Loading…</div>;
export const ErrorBox = ({ error }) => (error ? <div className="alert err">{error}</div> : null);

// Product picker: type to search by name / SKU / barcode
export function ProductPicker({ products, onPick, exclude = [] }) {
  const [q, setQ] = useState("");
  const list = q.trim()
    ? products.filter((p) => p.active && !exclude.includes(p.id) && match(p, q)).slice(0, 30)
    : [];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <Search value={q} onChange={setQ} placeholder="Add product — type name, SKU or scan barcode" />
      {q.trim() && (
        <div className="pick-list">
          {list.length === 0 && <div className="empty small">No matching products</div>}
          {list.map((p) => (
            <button key={p.id} onClick={() => { onPick(p); setQ(""); }}>
              <Thumb src={p.image_url} name={p.name} />
              <span className="grow"><b>{p.name}</b><br /><span className="muted small mono">{p.sku}</span></span>
              <span className="badge">{Number(p.on_hand)} in stock</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function match(p, q) {
  const s = q.trim().toLowerCase();
  return [p.name, p.sku, p.barcode, p.category, p.pack].some((v) => v && String(v).toLowerCase().includes(s));
}
