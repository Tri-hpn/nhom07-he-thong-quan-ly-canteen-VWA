// ============================================================
// WALLETPANEL.JSX — Ví VWA & Thẻ sinh viên (chỉ Customer)
// ============================================================
// - Hiển thị số dư ví
// - Trạng thái thẻ sinh viên + PIN
// - Nút đến trang Ví đầy đủ
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet, CreditCard, ShieldCheck, Plus, ArrowRight, Loader2,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../UI";
import { useI18n } from "../../hooks/useI18n";

export default function WalletPanel({ user, onClose }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [studentCardLocked, setStudentCardLocked] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardLoaded, setCardLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.wallet
      .me()
      .then((data) => {
        if (!cancelled) setWallet(data || null);
      })
      .catch(() => {
        if (!cancelled) setWallet(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    api.studentCard.me()
      .then((data) => {
        if (!cancelled) {
          setStudentCardLocked(!!data?.locked);
          setCardLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCardLoaded(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStudentCard = async () => {
    if (!cardLoaded || cardBusy) return;

    const nextLocked = !studentCardLocked;
    const pin = window.prompt(
      nextLocked
        ? "Nhập PIN để khóa thẻ sinh viên:"
        : "Nhập PIN để mở khóa thẻ sinh viên:"
    );

    if (pin === null) return;

    setCardBusy(true);
    try {
      const result = await api.studentCard.setLocked({
        pin: pin.trim(),
        locked: nextLocked,
      });

      setStudentCardLocked(!!result?.locked);
      window.alert(
        result?.locked
          ? "Đã khóa thẻ sinh viên."
          : "Đã mở khóa thẻ sinh viên."
      );
    } catch (error) {
      window.alert(error?.message || "Không thể cập nhật trạng thái thẻ.");
    } finally {
      setCardBusy(false);
    }
  };

  const balance = wallet?.balance ?? user?.balance ?? 0;
  const hasBank = !!(wallet?.bank_account);
  const hasPin = !!wallet?.has_pin;

  const goWallet = () => {
    onClose?.();
    navigate("/customer/wallet");
  };

  return (
    <div className="settings-panel">
      <div className="settings-wallet">
        <div className="settings-wallet__balance-card">
          <div className="settings-wallet__balance-label">
            {t("Số dư Ví VWA Pay")}
          </div>
          <div className="settings-wallet__balance-value">
            {loading ? (
              <Loader2
                size={24}
                style={{ animation: "settingsSpin 1s linear infinite" }}
              />
            ) : (
              <>
                {money(balance).replace("đ", "")}
                <span className="settings-wallet__balance-unit">VNĐ</span>
              </>
            )}
          </div>
          <div className="settings-wallet__balance-actions">
            <button
              type="button"
              className="settings-wallet__balance-btn settings-wallet__balance-btn--solid"
              onClick={goWallet}
            >
              <Plus size={14} />
              {t("Nạp tiền")}
            </button>
            <button
              type="button"
              className="settings-wallet__balance-btn"
              onClick={goWallet}
            >
              {t("Xem chi tiết")}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="settings-wallet__info-row">
          <div className="settings-wallet__info-left">
            <div className="settings-wallet__info-icon">
              <CreditCard size={18} />
            </div>
            <div className="settings-wallet__info-body">
              <b>{t("Thẻ sinh viên VWA")}</b>
              <span>
                {user?.studentId || "2151010088"} •{" "}
                {user?.name || t("Sinh viên")}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <span
              className={`settings-wallet__badge ${
                studentCardLocked
                  ? "settings-wallet__badge--inactive"
                  : "settings-wallet__badge--active"
              }`}
            >
              {studentCardLocked ? t("Thẻ đang khóa") : t("Thẻ đang hoạt động")}
            </span>
            <button
              type="button"
              onClick={toggleStudentCard}
              disabled={!cardLoaded || cardBusy}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: !cardLoaded || cardBusy ? "not-allowed" : "pointer",
                opacity: !cardLoaded || cardBusy ? 0.6 : 1,
                background: studentCardLocked ? "#15803d" : "#dc2626",
                color: "#fff",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {!cardLoaded
                ? t("Đang tải...")
                : cardBusy
                  ? t("Đang xử lý...")
                  : studentCardLocked
                    ? t("Mở khóa thẻ")
                    : t("Khóa thẻ")}
            </button>
          </div>
        </div>

        <div className="settings-wallet__info-row">
          <div className="settings-wallet__info-left">
            <div className="settings-wallet__info-icon">
              <ShieldCheck size={18} />
            </div>
            <div className="settings-wallet__info-body">
              <b>{t("Tài khoản ngân hàng liên kết")}</b>
              <span>
                {hasBank
                  ? `${wallet.bank_name || ""} • ${wallet.bank_account || ""}`
                  : t("Chưa liên kết ngân hàng")}
              </span>
            </div>
          </div>
          <span
            className={`settings-wallet__badge ${
              hasBank
                ? "settings-wallet__badge--active"
                : "settings-wallet__badge--inactive"
            }`}
          >
            {hasBank ? t("Đã liên kết") : t("Chưa liên kết")}
          </span>
        </div>

        <button
          type="button"
          className="settings-btn settings-btn--primary"
          onClick={goWallet}
          style={{ width: "100%" }}
        >
          <Wallet size={16} />
          {t("Đến trang Ví Canteen")}
        </button>
      </div>

      <style>{`
        @keyframes settingsSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}