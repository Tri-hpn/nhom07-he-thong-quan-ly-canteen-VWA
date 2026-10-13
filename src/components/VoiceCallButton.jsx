// ============================================================
// VoiceCallButton.jsx — Nút gọi khách nhận món + Modal
// ============================================================
// V1 (2026-10):
//   - Nút 📢 bấm → mở modal chọn hình thức gọi
//   - 3 hình thức: Tên khách / Số bàn / Mã đơn
//   - Preview nội dung sẽ đọc
//   - Nút "Gọi ngay" → gọi speak()
//   - Hiển thị trạng thái đang đọc
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Volume2, X, User, Hash, Coffee, Loader2, CheckCircle2, StopCircle,
} from "lucide-react";
import { useVoiceAnnouncer } from "../hooks/useVoiceAnnouncer";
import { useI18n } from "../hooks/useI18n";
import { toast } from "./Effects";

const MODAL_Z = 2147483600;

/**
 * Props:
 *   - order: { code, customer_name, table_number?, ... }
 *   - variant: "default" | "compact"  (compact cho KDS nhỏ)
 *   - onCalled?: callback sau khi gọi
 */
export default function VoiceCallButton({
  order,
  variant = "default",
  onCalled,
}) {
  const { t } = useI18n();
  const { supported, speaking, speak, stop, config } = useVoiceAnnouncer();

  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState("name"); // "name" | "table" | "code"

  // Reset mode khi mở modal
  useEffect(() => {
    if (showModal) {
      // Nếu order có số bàn → ưu tiên hiển thị lựa chọn bàn
      setMode(order?.table_number ? "table" : "name");
    }
  }, [showModal, order?.table_number]);

  // Tạo nội dung đọc theo mode
  const message = useMemo(() => {
    if (!order) return "";
    const name = (order.customer_name || "").trim();

    if (mode === "table") {
      const table = order.table_number || "—";
      return t("Mời bàn số {n} đến quầy nhận món").replace("{n}", String(table));
    }
    if (mode === "code") {
      return t("Mời đơn {code} đến quầy nhận món").replace(
        "{code}",
        order.code || ""
      );
    }
    // default: name
    return t("Mời bạn {name} đến quầy nhận món").replace(
      "{name}",
      name || t("khách")
    );
  }, [mode, order, t]);

  const handleCall = () => {
    if (!supported) {
      toast(
        t("Thiết bị/trình duyệt không hỗ trợ đọc giọng nói."),
        "error"
      );
      return;
    }
    if (!config.enabled) {
      toast(t("Giọng đọc đang tắt. Bật trong Cài đặt."), "warning");
      return;
    }

    speak(message, { repeat: true });

    toast(
      t("Đang gọi: {msg}").replace("{msg}", message),
      "success"
    );

    if (typeof onCalled === "function") {
      onCalled(order, { mode, message });
    }

    setShowModal(false);
  };

  const handleStop = () => {
    stop();
    toast(t("Đã dừng gọi"), "info");
  };

  // Nếu không hỗ trợ → ẩn nút
  if (!supported) return null;

  // ---------- Compact variant ----------
  if (variant === "compact") {
    return (
      <>
        <button
          type="button"
          className="vcb-btn vcb-btn--compact"
          onClick={(e) => {
            e.stopPropagation();
            setShowModal(true);
          }}
          title={t("Gọi khách nhận món")}
        >
          <Volume2 size={14} />
        </button>

        {showModal && (
          <VoiceCallModal
            order={order}
            mode={mode}
            setMode={setMode}
            message={message}
            onCall={handleCall}
            onStop={handleStop}
            onClose={() => setShowModal(false)}
            speaking={speaking}
            t={t}
          />
        )}
      </>
    );
  }

  // ---------- Default variant ----------
  return (
    <>
      <button
        type="button"
        className="vcb-btn"
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(true);
        }}
      >
        {speaking ? (
          <>
            <Loader2 size={14} className="vcb-spin" />
            {t("Đang gọi...")}
          </>
        ) : (
          <>
            <Volume2 size={14} />
            {t("Gọi nhận món")}
          </>
        )}
      </button>

      {showModal && (
        <VoiceCallModal
          order={order}
          mode={mode}
          setMode={setMode}
          message={message}
          onCall={handleCall}
          onStop={handleStop}
          onClose={() => setShowModal(false)}
          speaking={speaking}
          t={t}
        />
      )}
    </>
  );
}

// ============================================================
// MODAL
// ============================================================

function VoiceCallModal({
  order,
  mode,
  setMode,
  message,
  onCall,
  onStop,
  onClose,
  speaking,
  t,
}) {
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const MODES = [
    { id: "name",  icon: User,   label: t("Theo tên khách") },
    { id: "table", icon: Coffee, label: t("Theo số bàn") },
    { id: "code",  icon: Hash,   label: t("Theo mã đơn") },
  ];

  return (
    <div
      className="vcb-overlay"
      style={{ zIndex: MODAL_Z }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="vcb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vcb-modal__head">
          <h3>
            <Volume2 size={20} />
            {t("Gọi khách nhận món")}
          </h3>
          <button onClick={onClose} aria-label={t("Đóng")}>
            <X size={20} />
          </button>
        </div>

        {/* Order info */}
        <div className="vcb-order-info">
          <div className="vcb-order-info__row">
            <span>{t("Đơn")}:</span>
            <b>{order?.code || "—"}</b>
          </div>
          {order?.customer_name && (
            <div className="vcb-order-info__row">
              <span>{t("Khách")}:</span>
              <b>{order.customer_name}</b>
            </div>
          )}
          {order?.table_number && (
            <div className="vcb-order-info__row">
              <span>{t("Bàn")}:</span>
              <b>#{order.table_number}</b>
            </div>
          )}
        </div>

        {/* Mode selector */}
        <div className="vcb-mode">
          <label>{t("Gọi theo:")}</label>
          <div className="vcb-mode__grid">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              const disabled = m.id === "table" && !order?.table_number;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setMode(m.id)}
                  className={`vcb-mode__btn ${active ? "active" : ""} ${
                    disabled ? "disabled" : ""
                  }`}
                  title={disabled ? t("Đơn này không có số bàn") : m.label}
                >
                  <Icon size={16} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        <div className="vcb-preview">
          <label>{t("Nội dung sẽ đọc:")}</label>
          <div className="vcb-preview__box">"{message}"</div>
        </div>

        {/* Note */}
        <p className="vcb-note">
          {t("Hệ thống sẽ đọc to và tự động gọi lại sau 30 giây nếu khách chưa đến nhận.")}
        </p>

        {/* Actions */}
        <div className="vcb-actions">
          <button
            type="button"
            className="vcb-btn vcb-btn--ghost"
            onClick={onClose}
          >
            {t("Hủy")}
          </button>

          {speaking ? (
            <button
              type="button"
              className="vcb-btn vcb-btn--danger"
              onClick={onStop}
            >
              <StopCircle size={16} />
              {t("Dừng gọi")}
            </button>
          ) : (
            <button
              type="button"
              className="vcb-btn vcb-btn--primary"
              onClick={onCall}
            >
              <Volume2 size={16} />
              {t("Gọi ngay")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}