// ============================================================
// UI.JSX — Utility components
// ============================================================

import {
  useEffect, useState, useMemo, useCallback,
  useRef, createContext, useContext,
} from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2, Clock3, XCircle, AlertTriangle, Eye, Pencil, Trash2, Clock, ChefHat, Truck, Info, Package, Ban, CalendarX, Inbox, ShoppingBag, Search, UtensilsCrossed, FileQuestion, Gift, Wallet,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";

// ============================================================
// MONEY FORMAT
// ============================================================

export function money(n) {
  const num = Number(n);
  const safe = isFinite(num) ? num : 0;
  return safe.toLocaleString("vi-VN") + "đ";
}

// ============================================================
// THEME CONTEXT
// ============================================================

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark-mode")
      ? "dark"
      : "light";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => {
      const isDark = document.documentElement.classList.contains("dark-mode");
      setTheme(isDark ? "dark" : "light");
    };

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("themechange", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("themechange", update);
    };
  }, []);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() {
  return useContext(ThemeContext);
}

// ============================================================
// STATUS BADGE
// ============================================================

const STATUS_MAP = {
  light: {
    success: { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
    warning: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
    pending: { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
    info:    { bg: "#cffafe", color: "#0e7490", border: "#67e8f9" },
    danger:  { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
    neutral: { bg: "#e2e8f0", color: "#334155", border: "#cbd5e1" },
    purple:  { bg: "#ede9fe", color: "#6d28d9", border: "#c4b5fd" },
  },
  dark: {
    success: { bg: "#065f46", color: "#d1fae5", border: "#10b981" },
    warning: { bg: "#92400e", color: "#fef3c7", border: "#f59e0b" },
    pending: { bg: "#1e40af", color: "#dbeafe", border: "#3b82f6" },
    info:    { bg: "#0e7490", color: "#cffafe", border: "#06b6d4" },
    danger:  { bg: "#991b1b", color: "#fee2e2", border: "#ef4444" },
    neutral: { bg: "#475569", color: "#f1f5f9", border: "#64748b" },
    purple:  { bg: "#5b21b6", color: "#ede9fe", border: "#8b5cf6" },
  },
};

const STATUS_CONFIG = {
  "Chờ xác nhận":  { type: "pending", Icon: Clock },
  "Đã xác nhận":   { type: "info",    Icon: CheckCircle2 },
  "Đang chuẩn bị": { type: "purple",  Icon: ChefHat },
  "Sẵn sàng nhận": { type: "info",    Icon: Truck },
  "Hoàn thành":    { type: "success", Icon: CheckCircle2 },
  "Đã hủy":        { type: "danger",  Icon: XCircle },
  "Hoạt động":     { type: "success", Icon: CheckCircle2 },
  "Bị khóa":       { type: "danger",  Icon: Ban },
  "Còn hàng":      { type: "success", Icon: Package },
  "Sắp hết":       { type: "warning", Icon: AlertTriangle },
  "Hết hàng":      { type: "danger",  Icon: Package },
  "Đúng giờ":      { type: "success", Icon: CheckCircle2 },
  "Đi muộn":       { type: "warning", Icon: Clock3 },
  "Về sớm":        { type: "info",    Icon: Clock3 },
  "Vắng mặt":      { type: "danger",  Icon: CalendarX },
  "Chờ duyệt":     { type: "pending", Icon: Clock },
  "Thành công":    { type: "success", Icon: CheckCircle2 },
  "Từ chối":       { type: "danger",  Icon: XCircle },
};

const FALLBACK = { type: "neutral", Icon: Info };

/**
 * StatusBadge — nhận `statusKey` (i18n key) để dịch.
 * Nếu caller truyền `status` (raw text) thì vẫn hoạt động như cũ.
 */
export function StatusBadge({ status, statusKey }) {
  const { t } = useI18n();
  const ctxTheme = useTheme();
  const hasProvider = ctxTheme !== null;

  const [fallbackTheme, setFallbackTheme] = useState(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark-mode")
      ? "dark"
      : "light";
  });

  useEffect(() => {
    if (hasProvider) return;
    if (typeof window === "undefined") return;

    const update = () => {
      const isDark = document.documentElement.classList.contains("dark-mode");
      setFallbackTheme(isDark ? "dark" : "light");
    };

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("themechange", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("themechange", update);
    };
  }, [hasProvider]);

  const theme = hasProvider ? ctxTheme : fallbackTheme;

  // Nhận status thật (đã dịch) để tra bảng
  const displayStatus = statusKey ? t(statusKey) : status;

  const config = useMemo(
    () => STATUS_CONFIG[displayStatus] || FALLBACK,
    [displayStatus]
  );

  const colors = STATUS_MAP[theme] || STATUS_MAP.light;
  const c = colors[config.type] || colors.neutral;
  const Icon = config.Icon;

  return (
    <span
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "5px 12px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        backgroundColor: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        WebkitTextFillColor: c.color,
      }}
    >
      {Icon && <Icon size={12} />}
      {displayStatus}
    </span>
  );
}

// ============================================================
// MODAL
// ============================================================

const MODAL_Z = 2147483600;

