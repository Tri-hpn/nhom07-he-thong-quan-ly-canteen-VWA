// ============================================================
// SHIFTCHECKLIST.JSX — VSATTP checklist (dùng localStorage)
// ============================================================
// B7: audit — không phát hiện bug. Giữ nguyên logic + FIX #68.

import { useState, useEffect, useMemo } from "react";
import {
  CheckSquare, Shield, AlertCircle,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";

const VN_TZ = "Asia/Ho_Chi_Minh";

function getVnYmd(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTodayKey() {
  return `vsattp_checklist_${getVnYmd()}`;
}

function getVnDayMonth() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(new Date());
  const day = parts.find((p) => p.type === "day")?.value || "01";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  return { day, month };
}

export default function ShiftChecklist({ tasks = [], supervisorNote }) {
  const { t } = useI18n();

  const [checked, setChecked] = useState({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getTodayKey());
      if (raw) setChecked(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(getTodayKey(), JSON.stringify(checked));
    } catch {}
  }, [checked]);

  const doneCount = useMemo(
    () => tasks.filter((_, i) => checked[i]).length,
    [tasks, checked]
  );

  const toggle = (i) => {
    setChecked((c) => ({ ...c, [i]: !c[i] }));
  };

  const { day: vnDay, month: vnMonth } = getVnDayMonth();

  return (
    <div className="vsattp-card">
      <div className="vsattp-card__head">
        <div className="vsattp-card__head-left">
          <CheckSquare size={20} style={{ color: "var(--st-primary-container)" }} />
          <h3 className="vsattp-card__title">
            {t("VSATTP & Bàn Giao Ca")}
          </h3>
        </div>
        <span className="vsattp-card__badge">
          {doneCount}/{tasks.length} {t("Việc")}
        </span>
      </div>

      {supervisorNote && (
        <div className="vsattp-note">
          <AlertCircle size={20} className="vsattp-note__icon" />
          <div className="vsattp-note__text">
            <span className="vsattp-note__label">
              {t("Chỉ đạo từ GS Ca Sáng:")}
            </span>
            <span>{supervisorNote}</span>
          </div>
        </div>
      )}

      <div className="vsattp-checklist">
        {tasks.map((task, i) => {
          const done = !!checked[i];
          return (
            <label
              key={i}
              className={`vsattp-check ${done ? "vsattp-check--done" : ""}`}
            >
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggle(i)}
              />
              <span className="vsattp-check__text">{task}</span>
            </label>
          );
        })}
      </div>

      <div className="vsattp-stamp">
        <span className="vsattp-stamp__left">
          <Shield size={14} />
          {t("Tem Kiểm Chuẩn Y Tế VWA")}
        </span>
        <span className="vsattp-stamp__code">
          {t("Mã kiểm:")} #HYG-{vnDay}{vnMonth}
        </span>
      </div>
    </div>
  );
}