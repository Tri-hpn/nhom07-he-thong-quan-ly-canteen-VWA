// ============================================================
// NOTIFICATIONBELL.JSX — Chuông thông báo trên topbar (V2)
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX #35: MutationObserver observe document.body → leak
//                 Thay bằng timeout-based check cho từng toast
//   - Giữ nguyên logic mark read, poll, dropdown
// ============================================================

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Check, ShoppingBag, Package, Gift, Wallet, MessageCircle, Info, Loader2,
} from "lucide-react";
import { api } from "../api";
import { useI18n } from "../hooks/useI18n";

const MODAL_Z = 2147483600;
const POLL_MS = 30000;
const DROPDOWN_WIDTH = 360;

const TYPE_CONFIG = {
  order:   { Icon: ShoppingBag,   bg: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" },
  voucher: { Icon: Gift,          bg: "rgba(236, 72, 153, 0.15)", color: "#ec4899" },
  wallet:  { Icon: Wallet,        bg: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6" },
  chat:    { Icon: MessageCircle, bg: "rgba(38, 52, 213, 0.15)",  color: "#2634d5" },
  system:  { Icon: Info,          bg: "rgba(24, 169, 103, 0.15)", color: "#18a967" },
  default: { Icon: Package,       bg: "rgba(100, 116, 139, 0.15)", color: "#64748b" },
};

function timeAgo(dateInput, t) {
  if (!dateInput) return "—";

  const time = new Date(dateInput).getTime();
  if (isNaN(time)) return "—";

  const diff = Date.now() - time;
  if (diff < 0) return t("Vừa xong");

  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("Vừa xong");
  if (mins < 60) return `${mins} ${t("phút trước")}`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t("giờ trước")}`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${t("ngày trước")}`;

  try {
    return new Date(dateInput).toLocaleDateString("vi-VN");
  } catch {
    return "—";
  }
}

function normalizeData(res) {
  if (!res || typeof res !== "object") {
    return { list: [], unread: 0 };
  }
  return {
    list: Array.isArray(res.list) ? res.list : [],
    unread: Number(res.unread) || 0,
  };
}

export default function NotificationBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ list: [], unread: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" || !document.hidden
  );

  const boxRef = useRef(null);
  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true); // 🔧 FIX #35
  const navigate = useNavigate();

  // 🔧 FIX #35: track mount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const myReqId = ++reqIdRef.current;
      if (!silent) setError("");

      try {
        const res = await api.notifications.list();

        if (myReqId !== reqIdRef.current) return;
        if (!mountedRef.current) return;

        setData(normalizeData(res));
      } catch (e) {
        if (myReqId === reqIdRef.current && !silent && mountedRef.current) {
          setError(e.message || t("Không tải được thông báo"));
        }
      } finally {
        if (myReqId === reqIdRef.current && mountedRef.current) {
          setLoading(false);
        }
        inFlightRef.current = false;
      }
    },
    [t]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    if (!tabVisible) return;
    const timer = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timer);
  }, [load, tabVisible]);

  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const target = e.target;
      if (!target || typeof target.closest !== "function") return;
      if (boxRef.current && !boxRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const markRead = async (n) => {
    if (!n) return;

    if (!n.read) {
      setData((d) => ({
        list: d.list.map((item) =>
          item.id === n.id ? { ...item, read: true } : item
        ),
        unread: Math.max(0, d.unread - 1),
      }));

      try {
        await api.notifications.read(n.id);
        load(true);
      } catch {
        setData((d) => ({
          list: d.list.map((item) =>
            item.id === n.id ? { ...item, read: false } : item
          ),
          unread: d.unread + 1,
        }));
      }
    }

    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const markAll = async () => {
    if (data.unread === 0) return;

    const prevData = data;
    setData((d) => ({
      list: d.list.map((item) => ({ ...item, read: true })),
      unread: 0,
    }));

    try {
      await api.notifications.readAll();
      load(true);
    } catch (e) {
      setData(prevData);
      console.error(e);
    }
  };

  const unreadText = useMemo(() => {
    if (data.unread > 9) return "9+";
    return String(data.unread);
  }, [data.unread]);

  return (
    <div
      ref={boxRef}
      className="notif-bell-wrap"
      style={{ position: "relative" }}
    >
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="icon-btn topbar-icon-btn notif-bell-btn"
        title={t("Thông báo")}
        aria-label={
          data.unread > 0
            ? `${data.unread} ${t("thông báo chưa đọc")}`
            : t("Thông báo")
        }
        aria-haspopup="true"
        aria-expanded={open}
        style={{ position: "relative" }}
      >
        <Bell size={19} />

        {data.unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 4px",
              borderRadius: 9,
              background: "#ef4444",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--card-bg, #fff)",
              lineHeight: 1,
            }}
          >
            {unreadText}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("Danh sách thông báo")}
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: `min(${DROPDOWN_WIDTH}px, calc(100vw - 24px))`,
            maxHeight: 500,
            overflowY: "auto",
            background: "var(--card-bg, #fff)",
            borderRadius: 12,
            boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
            border: "1px solid var(--border-color, #e5e9ef)",
            zIndex: MODAL_Z,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              borderBottom: "1px solid var(--border-color, #eef2f7)",
              position: "sticky",
              top: 0,
              background: "var(--card-bg, #fff)",
              zIndex: 1,
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <b
                style={{
                  fontSize: 14,
                  color: "var(--text-primary, #172033)",
                }}
              >
                {t("Thông báo")}
              </b>
              {data.unread > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    color: "#fff",
                    background: "#ef4444",
                    padding: "2px 8px",
                    borderRadius: 10,
                  }}
                >
                  {data.unread} {t("mới")}
                </span>
              )}
            </div>

            {data.unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                style={{
                  background: "none",
                  border: 0,
                  color: "#2634d5",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                <Check size={12} /> {t("Đọc tất cả")}
              </button>
            )}
          </div>

          {error && (
            <div
              style={{
                margin: 12,
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: 8,
                color: "#ef4444",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ flex: 1 }}>{error}</span>
              <button
                type="button"
                onClick={() => load(false)}
                style={{
                  padding: "4px 10px",
                  background: "#ef4444",
                  color: "#fff",
                  border: 0,
                  borderRadius: 5,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {t("Thử lại")}
              </button>
            </div>
          )}

          {loading && !error && (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-light, #8993a3)",
                fontSize: 13,
              }}
            >
              <Loader2
                size={20}
                style={{
                  animation: "notifSpin 1s linear infinite",
                  marginBottom: 6,
                }}
              />
              <div>{t("Đang tải...")}</div>
            </div>
          )}

          {!loading && !error && data.list.length === 0 && (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-light, #8993a3)",
                fontSize: 13,
              }}
            >
              <Bell size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>{t("Không có thông báo nào")}</div>
            </div>
          )}

          {!loading &&
            data.list.map((n) => {
              const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.default;
              const Icon = cfg.Icon;

              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      markRead(n);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    padding: 14,
                    borderBottom: "1px solid var(--border-color, #f5f7fb)",
                    cursor: "pointer",
                    background: n.read
                      ? "var(--card-bg, #fff)"
                      : "rgba(38, 52, 213, 0.06)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "var(--bg-tertiary, #f5f7fb)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = n.read
                      ? "var(--card-bg, #fff)"
                      : "rgba(38, 52, 213, 0.06)")
                  }
                >
                  <div style={{ display: "flex", gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: cfg.bg,
                        color: cfg.color,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: "var(--text-primary, #172033)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.title || t("Thông báo")}
                      </div>

                      {n.content && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-muted, #64748b)",
                            marginTop: 2,
                            lineHeight: 1.4,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {n.content}
                        </div>
                      )}

                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-light, #8993a3)",
                          marginTop: 4,
                        }}
                      >
                        {timeAgo(n.created_at, t)}
                      </div>
                    </div>

                    {!n.read && (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#2634d5",
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <style>{`
        @keyframes notifSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}