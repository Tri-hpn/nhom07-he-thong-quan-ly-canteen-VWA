// ============================================================
// OWNERATTENDANCE.JSX — Bảng chấm công nhân viên (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// 🔧 FIX #85: fmtTime/fmtDate dùng Intl.DateTimeFormat cố định (VN, 24h)
// 🔧 Batch 11 FIX:
//   - Import getToken
//   - Guard loadAttendance() + api.attendance.employees() chống spam 401
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Calendar, Clock, TrendingUp, AlertTriangle, Search, X, Loader2, CalendarX,
} from "lucide-react";
import { api, getToken } from "../../api";
import { SkeletonTable, SkeletonStats } from "../../components/Skeleton";
import { useI18n } from "../../hooks/useI18n";

// ============================================================
// CONSTANTS
// ============================================================

const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const STATUS_KEY = {
  "Đúng giờ": "ontime",
  "Đi muộn": "late",
  "Về sớm": "early",
  "Vắng mặt": "absent",
};

const filterInputStyle = {
  padding: "8px 12px",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  outline: "none",
  fontSize: 13,
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
};

const filterSelectStyle = {
  ...filterInputStyle,
  cursor: "pointer",
};

const thStyle = {
  padding: 11,
  textAlign: "left",
  fontSize: 12,
  color: "var(--text-muted, #64748b)",
  fontWeight: 600,
};

