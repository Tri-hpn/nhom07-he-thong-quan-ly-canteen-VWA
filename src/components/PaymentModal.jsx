// ============================================================
// PAYMENTMODAL.JSX — Modal chọn phương thức thanh toán (V3)
// ============================================================
// V2:
//   - 🔧 FIX #36: template string printQR
//   - 🔧 FIX #54: useMemo vietQR phụ thuộc primitive
// V3 (Batch 13):
//   - Import getToken + guard api.settings.get() chống spam 401
//   - Không treo settingsLoading khi không có token
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X, Banknote, QrCode, CreditCard, Printer, Check, Wallet, Loader2, AlertTriangle,
} from "lucide-react";
import { money } from "./UI";
import { api, getToken } from "../api";
import { toast } from "./Effects";
import { useI18n } from "../hooks/useI18n";

const MODAL_Z = 2147483600;

const PAYMENT_METHODS = [
  {
    id: "Tiền mặt",
    label: "Tiền mặt",
    desc: "Thanh toán trực tiếp khi nhận hàng",
    icon: Banknote,
    color: "#18a967",
  },
  {
    id: "QR",
    label: "Chuyển khoản QR",
    desc: "Quét mã VietQR bằng ứng dụng ngân hàng",
    icon: QrCode,
    color: "#2634d5",
    needsBank: true,
  },
  {
    id: "Thẻ",
    label: "Thẻ sinh viên",
    desc: "Chạm thẻ tại quầy POS",
    icon: CreditCard,
    color: "#f59e0b",
  },
  {
    id: "Ví Canteen",
    label: "Ví Canteen",
    desc: "Trừ trực tiếp số dư ví VWA Pay",
    icon: Wallet,
    color: "#8b5cf6",
    needsWallet: true,
  },
];

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const buildPrintHTML = ({
  code,
  bank,
  acc,
  accName,
  content,
  totalText,
  qrUrl,
}) => {
  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '  <meta charset="utf-8" />',
    `  <title>QR - ${code}</title>`,
    "  <style>",
    "    * { box-sizing: border-box; }",
    '    body { font-family: monospace, "Courier New", monospace; padding: 20px; text-align: center; margin: 0; }',
    "    h2 { margin: 0 0 4px; font-size: 18px; }",
    "    .sub { margin: 0 0 12px; font-size: 12px; color: #555; }",
    "    .code { font-size: 14px; margin: 8px 0 16px; }",
    "    img { width: 260px; height: 260px; display: block; margin: 0 auto; }",
    "    .total { font-size: 22px; font-weight: 800; margin: 16px 0; color: #18a967; }",
    "    .info { font-size: 12px; color: #333; line-height: 1.6; text-align: left; margin: 16px auto 0; max-width: 300px; }",
    "    .info b { color: #000; }",
    "    @media print { body { padding: 0; } }",
    "  </style>",
    "</head>",
    "<body>",
    "  <h2>CANTEEN VWA</h2>",
    "  <p class='sub'>Hệ thống Canteen VWA</p>",
    `  <p class='code'>Mã đơn: <b>${code}</b></p>`,
    `  <img src="${qrUrl}" alt="VietQR" />`,
    `  <div class='total'>${totalText}</div>`,
    "  <div class='info'>",
    `    <div>Ngân hàng: <b>${bank}</b></div>`,
    `    <div>STK: <b>${acc}</b></div>`,
    `    <div>Chủ TK: <b>${accName}</b></div>`,
    `    <div>Nội dung: <b>${content}</b></div>`,
    "  </div>",
    "  <scr" + "ipt>",
    "    window.onload = function() {",
    "      setTimeout(function() { window.print(); }, 400);",
    "    };",
    "  </scr" + "ipt>",
    "</body>",
    "</html>",
  ].join("\n");
};

