// ============================================================
// OWNERPRICEHISTORY.JSX — Lịch sử thay đổi giá (Admin) (B9.7a)
// ============================================================
// B9.7a:
//   - Bug 1/2: formatter locale-aware qua useMemo
//   - Bug 3: key fallback
//   - Bug 5: object interpolation cho empty state
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  TrendingUp, TrendingDown, Search, Calendar, X, Loader2, AlertCircle, History, Minus,
} from "lucide-react";
import { api, getToken } from "../../api";
import { money } from "../../components/UI";
import { useI18n } from "../../hooks/useI18n";
import { SkeletonStats } from "../../components/Skeleton";

const DATALIST_ID = "price-history-menu-items";

const thStyle = {
  padding: 11, textAlign: "left", fontSize: 12,
  color: "var(--text-muted, #64748b)", fontWeight: 600,
};

const tdStyle = {
  padding: 11, fontSize: 13, color: "var(--text-primary, #172033)",
};

export default function OwnerPriceHistory() {
  const { t, locale } = useI18n();

  const [history, setHistory] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterText, setFilterText] = useState("");

  const reqIdRef = useRef(0);

  // 🔧 B9.7a — formatter locale-aware
  const dateTimeFmt = useMemo(() => {
    const loc = locale || "vi";
    const opts = {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    };
    try {
      return new Intl.DateTimeFormat(loc, opts);
    } catch {
      return new Intl.DateTimeFormat("en-GB", opts);
    }
  }, [locale]);

  // Load menu (datalist suggest)
  useEffect(() => {
    let cancelled = false;
    api.menu
      .list("", "Tất cả", "popular")
      .then((d) => !cancelled && setMenu(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setMenu([]));
    return () => { cancelled = true; };
  }, []);

  const loadHistory = useCallback(async () => {
    if (!getToken()) { setLoading(false); return; }
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setError("");

    try {
      const data = await api.priceHistory.list();
      if (myReqId !== reqIdRef.current) return;
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      if (myReqId !== reqIdRef.current) return;
      setError(e.message || t("Không tải được lịch sử giá"));
      setHistory([]);
    } finally {
      if (myReqId === reqIdRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filtered = useMemo(() => {
    if (!filterText.trim()) return history;
    const s = filterText.toLowerCase().trim();
    return history.filter((h) => h.menu_item_name?.toLowerCase().includes(s));
  }, [history, filterText]);

  const stats = useMemo(() => {
    let up = 0, down = 0, unchanged = 0;
    for (const h of filtered) {
      const diff = (h.new_price || 0) - (h.old_price || 0);
      if (diff > 0) up++;
      else if (diff < 0) down++;
      else unchanged++;
    }
    return { total: filtered.length, up, down, unchanged };
  }, [filtered]);

  const hasFilter = filterText.trim().length > 0;
  const clearFilters = () => setFilterText("");

  const fmtDateTime = useCallback((iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return dateTimeFmt.format(d);
  }, [dateTimeFmt]);

  return (
    <div>
      {loading ? (
        <div style={{ marginBottom: 20 }}>
          <SkeletonStats count={3} columns="repeat(auto-fit, minmax(200px, 1fr))" />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16, marginBottom: 20,
          }}
        >
          <StatCard icon={<History size={20} />} label={t("Tổng lần đổi giá")} value={stats.total} color="#2634d5" />
          <StatCard icon={<TrendingUp size={20} />} label={t("Tăng giá")} value={stats.up} color="#ef4444" />
          <StatCard icon={<TrendingDown size={20} />} label={t("Giảm giá")} value={stats.down} color="#18a967" />
        </div>
      )}

      <div
        style={{
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12, padding: 16, marginBottom: 16,
          display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--bg-tertiary, #f5f7fb)",
            border: "1px solid var(--border-color, #e5e9ef)",
            borderRadius: 8, padding: "8px 12px",
            flex: 1, minWidth: 240, maxWidth: 400,
          }}
        >
          <Search size={16} style={{ color: "var(--text-light, #8993a3)" }} />
          <input
            list={DATALIST_ID}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setFilterText(""); }}
            placeholder={t("Gõ hoặc chọn tên món...")}
            aria-label={t("Tìm theo tên món")}
            style={{
              border: 0, outline: "none", background: "transparent",
              color: "var(--text-primary, #172033)",
              fontSize: 13, flex: 1, minWidth: 0,
            }}
          />
          {filterText && (
            <button onClick={() => setFilterText("")} style={clearBtnStyle} aria-label={t("Xoá tìm kiếm")} type="button">
              <X size={14} />
            </button>
          )}
        </div>

        <datalist id={DATALIST_ID}>
          {menu.map((m) => (
            <option key={m.id || m._id} value={m.name} />
          ))}
        </datalist>

        {hasFilter && (
          <button
            onClick={clearFilters}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "8px 12px", background: "transparent",
              border: "1px solid #ef4444", color: "#ef4444",
              borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#ef4444"; }}
          >
            <X size={13} /> {t("Xoá lọc")}
          </button>
        )}

        <div style={{ fontSize: 12, color: "var(--text-light, #8993a3)", marginLeft: "auto" }}>
          <b style={{ color: "var(--text-primary, #172033)" }}>{filtered.length}</b>{" "}
          {t("bản ghi")}
        </div>
      </div>

      <div
        style={{
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12, padding: 20,
        }}
      >
        <h3
          style={{
            marginTop: 0, marginBottom: 16,
            color: "var(--text-primary, #172033)",
            display: "flex", alignItems: "center", gap: 8, fontSize: 15,
          }}
        >
          <Calendar size={18} /> {t("Lịch sử thay đổi giá")} ({filtered.length})
        </h3>

        {loading && (
          <div style={loadingBoxStyle}>
            <Loader2 size={26} style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
            <div>{t("Đang tải lịch sử...")}</div>
          </div>
        )}

        {!loading && error && (
          <ErrorBox message={error} onRetry={loadHistory} t={t} />
        )}

        {!loading && !error && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                  <th style={thStyle}>{t("Thời gian")}</th>
                  <th style={thStyle}>{t("Món ăn")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("Giá cũ")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("Giá mới")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("Chênh lệch")}</th>
                  <th style={thStyle}>{t("Người đổi")}</th>
                  <th style={thStyle}>{t("Lý do")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h, idx) => {
                  const oldPrice = h.old_price || 0;
                  const newPrice = h.new_price || 0;
                  const diff = newPrice - oldPrice;
                  const percent = oldPrice > 0 ? Math.abs((diff / oldPrice) * 100) : null;
                  const isUp = diff > 0;
                  const isDown = diff < 0;
                  const isFlat = diff === 0;
                  const color = isUp ? "#ef4444" : isDown ? "#18a967" : "var(--text-muted, #64748b)";

                  // 🔧 Bug 3: key fallback
                  const rowKey = h.id ?? `${h.menu_item_id}-${h.created_at}-${idx}`;

                  return (
                    <tr key={rowKey} style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}>
                      <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted, #64748b)", whiteSpace: "nowrap" }}>
                        {fmtDateTime(h.created_at)}
                      </td>
                      <td style={tdStyle}><b>{h.menu_item_name || "—"}</b></td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-muted, #64748b)" }}>
                        {money(oldPrice)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                        {money(newPrice)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {isFlat ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>
                            <Minus size={14} /> {t("Không đổi")}
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {isUp ? "+" : "−"}
                            {money(Math.abs(diff))}
                            {percent !== null && (
                              <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 2 }}>
                                ({percent.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>{h.changed_by || "—"}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted, #64748b)", maxWidth: 200 }}>
                        {h.reason || "—"}
                      </td>
                    </tr>
                  );
                })}

                {!filtered.length && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
                      <History size={36} style={{ opacity: 0.35, marginBottom: 10 }} />
                      <div>
                        {hasFilter
                          ? t('Không có bản ghi nào khớp "{q}"', { q: filterText })
                          : t("Chưa có lịch sử thay đổi giá")}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12, padding: 18,
        display: "flex", gap: 12, alignItems: "center",
      }}
    >
      <div
        style={{
          width: 46, height: 46, borderRadius: 12,
          background: color + "20", color,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <span style={{ fontSize: 12, color: "var(--text-light, #8993a3)" }}>{label}</span>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary, #172033)" }}>{value}</div>
      </div>
    </div>
  );
}

function ErrorBox({ message, onRetry, t }) {
  return (
    <div
      style={{
        textAlign: "center", padding: 30,
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        borderRadius: 10, color: "#ef4444",
      }}
    >
      <AlertCircle size={26} style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("Không tải được dữ liệu")}</div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: onRetry ? 12 : 0 }}>{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "8px 16px", background: "#ef4444", color: "#fff",
            border: 0, borderRadius: 8, cursor: "pointer",
            fontWeight: 600, fontSize: 13,
          }}
        >
          {t("Thử lại")}
        </button>
      )}
    </div>
  );
}

const clearBtnStyle = {
  background: "transparent", border: 0, cursor: "pointer",
  color: "var(--text-light, #8993a3)", padding: 2,
  display: "grid", placeItems: "center",
};

const loadingBoxStyle = {
  textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)",
};