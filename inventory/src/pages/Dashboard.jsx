import React from "react";
import { api } from "../lib/api.js";
import { useLoad, Loading, ErrorBox, Thumb, Icon } from "../ui.jsx";
import { inr, qtyFmt, when, KINDS } from "../lib/constants.js";

export default function Dashboard({ me, can, go }) {
  const { data, loading, error } = useLoad(async () => {
    const [products, moves] = await Promise.all([api.listProducts(), api.listMovements({ limit: 12 })]);
    return { products, moves };
  });
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { products, moves } = data;
  const active = products.filter((p) => p.active);
  const units = active.reduce((s, p) => s + Number(p.on_hand), 0);
  const value = active.reduce((s, p) => s + Number(p.stock_value || 0), 0);
  const low = active.filter((p) => p.low_stock).sort((a, b) => a.on_hand - b.on_hand);
  const out = active.filter((p) => Number(p.on_hand) <= 0);
  const noPrice = active.filter((p) => p.sell_price == null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello {me.full_name?.split(" ")[0] || ""}</h1>
          <div className="muted">Here's your stock at a glance.</div>
        </div>
        <div className="row">
          {can("stock.in") && <button className="btn primary" onClick={() => go("receive")}><Icon name="upload" /> Import invoice</button>}
          {can("stock.out") && <button className="btn" onClick={() => go("out")}><Icon name="out" /> Record sale</button>}
        </div>
      </div>

      {products.length === 0 && (
        <div className="card card-pad stack" style={{ marginBottom: 16 }}>
          <h2>Get started</h2>
          <div className="muted">Upload your first Empire Biz Corp invoice (PDF). Products, prices, photos and stock quantities are created from it automatically.</div>
          {can("stock.in") && <div><button className="btn primary" onClick={() => go("receive")}>Import first invoice</button></div>}
        </div>
      )}

      <div className="kpis">
        <div className="card kpi"><div className="label">Products</div><div className="value">{active.length}</div></div>
        <div className="card kpi"><div className="label">Units in stock</div><div className="value">{qtyFmt(units)}</div></div>
        {can("reports.view") && <div className="card kpi"><div className="label">Stock value (cost)</div><div className="value">{inr(value)}</div></div>}
        <div className="card kpi"><div className="label">Low / out of stock</div><div className="value" style={{ color: low.length ? "var(--accent)" : undefined }}>{low.length} <span className="muted small">/ {out.length} out</span></div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>Needs reordering</h2><button className="btn sm ghost" onClick={() => go("stock")}>All stock →</button></div>
          {low.length === 0 ? <div className="empty">Nothing is below its reorder level. Set reorder levels on each product to get alerts.</div> : (
            <div className="table-wrap"><table className="t"><tbody>
              {low.slice(0, 10).map((p) => (
                <tr key={p.id}>
                  <td style={{ width: 44 }}><Thumb src={p.image_url} name={p.name} /></td>
                  <td>{p.name}<div className="muted small mono">{p.sku}</div></td>
                  <td className="num"><span className={"badge " + (p.on_hand <= 0 ? "bad" : "warn")}>{qtyFmt(p.on_hand)} left</span><div className="muted small">reorder at {qtyFmt(p.reorder_level)}</div></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h2>Recent activity</h2><button className="btn sm ghost" onClick={() => go("history")}>History →</button></div>
          {moves.length === 0 ? <div className="empty">No stock movements yet.</div> : (
            <div className="table-wrap"><table className="t"><tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td>{m.product_name}<div className="muted small">{KINDS[m.kind]?.[0]} · {m.created_by_name || "—"} · {when(m.created_at)}</div></td>
                  <td className="num"><span className={m.qty > 0 ? "qty-in" : "qty-out"}>{m.qty > 0 ? "+" : ""}{qtyFmt(m.qty)}</span></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      </div>

      {can("products.edit") && noPrice.length > 0 && (
        <div className="alert warn" style={{ marginTop: 16 }}>
          {noPrice.length} product{noPrice.length > 1 ? "s have" : " has"} no selling price yet. Open <a href="#stock" onClick={() => go("stock")}>Stock</a> and set them, or bulk-update via a CSV in Receive / Import → Product list.
        </div>
      )}
    </>
  );
}