export default function PaymentModal({
  order,
  onClose,
  onConfirm,
  walletBalance = 0,
}) {
  const { t } = useI18n();
  const [method, setMethod] = useState("Tiền mặt");
  const [confirmed, setConfirmed] = useState(false);
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // 🔧 Batch 13 FIX: guard chống spam 401
    if (!getToken()) {
      setSettingsLoading(false);
      return;
    }

    api.settings
      .get()
      .then((d) => {
        if (cancelled || !d) return;
        setSettings({
          bank: d.bank || "",
          account: d.account || "",
          accountName: d.accountName || "",
        });
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setConfirmed(false);
  }, [order?.code]);

  useEffect(() => {
    if (!order) return;
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (confirmed) return;
      onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [order, confirmed, onClose]);

  useEffect(() => {
    if (!order) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [order]);

  const total = useMemo(() => Number(order?.total) || 0, [order?.total]);

  const bankCode = settings?.bank || "";
  const bankAccount = settings?.account || "";
  const bankAccountName = settings?.accountName || "";
  const hasBankInfo = !!(bankCode && bankAccount);

  const transferContent = order ? `CANTEEN ${order.code || ""}` : "";

  const vietQR = useMemo(() => {
    if (!hasBankInfo || !order) return "";
    const params = new URLSearchParams({
      amount: String(total),
      addInfo: transferContent,
      accountName: bankAccountName || "CANTEEN VWA",
    });
    return (
      `https://img.vietqr.io/image/${bankCode}-${bankAccount}` +
      `-compact2.png?${params.toString()}`
    );
  }, [hasBankInfo, order?.code, bankCode, bankAccount, bankAccountName, total, transferContent]);

  const walletEnough = walletBalance >= total;
  const walletShortfall = Math.max(0, total - walletBalance);

  const printQR = useCallback(() => {
    if (!vietQR || !order) return;

    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) {
      toast(t("Trình duyệt chặn popup. Vui lòng bật popup và thử lại."), "error");
      return;
    }

    const html = buildPrintHTML({
      code: escapeHtml(order.code),
      bank: escapeHtml(bankCode),
      acc: escapeHtml(bankAccount),
      accName: escapeHtml(bankAccountName),
      content: escapeHtml(transferContent),
      totalText: escapeHtml(money(total)),
      qrUrl: vietQR,
    });

    w.document.open();
    w.document.write(html);
    w.document.close();
  }, [vietQR, order, bankCode, bankAccount, bankAccountName, total, transferContent, t]);

  const confirm = useCallback(() => {
    if (confirmed) return;
    if (!order) return;

    if (method === "Ví Canteen" && !walletEnough) {
      toast(
        t("Số dư ví không đủ. Bạn còn thiếu {amount}.").replace(
          "{amount}",
          money(walletShortfall)
        ),
        "error"
      );
      return;
    }

    if (method === "QR" && !hasBankInfo) {
      toast(t("Chưa cấu hình tài khoản ngân hàng để nhận chuyển khoản."), "error");
      return;
    }

    setConfirmed(true);
    onConfirm?.(method);
  }, [
    confirmed,
    order,
    method,
    walletEnough,
    walletShortfall,
    hasBankInfo,
    onConfirm,
    t,
  ]);

  if (!order) return null;

  return (
    <div
      onClick={() => !confirmed && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-label={t("Chọn phương thức thanh toán")}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: MODAL_Z,
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 520,
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
            {t("Chọn phương thức thanh toán")}
          </h3>
          <button
            onClick={() => !confirmed && onClose?.()}
            disabled={confirmed}
            type="button"
            aria-label={t("Đóng")}
            style={{
              background: "transparent",
              border: 0,
              cursor: confirmed ? "not-allowed" : "pointer",
              color: "var(--text-light, #8993a3)",
              padding: 4,
              display: "grid",
              placeItems: "center",
              opacity: confirmed ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            background: "var(--bg-tertiary, #f5f7fb)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 18,
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
              gap: 10,
            }}
          >
            <span style={{ color: "var(--text-muted, #64748b)" }}>
              {t("Mã đơn hàng")}
            </span>
            <b style={{ color: "#2634d5", fontFamily: "monospace" }}>
              {order.code}
            </b>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--text-muted, #64748b)" }}>
              {t("Tổng cộng")}
            </span>
            <b style={{ color: "#18a967", fontSize: 18 }}>
              {money(total)}
            </b>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {PAYMENT_METHODS.map((m) => {
            const Icon = m.icon;
            const active = method === m.id;
            const disabled =
              (m.needsWallet && !walletEnough) ||
              (m.needsBank && !hasBankInfo && !settingsLoading);

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => !disabled && !confirmed && setMethod(m.id)}
                disabled={disabled || confirmed}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  background: active
                    ? m.color + "15"
                    : "var(--card-bg, #fff)",
                  border: active
                    ? `2px solid ${m.color}`
                    : "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 12,
                  cursor: disabled || confirmed ? "not-allowed" : "pointer",
                  textAlign: "left",
                  opacity: disabled ? 0.55 : 1,
                  transition: "all 0.15s",
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: m.color + "20",
                    color: m.color,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: "var(--text-primary, #172033)",
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-light, #8993a3)",
                    }}
                  >
                    {m.desc}
                    {m.needsWallet && (
                      <span
                        style={{
                          marginLeft: 6,
                          color: walletEnough ? "#18a967" : "#ef4444",
                          fontWeight: 700,
                        }}
                      >
                        · {t("Số dư ví")}: {money(walletBalance)}
                        {!walletEnough &&
                          ` (${t("Thiếu")} ${money(walletShortfall)})`}
                      </span>
                    )}
                    {m.needsBank && !hasBankInfo && !settingsLoading && (
                      <span
                        style={{
                          marginLeft: 6,
                          color: "#ef4444",
                          fontWeight: 700,
                        }}
                      >
                        · {t("Chưa có tài khoản nhận")}
                      </span>
                    )}
                  </div>
                </div>
                {active && (
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: m.color,
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    <Check size={14} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {method === "QR" && !confirmed && (
          <div
            style={{
              background: "var(--card-bg, #fff)",
              borderRadius: 12,
              padding: 20,
              textAlign: "center",
              border: "1px solid var(--border-color, #e5e9ef)",
              marginBottom: 18,
            }}
          >
            {settingsLoading ? (
              <div
                style={{ color: "var(--text-light, #8993a3)", fontSize: 13 }}
              >
                <Loader2
                  size={22}
                  style={{
                    animation: "paySpin 1s linear infinite",
                    marginBottom: 8,
                  }}
                />
                <div>{t("Đang tải thông tin ngân hàng...")}</div>
              </div>
            ) : !hasBankInfo ? (
              <div
                style={{
                  color: "#ef4444",
                  fontSize: 13,
                  padding: 20,
                  lineHeight: 1.6,
                }}
              >
                <AlertTriangle size={28} style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {t("Chưa cấu hình tài khoản ngân hàng")}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted, #64748b)",
                  }}
                >
                  {t("Vui lòng liên hệ quản trị viên để được hỗ trợ.")}
                </div>
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted, #64748b)",
                    marginBottom: 10,
                  }}
                >
                  {t("Quét mã QR để thanh toán đơn hàng")}
                </div>
                <img
                  src={vietQR}
                  alt="VietQR"
                  onError={(e) => {
                    e.target.style.display = "none";
                    if (e.target.nextElementSibling) {
                      e.target.nextElementSibling.style.display = "block";
                    }
                  }}
                  style={{
                    width: 220,
                    height: 220,
                    margin: "0 auto",
                    display: "block",
                    borderRadius: 8,
                  }}
                />
                <div
                  style={{
                    display: "none",
                    color: "#ef4444",
                    fontSize: 12,
                    padding: 20,
                  }}
                >
                  {t("Không tải được mã QR. Vui lòng thử lại sau.")}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: "var(--text-light, #8993a3)",
                    lineHeight: 1.6,
                  }}
                >
                  <div>
                    <b>{bankCode}</b> · {bankAccount}
                  </div>
                  <div>
                    {t("Chủ tài khoản")}: <b>{bankAccountName}</b>
                  </div>
                  <div>
                    {t("Nội dung chuyển khoản")}: <b>{transferContent}</b>
                  </div>
                </div>
                <button
                  onClick={printQR}
                  type="button"
                  style={{
                    marginTop: 14,
                    padding: "10px 16px",
                    background: "#2634d5",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Printer size={14} /> {t("In mã QR")}
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => !confirmed && onClose?.()}
            disabled={confirmed}
            type="button"
            style={{
              flex: 1,
              padding: 12,
              background: "var(--card-bg, #fff)",
              color: "var(--text-primary, #172033)",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 10,
              cursor: confirmed ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 14,
              opacity: confirmed ? 0.5 : 1,
            }}
          >
            {t("Hủy")}
          </button>
          <button
            onClick={confirm}
            disabled={confirmed}
            type="button"
            style={{
              flex: 2,
              padding: 12,
              background: confirmed ? "#94a3b8" : "#2634d5",
              color: "#fff",
              border: 0,
              borderRadius: 10,
              fontWeight: 700,
              cursor: confirmed ? "not-allowed" : "pointer",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {confirmed ? (
              <>
                <Loader2
                  size={16}
                  style={{ animation: "paySpin 1s linear infinite" }}
                />
                {t("Đang xử lý...")}
              </>
            ) : (
              t("Xác nhận đặt hàng")
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes paySpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}