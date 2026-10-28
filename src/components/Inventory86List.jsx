// ============================================================
// INVENTORY86LIST.JSX — Panel kiểm soát tồn kho + toggle 86
// ============================================================
// B7: Number(stock) thay vì strict ===; tData(item,"name");
//     role="switch" + aria-checked cho toggle

import { useState, useMemo } from "react";
import {
  Package, PlusCircle,
} from "lucide-react";
import { toast } from "./Effects";
import { useI18n } from "../hooks/useI18n";

const MIN_STOCK_THRESHOLD = 15;

function getStockNum(item) {
  const n = Number(item?.stock);
  return Number.isFinite(n) ? n : 0;
}

function getStatus(item) {
  const stock = getStockNum(item);
  if (stock === 0) return "out";
  if (stock < MIN_STOCK_THRESHOLD) return "critical";
  if (stock < MIN_STOCK_THRESHOLD * 2) return "warning";
  return "ok";
}

function getStatusTag(item) {
  const s = getStatus(item);
  if (s === "out") return { text: "Đã Hết", variant: "out" };
  if (s === "critical") return { text: "Báo động", variant: "danger" };
  if (s === "warning") return { text: "Sắp hết", variant: "warning" };
  return { text: "Sẵn sàng", variant: "success" };
}

export default function Inventory86List({
  items = [],
  onToggle86,
  onAddTo86,
  limit = 6,
}) {
  const { t, tData } = useI18n();
  const [togglingIds, setTogglingIds] = useState(new Set());

  const displayItems = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        const order = { out: 0, critical: 1, warning: 2, ok: 3 };
        return order[getStatus(a)] - order[getStatus(b)];
      })
      .slice(0, limit);
  }, [items, limit]);

  const outOfStockCount = useMemo(
    () => items.filter((m) => getStockNum(m) === 0).length,
    [items]
  );

  const handleToggle = async (item) => {
    const id = item._id || item.id;
    if (togglingIds.has(id)) return;

    setTogglingIds((s) => new Set(s).add(id));
    try {
      await onToggle86?.(item);
    } finally {
      setTogglingIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  return (
    <div className="inv86-card">
      <div className="inv86-card__head">
        <div className="inv86-card__head-left">
          <Package size={22} className="inv86-card__head-icon" />
          <div>
            <h2 className="inv86-card__title">{t("Kiểm Soát Tồn Kho Nhanh")}</h2>
            <span className="inv86-card__sub">
              {t("Báo Hết Món Quầy (86 List)")}
            </span>
          </div>
        </div>
        {outOfStockCount > 0 && (
          <span className="inv86-card__badge">
            {outOfStockCount} {t("Món Hết")}
          </span>
        )}
      </div>

      <div className="inv86-card__body">
        {displayItems.length === 0 ? (
          <div className="kds-column__empty">
            {t("Tất cả món đều sẵn sàng")}
          </div>
        ) : (
          displayItems.map((item) => {
            const id = item._id || item.id;
            const stockNum = getStockNum(item);
            const status = getStatus(item);
            const tag = getStatusTag(item);
            const isOff = stockNum === 0;
            const isToggling = togglingIds.has(id);
            const itemName = tData(item, "name");
            const progressPct =
              stockNum > 0
                ? Math.min(100, (stockNum / (MIN_STOCK_THRESHOLD * 4)) * 100)
                : 0;

            return (
              <div
                key={id}
                className={`inv86-row ${isOff ? "inv86-row--out" : ""}`}
              >
                <div className="inv86-row__left">
                  <div className="inv86-row__name-row">
                    <span
                      className={`inv86-row__name ${
                        isOff ? "inv86-row__name--out" : ""
                      }`}
                    >
                      {itemName}
                    </span>
                    <span
                      className={`inv86-row__tag inv86-row__tag--${tag.variant}`}
                    >
                      {t(tag.text)}
                    </span>
                  </div>

                  {!isOff && (
                    <div className="inv86-row__progress-wrap">
                      <div className="inv86-row__progress-bar">
                        <div
                          className={`inv86-row__progress-fill inv86-row__progress-fill--${
                            status === "critical"
                              ? "danger"
                              : status === "warning"
                              ? "warning"
                              : "success"
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span
                        className={`inv86-row__qty ${
                          status === "critical" ? "inv86-row__qty--danger" : ""
                        }`}
                      >
                        {t("Còn")} <b>{stockNum}</b> {t("phần")}
                      </span>
                    </div>
                  )}

                  {isOff && (
                    <span className="inv86-row__lock-time">
                      {t("Đã khóa nhận đơn")}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={!isOff}
                  className={`inv86-switch ${isOff ? "inv86-switch--off" : ""}`}
                  onClick={() => handleToggle(item)}
                  disabled={isToggling}
                  aria-label={
                    isOff
                      ? `${t("Mở lại")} ${itemName}`
                      : `${t("Báo hết")} ${itemName}`
                  }
                >
                  <span className="inv86-switch__knob" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="inv86-card__footer">
        <button
          type="button"
          className="inv86-card__footer-btn"
          onClick={onAddTo86}
        >
          <PlusCircle size={16} />
          {t("Khóa Thêm Món Vào 86 List")}
        </button>
      </div>
    </div>
  );
}