export function Modal({ title, children, onClose, maxWidth = 480 }) {
  const { t } = useI18n();
  const overlayRef = useRef(null);
  const mouseDownTargetRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleMouseDown = useCallback((e) => {
    mouseDownTargetRef.current = e.target;
  }, []);

  const handleMouseUp = useCallback(
    (e) => {
      if (
        e.target === e.currentTarget &&
        mouseDownTargetRef.current === e.currentTarget
      ) {
        onClose?.();
      }
      mouseDownTargetRef.current = null;
    },
    [onClose]
  );

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : t("common.modal")}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: MODAL_Z,
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
            gap: 10,
          }}
        >
          <h3
            style={{
              margin: 0,
              color: "var(--text-primary, #172033)",
              fontSize: 16,
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            type="button"
            aria-label={t("common.close")}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--text-light, #8993a3)",
              padding: 4,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <XCircle size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

const EMPTY_SIZE_CONFIG = {
  sm: {
    padding: "24px 16px",
    iconSize: 28,
    iconBox: 52,
    titleSize: 14,
    descSize: 12,
    gap: 8,
    radius: 12,
  },
  md: {
    padding: "40px 24px",
    iconSize: 36,
    iconBox: 68,
    titleSize: 15,
    descSize: 13,
    gap: 10,
    radius: 14,
  },
  lg: {
    padding: "56px 32px",
    iconSize: 48,
    iconBox: 92,
    titleSize: 18,
    descSize: 13.5,
    gap: 14,
    radius: 16,
  },
};

export function Empty({
  text,
  title,
  description,
  icon,
  size = "md",
  action,
  iconColor,
  style,
}) {
  const { t } = useI18n();

  const finalTitle = title || text || t("common.emptyDefault");
  const showDescription = !!description;

  const cfg = EMPTY_SIZE_CONFIG[size] || EMPTY_SIZE_CONFIG.md;

  const iconNode = useMemo(() => {
    if (!icon) return <Inbox size={cfg.iconSize} />;

    if (typeof icon === "function") {
      const IconComp = icon;
      return <IconComp size={cfg.iconSize} />;
    }

    if (typeof icon === "object" && icon.type) {
      return icon;
    }

    return <Inbox size={cfg.iconSize} />;
  }, [icon, cfg.iconSize]);

  const finalIconColor = iconColor || "var(--text-light, #94a3b8)";

  const renderAction = () => {
    if (!action || !action.label) return null;

    const variantStyles = {
      primary: {
        background: "#2634d5",
        color: "#fff",
        border: "none",
        boxShadow: "0 4px 12px rgba(38, 52, 213, 0.25)",
      },
      outline: {
        background: "var(--card-bg, #fff)",
        color: "var(--text-primary, #172033)",
        border: "1px solid var(--border-color, #e5e9ef)",
      },
      ghost: {
        background: "transparent",
        color: "#2634d5",
        border: "none",
      },
    };

    const variant = variantStyles[action.variant] || variantStyles.primary;

    const baseStyle = {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "10px 20px",
      borderRadius: 10,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      textDecoration: "none",
      transition: "all 0.2s",
      marginTop: 6,
      ...variant,
    };

    if (action.to) {
      return (
        <Link to={action.to} style={baseStyle}>
          {action.icon}
          {action.label}
        </Link>
      );
    }

    if (action.onClick) {
      return (
        <button
          type="button"
          onClick={action.onClick}
          style={baseStyle}
        >
          {action.icon}
          {action.label}
        </button>
      );
    }

    return null;
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: cfg.padding,
        gap: cfg.gap,
        color: "var(--text-muted, #64748b)",
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: cfg.radius,
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: cfg.iconBox,
          height: cfg.iconBox,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: "var(--bg-tertiary, #f5f7fb)",
          color: finalIconColor,
          marginBottom: showDescription ? 4 : 0,
        }}
      >
        {iconNode}
      </div>

      <div
        style={{
          fontSize: cfg.titleSize,
          fontWeight: 700,
          color: "var(--text-primary, #172033)",
          lineHeight: 1.4,
          maxWidth: 400,
        }}
      >
        {finalTitle}
      </div>

      {showDescription && (
        <div
          style={{
            fontSize: cfg.descSize,
            color: "var(--text-light, #8993a3)",
            lineHeight: 1.5,
            maxWidth: 420,
          }}
        >
          {description}
        </div>
      )}

      {renderAction()}
    </div>
  );
}

// ============================================================
// TABLE ACTIONS
// ============================================================

export function TableActions({ onView, onEdit, onDelete }) {
  const { t } = useI18n();

  const btnStyle = {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: "1px solid var(--border-color, #e5e9ef)",
    background: "var(--card-bg, #fff)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    color: "var(--text-muted, #475569)",
    transition: "all 0.15s",
  };

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {onView && (
        <button
          type="button"
          style={btnStyle}
          onClick={onView}
          title={t("common.view")}
          aria-label={t("common.view")}
        >
          <Eye size={16} />
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          style={btnStyle}
          onClick={onEdit}
          title={t("common.edit")}
          aria-label={t("common.edit")}
        >
          <Pencil size={16} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          style={{ ...btnStyle, color: "#ef4444" }}
          onClick={onDelete}
          title={t("common.delete")}
          aria-label={t("common.delete")}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

export const EmptyIcons = {
  Inbox,
  Cart: ShoppingBag,
  Search,
  Menu: UtensilsCrossed,
  Question: FileQuestion,
  Gift,
  Wallet,
  Package,
  Users: Inbox,
  Alert: AlertTriangle,
  Calendar: CalendarX,
};