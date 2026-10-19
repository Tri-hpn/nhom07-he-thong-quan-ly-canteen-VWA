import { useEffect, useState } from "react";
import { History, X, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "../api";
import { money } from "./UI";

export default function PriceHistoryModal({ item, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const itemId = item._id || item.id;

    api.priceHistory.list(itemId)
      .then(data => {
        if (!cancelled) setHistory(Array.isArray(data) ? data : []);
      })
      .catch(e => {
        if (!cancelled) setError(e.message || "Không tải được lịch sử giá");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [item.id, item._id]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "grid", placeItems: "center", zIndex: 2147483600,
        padding: 20, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #fff)", borderRadius: 14, padding: 24,
          width: "100%", maxWidth: 800, maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "var(--text-primary, #172033)", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <History size={20} style={{ color: "#0EA5E9" }} /> Lịch sử thay đổi giá
          </h3>
          <button onClick={onClose} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-light, #8993a3)", padding: 4, display: "grid", placeItems: "center" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <b style={{ fontSize: 15, color: "var(--text-primary, #172033)" }}>{item.name}</b>
          <div style={{ fontSize: 12, color: "var(--text-light, #8993a3)", marginTop: 4 }}>
            Danh mục: {item.category} · Giá hiện tại: <b style={{ color: "#18a967" }}>{money(item.price)}</b>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
            <div>Đang tải lịch sử...</div>
          </div>
        )}

        {!loading && error && (
          <div style={{ background: "rgba(239, 68, 68, 0.08)", color: "#ef4444", padding: 16, borderRadius: 10, textAlign: "center" }}>
            <AlertCircle size={24} style={{ marginBottom: 8 }} />
            <div>{error}</div>
          </div>
        )}

        {!loading && !error && (
          <div style={{ overflowX: "auto", maxHeight: "60vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                  <th style={{ padding: 11, textAlign: "left", fontSize: 12, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>THỜI GIAN</th>
                  <th style={{ padding: 11, textAlign: "right", fontSize: 12, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>GIÁ CŨ</th>
                  <th style={{ padding: 11, textAlign: "right", fontSize: 12, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>GIÁ MỚI</th>
                  <th style={{ padding: 11, textAlign: "right", fontSize: 12, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>CHÊNH LỆCH</th>
                  <th style={{ padding: 11, textAlign: "left", fontSize: 12, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>NGƯỜI ĐỔI</th>
                  <th style={{ padding: 11, textAlign: "left", fontSize: 12, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>LÝ DO</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const oldPrice = h.old_price || 0;
                  const newPrice = h.new_price || 0;
                  const diff = newPrice - oldPrice;
                  const percent = oldPrice > 0 ? Math.abs((diff / oldPrice) * 100) : null;
                  const isUp = diff > 0;
                  const isDown = diff < 0;
                  const color = isUp ? "#ef4444" : isDown ? "#18a967" : "var(--text-muted, #64748b)";

                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}>
                      <td style={{ padding: 11, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                        {h.created_at ? new Date(h.created_at).toLocaleString("vi-VN") : "—"}
                      </td>
                      <td style={{ padding: 11, textAlign: "right", fontSize: 13, color: "var(--text-muted, #64748b)" }}>{money(oldPrice)}</td>
                      <td style={{ padding: 11, textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)" }}>{money(newPrice)}</td>
                      <td style={{ padding: 11, textAlign: "right", fontSize: 13 }}>
                        {diff === 0 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>
                            <Minus size={14} /> Không đổi
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {isUp ? "+" : "−"}{money(Math.abs(diff))}
                            {percent !== null && <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 2 }}>({percent.toFixed(1)}%)</span>}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 11, fontSize: 13, color: "var(--text-primary, #172033)" }}>{h.changed_by || "—"}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "var(--text-muted, #64748b)", maxWidth: 200 }}>{h.reason || "—"}</td>
                    </tr>
                  );
                })}
                {history.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
                      <History size={36} style={{ opacity: 0.35, marginBottom: 10 }} />
                      <div>Món này chưa có lịch sử thay đổi giá</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 16px", background: "var(--btn-primary, #2634d5)", color: "#fff", border: 0, borderRadius: 10, fontWeight: 600, cursor: "pointer", fontSize: 13, width: "100%", marginTop: 16 }}>
          Đóng
        </button>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}