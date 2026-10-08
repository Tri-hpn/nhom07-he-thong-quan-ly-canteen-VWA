// ============================================================
// NOTIFICATIONSPANEL.JSX — Thông báo & Giờ ca ăn
// ============================================================

import { Check } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";

export default function NotificationsPanel({ settings }) {
  const { t } = useI18n();
  const {
    notiPrefs,
    mealSlots,
    toggleNotiPref,
    toggleMealSlot,
    setNotifyBefore,
  } = settings;

  const NOTI_ITEMS = [
    {
      key: "orderReady",
      title: t("Món đã sẵn sàng"),
      desc: t(
        "Nhận ngay khi đầu bếp hoàn thành món và bạn có thể đến quầy nhận."
      ),
    },
    {
      key: "orderStatus",
      title: t("Trạng thái đơn hàng"),
      desc: t(
        "Thông báo khi đơn chuyển sang: Đã xác nhận → Đang chuẩn bị → Hoàn thành."
      ),
    },
    {
      key: "promotion",
      title: t("Khuyến mãi & Ưu đãi"),
      desc: t(
        "Nhận voucher mới, Flash Sale ca trưa, combo trợ giá sinh viên."
      ),
    },
    {
      key: "wallet",
      title: t("Biến động Ví Canteen"),
      desc: t(
        "Thông báo khi ví được nạp, trừ tiền, hoàn tiền hoặc trợ giá."
      ),
    },
  ];

  const MEAL_SLOTS = [
    { key: "breakfast", label: t("Ca sáng"), time: "06:30 - 10:30", icon: "🌅" },
    { key: "lunch", label: t("Ca trưa"), time: "11:00 - 14:00", icon: "🍚" },
    { key: "dinner", label: t("Ca tối"), time: "16:30 - 19:30", icon: "🌙" },
  ];

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <h4 className="settings-section__title">
          {t("Loại thông báo bạn muốn nhận")}
        </h4>
        <p className="settings-section__desc">
          {t(
            "Chọn những loại thông báo bạn quan tâm — hệ thống sẽ không làm phiền bạn với các thông báo khác."
          )}
        </p>

        <div className="settings-noti-list">
          {NOTI_ITEMS.map((item) => (
            <label key={item.key} className="settings-noti-item">
              <input
                type="checkbox"
                checked={!!notiPrefs[item.key]}
                onChange={() => toggleNotiPref(item.key)}
              />
              <div className="settings-noti-item__body">
                <b>{item.title}</b>
                <p>{item.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section__title">
          {t("Kiểu nhắc nhở")}
        </h4>

        <div className="settings-noti-list">
          <label className="settings-noti-item">
            <input
              type="checkbox"
              checked={!!notiPrefs.sound}
              onChange={() => toggleNotiPref("sound")}
            />
            <div className="settings-noti-item__body">
              <b>{t("Âm thanh thông báo")}</b>
              <p>{t("Phát tiếng 'ting' khi có tin nhắn hoặc đơn mới.")}</p>
            </div>
          </label>

          <label className="settings-noti-item">
            <input
              type="checkbox"
              checked={!!notiPrefs.vibration}
              onChange={() => toggleNotiPref("vibration")}
            />
            <div className="settings-noti-item__body">
              <b>{t("Rung thiết bị")}</b>
              <p>
                {t(
                  "Rung nhẹ khi có thông báo (chỉ hoạt động trên app di động)."
                )}
              </p>
            </div>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section__title">
          {t("Giờ ca ăn ưa thích")}
        </h4>
        <p className="settings-section__desc">
          {t(
            "Chọn khung giờ bạn thường đặt món — hệ thống sẽ gợi ý thực đơn và nhắc bạn trước giờ ăn."
          )}
        </p>

        <div className="settings-mealslot-grid">
          {MEAL_SLOTS.map((meal) => {
            const active = !!mealSlots[meal.key];
            return (
              <button
                key={meal.key}
                type="button"
                className={`settings-mealslot-card ${
                  active ? "active" : ""
                }`}
                onClick={() => toggleMealSlot(meal.key)}
              >
                <span className="settings-mealslot-card__icon">
                  {meal.icon}
                </span>
                <div className="settings-mealslot-card__body">
                  <b>{meal.label}</b>
                  <span>{meal.time}</span>
                </div>
                {active && (
                  <span className="settings-mealslot-card__check">
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="settings-noti-time">
          <label className="settings-noti-time__label">
            {t("Nhắc tôi trước giờ ăn:")}
          </label>
          <select
            value={mealSlots.notifyBefore}
            onChange={(e) => setNotifyBefore(e.target.value)}
            className="settings-noti-time__select"
          >
            <option value={5}>{t("5 phút trước")}</option>
            <option value={10}>{t("10 phút trước")}</option>
            <option value={15}>{t("15 phút trước")}</option>
            <option value={30}>{t("30 phút trước")}</option>
            <option value={60}>{t("1 giờ trước")}</option>
          </select>
        </div>
      </div>
    </div>
  );
}