const tdStyle = {
  padding: 11,
  color: "var(--text-primary, #172033)",
  fontSize: 13,
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerAttendance() {
  const { t } = useI18n();

  const [list, setList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState({
    month: new Date().toISOString().slice(0, 7),
    employee_id: "",
    status: "",
  });
  const [search, setSearch] = useState("");

  const loadAttendance = useCallback(async () => {
    if (!getToken()) return; // 🔧 Batch 11 FIX
    setLoading(true);
    setError("");
    try {
      const params = { month: filter.month };
      if (filter.employee_id) params.employee_id = filter.employee_id;
      const data = await api.attendance.all(params);
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || t("Không tải được dữ liệu chấm công"));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filter.month, filter.employee_id, t]);

  useEffect(() => {
    if (!getToken()) return; // 🔧 Batch 11 FIX
    api.attendance.employees().then(setEmployees).catch(() => {});
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const filtered = useMemo(() => {
    return list.filter((a) => {
      if (filter.status && a.status !== filter.status) return false;
      if (
        search &&
        !a.employee_name?.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [list, filter.status, search]);

  const stats = useMemo(
    () => ({
      total: filtered.length,
      onTime: filtered.filter((a) => a.status === "Đúng giờ").length,
      late: filtered.filter((a) => a.status === "Đi muộn").length,
      totalHours: filtered.reduce((s, a) => s + (a.hours || 0), 0),
    }),
    [filtered]
  );

  const hasFilter =
    filter.employee_id || filter.status || search.trim();

  const clearFilters = () => {
    setFilter((f) => ({ ...f, employee_id: "", status: "" }));
    setSearch("");
  };

  const fmtTime = (d) => {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return "—";
    return TIME_FORMATTER.format(date);
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "—";
    return DATE_FORMATTER.format(d);
  };

  return (
    <div>
      {loading ? (
        <div style={{ marginBottom: 20 }}>
          <SkeletonStats count={4} columns="repeat(4, 1fr)" />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <StatCard
            icon={<Calendar />}
            label={t("Tổng ngày công")}
            value={stats.total}
            color="#2634d5"
          />
          <StatCard
            icon={<TrendingUp />}
            label={t("Đúng giờ")}
            value={stats.onTime}
            color="#18a967"
          />
          <StatCard
            icon={<AlertTriangle />}
            label={t("Đi muộn")}
            value={stats.late}
            color="#f59e0b"
          />
          <StatCard
            icon={<Clock />}
            label={t("Tổng giờ làm")}
            value={stats.totalHours.toFixed(1) + "h"}
            color="#8b5cf6"
          />
        </div>
      )}

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={16} style={{ color: "var(--text-light, #8993a3)" }} />
          <input
            type="month"
            value={filter.month}
            onChange={(e) => setFilter((f) => ({ ...f, month: e.target.value }))}
            style={filterInputStyle}
          />
        </div>

        <select
          value={filter.employee_id}
          onChange={(e) =>
            setFilter((f) => ({ ...f, employee_id: e.target.value }))
          }
          style={filterSelectStyle}
        >
          <option value="">{t("Tất cả nhân viên")}</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>

        <select
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          style={filterSelectStyle}
        >
          <option value="">{t("Tất cả trạng thái")}</option>
          <option>{t("Đúng giờ")}</option>
          <option>{t("Đi muộn")}</option>
          <option>{t("Về sớm")}</option>
        </select>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg-tertiary, #f5f7fb)",
            border: "1px solid var(--border-color, #e5e9ef)",
            borderRadius: 8,
            padding: "8px 12px",
            flex: 1,
            maxWidth: 300,
          }}
        >
          <Search size={16} style={{ color: "var(--text-light, #8993a3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Tìm theo tên...")}
            style={{
              border: 0,
              outline: "none",
              background: "transparent",
              color: "var(--text-primary, #172033)",
              fontSize: 13,
              flex: 1,
            }}
          />
        </div>

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
              transition: "all 0.2s",
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
      </div>

      <div
        style={{
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "var(--text-light, #8993a3)",
            }}
          >
            <Loader2
              size={28}
              style={{
                animation: "spin 1s linear infinite",
                marginBottom: 12,
              }}
            />
            <div>{t("Đang tải dữ liệu...")}</div>
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "#ef4444",
              background: "#fde8e8",
              borderRadius: 10,
            }}
          >
            <AlertTriangle size={28} style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {t("Không tải được dữ liệu")}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{error}</div>
            <button
              onClick={loadAttendance}
              style={{
                marginTop: 12,
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
          </div>
        )}

        {!loading && !error && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                <th style={thStyle}>{t("Ngày")}</th>
                <th style={thStyle}>{t("Nhân viên")}</th>
                <th style={thStyle}>{t("Check-in")}</th>
                <th style={thStyle}>{t("Check-out")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("Giờ làm")}</th>
                <th style={thStyle}>{t("Trạng thái")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const statusKey = STATUS_KEY[a.status] || "neutral";
                const initials = (a.employee_name || "?")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <tr
                    key={a.id}
                    style={{
                      borderBottom: "1px solid var(--border-color, #eef2f7)",
                    }}
                  >
                    <td style={tdStyle}>
                      <b>{fmtDate(a.date)}</b>
                    </td>

                    <td style={tdStyle}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background:
                              "linear-gradient(135deg,#2634d5,#20c779)",
                            color: "#fff",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 700,
                            fontSize: 11,
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>
                        <b>{a.employee_name}</b>
                      </div>
                    </td>

                    <td style={tdStyle}>{fmtTime(a.checkIn)}</td>
                    <td
                      style={{
                        ...tdStyle,
                        color: "var(--text-muted, #64748b)",
                      }}
                    >
                      {fmtTime(a.checkOut)}
                    </td>

                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <b>{a.hours ? a.hours + "h" : "—"}</b>
                    </td>

                    <td style={tdStyle}>
                      <span className={`att-badge att-badge--${statusKey}`}>
                        {t(a.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--text-light, #8993a3)",
                    }}
                  >
                    <CalendarX
                      size={36}
                      style={{ opacity: 0.4, marginBottom: 10 }}
                    />
                    <div>
                      {list.length === 0
                        ? t("Không có dữ liệu chấm công trong tháng này")
                        : t("Không có bản ghi khớp bộ lọc")}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
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
          width: 44,
          height: 44,
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
            fontSize: 20,
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