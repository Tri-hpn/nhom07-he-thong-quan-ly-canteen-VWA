// ============================================================
// CONFIRMDIALOG.JSX — Modal xác nhận (V2 - FIXED + i18n)
// ============================================================
// 🔧 FIX:
//   - M13: Thêm nút X đóng ở góc trên phải
//   - Extra: type="button" đầy đủ, nút X disabled khi loading
//
// 🌐 i18n: source-text tiếng Việt, tự dịch
// ============================================================

import { useEffect, useRef } from "react";
import { AlertTriangle, LogOut, Loader2, X } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

const MODAL_Z = 2147483600;

export default function ConfirmDialog({
  open,
  title,
  message = "",
  confirmText,
  cancelText,
  danger = false,
  loading = false,
  icon = null,
  onConfirm,
  onClose,
}) {
  const { t } = useI18n();
  const cancelRef = useRef(null);

  // Fallback default
  const finalTitle = title || t("Xác nhận");
  const finalConfirm = confirmText || t("Xác nhận");
  const finalCancel = cancelText || t("Hủy");

  // ESC để đóng
  useEffect(() => {
    if (!open) return;

    const handler = (e) => {
      if (e.key === "Escape" && !loading) onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, loading, onClose]);

  // Focus vào nút Cancel khi mở
  useEffect(() => {
    if (open) {
      // Delay 1 tick để element được render
      const timer = setTimeout(() => {
        cancelRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Lock scroll body khi mở
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (document.body.style.overflow === "hidden") {
        document.body.style.overflow = prev;
      }
    };
  }, [open]);

  if (!open) return null;

  const accent = danger ? "#ef4444" : "#2634d5";
  const softBg = danger ? "rgba(239, 68, 68, 0.12)" : "rgba(38, 52, 213, 0.1)";

  return (
    <div
      onClick={() => !loading && onClose?.()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: MODAL_Z,
        padding: 20,
        animation: "confirmFadeIn 0.15s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "var(--card-bg, #fff)",
          borderRadius: 16,
          padding: 24,
          paddingTop: 20,
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          animation: "confirmPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* 🔧 M13: Nút X đóng ở góc trên phải */}
        <button
          type="button"
          onClick={() => !loading && onClose?.()}
          disabled={loading}
          aria-label={t("Đóng")}
          title={t("Đóng")}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: 0,
            background: "transparent",
            color: "var(--text-light, #8993a3)",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: loading ? 0.4 : 1,
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.background =
                "var(--bg-tertiary, #f5f7fb)";
              e.currentTarget.style.color = "var(--text-primary, #172033)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-light, #8993a3)";
          }}
        >
          <X size={18} />
        </button>

        {/* Icon + Title + Message */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            marginBottom: 20,
            paddingRight: 32, /* tránh chồng lên nút X */
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: softBg,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon || <AlertTriangle size={24} />}
          </div>

          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <h3
              id="confirm-dialog-title"
              style={{
                margin: 0,
                marginBottom: message ? 8 : 0,
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text-primary, #172033)",
                lineHeight: 1.3,
              }}
            >
              {finalTitle}
            </h3>

            {message && (
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: "var(--text-muted, #64748b)",
                  whiteSpace: "pre-line",
                }}
              >
                {message}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              background: "var(--card-bg, #fff)",
              color: "var(--text-primary, #172033)",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 13.5,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background =
                  "var(--bg-tertiary, #f5f7fb)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--card-bg, #fff)";
            }}
          >
            {finalCancel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              background: loading ? "#94a3b8" : accent,
              color: "#fff",
              border: 0,
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13.5,
              cursor: loading ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "background 0.15s, transform 0.1s",
            }}
            onMouseDown={(e) => {
              if (!loading) e.currentTarget.style.transform = "scale(0.97)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {loading ? (
              <>
                <Loader2
                  size={14}
                  style={{ animation: "confirmSpin 1s linear infinite" }}
                />
                {t("Đang xử lý...")}
              </>
            ) : (
              finalConfirm
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes confirmFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes confirmPop {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes confirmSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export const LogoutIcon = <LogOut size={24} />;