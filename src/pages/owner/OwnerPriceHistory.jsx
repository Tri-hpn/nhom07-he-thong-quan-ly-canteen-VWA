// ============================================================
// OWNERPRICEHISTORY.JSX — Lịch sử thay đổi giá (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// 🔧 FIX #90: datetime dùng Intl.DateTimeFormat cố định (VN, 24h)
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  TrendingUp, TrendingDown, Search, Calendar, X, Loader2, AlertCircle, History, Minus,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { useI18n } from "../../hooks/useI18n";
import { SkeletonStats } from "../../components/Skeleton";

// ============================================================
// CONSTANTS
// ============================================================

const DATALIST_ID = "price-history-menu-items";

// 🔧 FIX #90: formatter cố định VN timezone, 24h
const DATETIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const thStyle = {
  padding: 11,
  textAlign: "left",
  fontSize: 12,
  color: "var(--text-muted, #64748b)",
  fontWeight: 600,
};

const tdStyle = {
  padding: 11,
  fontSize: 13,
  color: "var(--text-primary, #172033)",
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerPriceHistory() {
  const { t } = useI18n();

  // ---------- Data ----------
  const [history, setHistory] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---------- Filter ----------
  const [filterText, setFilterText] = useState("");

  // Race-safe
  const reqIdRef = useRef(0);

  // ---------- Load menu (1 lần) — cho datalist suggest ----------
  useEffect(() => {
    let cancelled = false;
    api.menu
      .list("", "Tất cả", "popular")
      .then((d) => !cancelled && setMenu(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setMenu([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Load ALL history (race-safe) ----------
  const loadHistory = useCallback(async () => {
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

  // ---------- Computed (memo) ----------

  // ✅ Filter client theo tên món (partial match)
  const filtered = useMemo(() => {
    if (!filterText.trim()) return history;
    const s = filterText.toLowerCase().trim();
    return history.filter((h) =>
      h.menu_item_name?.toLowerCase().includes(s)
    );
  }, [history, filterText]);

  const stats = useMemo(() => {
    let up = 0;
    let down = 0;
    let unchanged = 0;
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

  // 🔧 FIX #90: helper format datetime VN
  const fmtDateTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return DATETIME_FORMATTER.format(d);
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div>
      {/* ============================================================
          STATS
          ============================================================ */}
      {loading ? (
        <div style={{ marginBottom: 20 }}>
          <SkeletonStats
            count={3}
            columns="repeat(auto-fit, minmax(200px, 1fr))"
          />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <StatCard
            icon={<History size={20} />}
            label={t("Tổng lần đổi giá")}
            value={stats.total}
            color="#2634d5"
          />
          <StatCard
            icon={<TrendingUp size={20} />}
            label={t("Tăng giá")}
            value={stats.up}
            color="#ef4444"
          />
          <StatCard
            icon={<TrendingDown size={20} />}
            label={t("Giảm giá")}
            value={stats.down}
            color="#18a967"
          />
        </div>
      )}

      {/* ============================================================
          FILTERS
          ============================================================ */}
      <div
        style={{
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Search box với datalist suggest */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--bg-tertiary, #f5f7fb)",
            border: "1px solid var(--border-color, #e5e9ef)",
            borderRadius: 8,
            padding: "8px 12px",
            flex: 1,
            minWidth: 240,
            maxWidth: 400,
          }}
        >
          <Search size={16} style={{ color: "var(--text-light, #8993a3)" }} />
          <input
            list={DATALIST_ID}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setFilterText("");
            }}
            placeholder={t("Gõ hoặc chọn tên món...")}
            aria-label={t("Tìm theo tên món")}
            style={{
              border: 0,
              outline: "none",
              background: "transparent",
              color: "var(--text-primary, #172033)",
              fontSize: 13,
              flex: 1,
              minWidth: 0,
            }}
          />
          {filterText && (
            <button
              onClick={() => setFilterText("")}
              style={clearBtnStyle}
              aria-label={t("Xoá tìm kiếm")}
              type="button"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Datalist suggest từ tên món */}
        <datalist id={DATALIST_ID}>
          {menu.map((m) => (
            <option
              key={m.id || m._id}
              value={m.name}
            />
          ))}
        </datalist>

        {/* Clear filters */}
        {hasFilter && (
          <button
            onClick={clearFilters}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "8px 12px",
              background: "transparent",
              border: "1px solid #ef4444",
              color: "#ef4444",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#ef4444";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#ef4444";
            }}
          >
            <X size={13} /> {t("Xoá lọc")}
          </button>
        )}

        {/* Counter */}
        <div
          style={{
            fontSize: 12,
            color: "var(--text-light, #8993a3)",
            marginLeft: "auto",
          }}
        >
          <b style={{ color: "var(--text-primary, #172033)" }}>
            {filtered.length}
          </b>{" "}
          {t("bản ghi")}
        </div>
      </div>

      {/* ============================================================
          HISTORY TABLE
          ============================================================ */}
      <div
        style={{
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: 16,
            color: "var(--text-primary, #172033)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 15,
          }}
        >
          <Calendar size={18} /> {t("Lịch sử thay đổi giá")} ({filtered.length})
        </h3>

        {/* Loading */}
        {loading && (
          <div style={loadingBoxStyle}>
            <Loader2
              size={26}
              style={{ animation: "spin 1s linear infinite", marginBottom: 10 }}
            />
            <div>{t("Đang tải lịch sử...")}</div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <ErrorBox message={error} onRetry={loadHistory} t={t} />
        )}

        {/* Data */}
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
                {filtered.map((h) => {
                  const oldPrice = h.old_price || 0;
                  const newPrice = h.new_price || 0;
                  const diff = newPrice - oldPrice;

                  // Percent: chia cho 0 → hiện "—"
                  const percent =
                    oldPrice > 0
                      ? Math.abs((diff / oldPrice) * 100)
                      : null;

                  // Direction
                  const isUp = diff > 0;
                  const isDown = diff < 0;
                  const isFlat = diff === 0;

                  // Color
                  const color = isUp
                    ? "#ef4444"
                    : isDown
                    ? "#18a967"
                    : "var(--text-muted, #64748b)";

                  return (
                    <tr
                      key={h.id}
                      style={{
                        borderBottom: "1px solid var(--border-color, #eef2f7)",
                      }}
                    >
                      {/* Thời gian — 🔧 FIX #90: dùng formatter cố định VN */}
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: 12,
                          color: "var(--text-muted, #64748b)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtDateTime(h.created_at)}
                      </td>

                      {/* Món ăn */}
                      <td style={tdStyle}>
                        <b>{h.menu_item_name || "—"}</b>
                      </td>

                      {/* Giá cũ */}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          color: "var(--text-muted, #64748b)",
                        }}
                      >
                        {money(oldPrice)}
                      </td>

                      {/* Giá mới */}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontWeight: 700,
                        }}
                      >
                        {money(newPrice)}
                      </td>

                      {/* Chênh lệch */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {isFlat ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              color: "var(--text-muted, #64748b)",
                              fontWeight: 600,
                            }}
                          >
                            <Minus size={14} /> {t("Không đổi")}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              color,
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isUp ? (
                              <TrendingUp size={14} />
                            ) : (
                              <TrendingDown size={14} />
                            )}
                            {isUp ? "+" : "−"}
                            {money(Math.abs(diff))}
                            {percent !== null && (
                              <span
                                style={{
                                  fontSize: 11,
                                  opacity: 0.85,
                                  marginLeft: 2,
                                }}
                              >
                                ({percent.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        )}
                      </td>

                      {/* Người đổi */}
                      <td style={tdStyle}>{h.changed_by || "—"}</td>

                      {/* Lý do */}
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: 12,
                          color: "var(--text-muted, #64748b)",
                          maxWidth: 200,
                        }}
                      >
                        {h.reason || "—"}
                      </td>
                    </tr>
                  );
                })}

                {!filtered.length && (
                  <tr>
                    <td
                      colSpan="7"
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "var(--text-light, #8993a3)",
                      }}
                    >
                      <History
                        size={36}
                        style={{ opacity: 0.35, marginBottom: 10 }}
                      />
                      <div>
                        {hasFilter
                          ? `${t("Không có bản ghi nào khớp")} "${filterText}"`
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

// ============================================================
// SUB-COMPONENTS
// ============================================================

function StatCard({ icon, label, value, color }) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        padding: 18,
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: color + "20",
          color,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <span style={{ fontSize: 12, color: "var(--text-light, #8993a3)" }}>
          {label}
        </span>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary, #172033)",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message, onRetry, t }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: 30,
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        borderRadius: 10,
        color: "#ef4444",
      }}
    >
      <AlertCircle size={26} style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {t("Không tải được dữ liệu")}
      </div>
      <div
        style={{ fontSize: 13, opacity: 0.85, marginBottom: onRetry ? 12 : 0 }}
      >
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "8px 16px",
            background: "#ef4444",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {t("Thử lại")}
        </button>
      )}
    </div>
  );
}

// ============================================================
// STYLE CONSTANTS
// ============================================================

const clearBtnStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 2,
  display: "grid",
  placeItems: "center",
};

const loadingBoxStyle = {
  textAlign: "center",
  padding: 40,
  color: "var(--text-light, #8993a3)",
};