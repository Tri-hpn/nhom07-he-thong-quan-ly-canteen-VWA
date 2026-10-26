// ============================================================
// EMPLOYEESHIFTS.JSX — Trang "Ca làm việc" (gộp CheckInOut + History)
// ============================================================
// Layout:
//   - Hero: đồng hồ realtime + nút Đăng ký ca + In phiếu giao ca
//   - Chấm công: chọn ca, check-in/out, trạng thái hôm nay
//   - Nhật ký ca: timeline check-in/out hôm nay
//   - Kíp trực hôm nay: đồng nghiệp
//   - Lịch sử chấm công gần nhất
//   - ✅ V3: Thêm block "Công Việc Được Giao" + Hiển thị Quầy được phân
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Sunrise, Sun, Clock, LogIn, CalendarDays, TrendingUp, AlertTriangle,
  RefreshCw, Loader2, Printer, History, Users, BadgeCheck, Timer,
  CalendarX, Store, PlusCircle, Save, X, ClipboardList, CheckSquare, Check,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { useAuth } from "../../contexts/AuthContext";
import StaffKPICard from "../../components/StaffKPICard";
import { fmtTime, fmtDateLabel } from "../../lib/datetime";

const REFRESH_MS = 30000;
const RECENT_LIMIT = 8;
const MODAL_Z = 2147483600;

// 🔧 FIX #84: formatter cố định VN timezone cho clock
const CLOCK_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const CLOCK_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const PRINT_DATETIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const PRINT_DATE_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const PRINT_TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const SHIFTS = [
  {
    id: "Ca sáng",
    label: "Ca sáng",
    time: "06:30 - 12:30",
    startHour: 6, startMin: 30, endHour: 12, endMin: 30,
    icon: Sunrise, color: "#f59e0b",
  },
  {
    id: "Ca chiều",
    label: "Ca chiều",
    time: "12:30 - 18:30",
    startHour: 12, startMin: 30, endHour: 18, endMin: 30,
    icon: Sun, color: "#2634d5",
  },
];

const STATUS_VARIANT = {
  "Đúng giờ": "success",
  "Đi muộn": "warning",
  "Về sớm": "info",
  "Đi muộn · Về sớm": "danger",
  "Vắng mặt": "danger",
};

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

function nowMinutes(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

function getInitials(name) {
  if (!name) return "NV";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function phaseOf(shift, minutes, att) {
  if (att?.checkIn && att?.checkOut) {
    return { key: "done", label: "Đã kết thúc", variant: "neutral" };
  }
  if (att?.checkIn) {
    return { key: "active", label: "Đang trong ca", variant: "success" };
  }
  if (minutes < shift.start) {
    return { key: "upcoming", label: "Sắp tới", variant: "info" };
  }
  if (minutes <= shift.end) {
    return { key: "missed", label: "Chưa check-in", variant: "warning" };
  }
  return { key: "passed", label: "Đã qua", variant: "neutral" };
}

function pillVariant(status) {
  return STATUS_VARIANT[status] || "neutral";
}

function genShiftCode(now = new Date(), suffix = "A") {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `SHIFT-${y}${m}${d}-${suffix}`;
}

function getShiftInfoById(id) {
  const s = SHIFTS.find((x) => x.id === id);
  if (s) return { title: s.label, time: s.time };
  return { title: "Ngoài giờ", time: "--:-- - --:--" };
}

function fmtHours(hours) {
  if (!hours || hours <= 0) return "0.0h";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function EmployeeShifts() {
  const { t } = useI18n();
  const { user } = useAuth();

  const [me, setMe] = useState([]);
  const [todayShifts, setTodayShifts] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [team, setTeam] = useState([]);
  const [todayAtt, setTodayAtt] = useState(null);
  
  // ✅ State cho Tasks
  const [tasks, setTasks] = useState([]);
  const [togglingTaskId, setTogglingTaskId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [today, setToday] = useState(getTodayStr);
  const [clock, setClock] = useState(() => new Date());
  const [minutes, setMinutes] = useState(() => nowMinutes());

  const [showRegister, setShowRegister] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);

  const [showHandover, setShowHandover] = useState(false);

  // ---- CLOCK ----
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      const nextToday = getTodayStr();
      setClock(d);
      setMinutes(nowMinutes(d));
      setToday((prev) => (prev === nextToday ? prev : nextToday));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ---- LOAD ----
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      setError("");

      const todayStr = getTodayStr();

      const results = await Promise.allSettled([
        api.attendance.me(),
        api.shifts.approvedToday(),
        api.shifts.mine(),
        api.attendance.all({ from: todayStr, to: todayStr }),
        api.attendance.today(),
        api.tasks.me(), // ✅ Load tasks
      ]);

      const [meRes, todayRes, mineRes, teamRes, attRes, tasksRes] = results;

      if (meRes.status === "fulfilled") {
        setMe(Array.isArray(meRes.value) ? meRes.value : []);
      }
      if (todayRes.status === "fulfilled") {
        setTodayShifts(Array.isArray(todayRes.value) ? todayRes.value : []);
      }
      if (mineRes.status === "fulfilled") {
        const fetched = Array.isArray(mineRes.value) ? mineRes.value : [];
        setUpcoming(prev => {
          const fetchedKeys = new Set(fetched.map(s => `${s.date}-${s.shift}`));
          const localPending = prev.filter(s => s.status === 'pending' && !fetchedKeys.has(`${s.date}-${s.shift}`));
          return [...fetched, ...localPending];
        });
      }
      if (teamRes.status === "fulfilled") {
        setTeam(Array.isArray(teamRes.value) ? teamRes.value : []);
      }
      if (attRes.status === "fulfilled") {
        setTodayAtt(attRes.value || null);
      }
      if (tasksRes.status === "fulfilled") {
        setTasks(Array.isArray(tasksRes.value) ? tasksRes.value : []);
      }
      if (results.every((r) => r.status === "rejected")) {
        setError(t("Không tải được lịch sử ca. Vui lòng thử lại."));
      }

      setLoading(false);
      setRefreshing(false);
    },
    [t]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // ---- COMPUTED ----
  const filteredTodayAtt = useMemo(
    () => me.filter((a) => a.date === today),
    [me, today]
  );

  const attByShift = useMemo(() => {
    const map = {};
    filteredTodayAtt.forEach((a) => {
      if (a.shift) map[a.shift] = a;
    });
    return map;
  }, [filteredTodayAtt]);

  const kpi = useMemo(() => {
    const total = todayShifts.length;
    const checkedIn = filteredTodayAtt.filter((a) => a.checkIn).length;
    const hours = filteredTodayAtt.reduce(
      (s, a) => s + (Number(a.hours) || 0),
      0
    );
    const late = filteredTodayAtt.filter((a) =>
      String(a.status || "").includes("Đi muộn")
    ).length;
    return { total, checkedIn, hours, late };
  }, [todayShifts, filteredTodayAtt]);

  const recent = useMemo(() => me.slice(0, RECENT_LIMIT), [me]);

  const timeline = useMemo(() => {
    const events = [];
    filteredTodayAtt.forEach((a, idx) => {
      if (a.checkIn) {
        events.push({
          key: `in-${a.id ?? idx}`,
          shift: a.shift,
          type: "in",
          at: a.checkIn,
          status: a.status,
        });
      }
      if (a.checkOut) {
        events.push({
          key: `out-${a.id ?? idx}`,
          shift: a.shift,
          type: "out",
          at: a.checkOut,
          status: a.status,
        });
      }
    });
    return events.sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [filteredTodayAtt]);

  const currentShift = useMemo(
    () => SHIFTS.find((s) => minutes >= s.start && minutes <= s.end) || null,
    [minutes]
  );

  // ✅ Cập nhật hiển thị ca làm + quầy do admin phân
  const shiftLabel = useMemo(() => {
    if (todayShifts.length === 0) return t("Chưa được phân ca hôm nay");
    
    // Map từng ca và kèm thông tin quầy (nếu có)
    return todayShifts.map((s) => {
      const station = s.station ? ` (${s.station})` : "";
      return `${s.shift}${station}`;
    }).join(" • ");
  }, [todayShifts, t]);

  const clockLabel = CLOCK_TIME_FORMATTER.format(clock);
  const clockDateLabel = CLOCK_DATE_FORMATTER.format(clock);

  // ✅ Computed cho Tasks
  const pendingTasks = useMemo(() => tasks.filter((tk) => tk.status === "pending"), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((tk) => tk.status === "done"), [tasks]);

  const handoverShiftId = useMemo(() => {
    if (todayAtt?.shift) return todayAtt.shift;
    if (currentShift?.id) return currentShift.id;
    if (todayShifts[0]?.shift) return todayShifts[0].shift;
    return null;
  }, [todayAtt, currentShift, todayShifts]);

  const handoverShiftInfo = useMemo(
    () => getShiftInfoById(handoverShiftId),
    [handoverShiftId]
  );

  const handoverShiftCode = useMemo(() => {
    const suffix =
      handoverShiftId === "Ca sáng"
        ? "S"
        : handoverShiftId === "Ca chiều"
        ? "C"
        : "A";
    return genShiftCode(clock, suffix);
  }, [clock, handoverShiftId]);

  const handoverPrintTime = PRINT_DATETIME_FORMATTER.format(clock);
  const handoverPrintDate = PRINT_DATE_FORMATTER.format(clock);
  const handoverPrintTimeOnly = PRINT_TIME_FORMATTER.format(clock);

  const handoverStaffName = user?.name || "—";
  const handoverStaffCode =
    user?.employeeCode || user?.code || "NV-2024-08";

  const handoverAttStatus = todayAtt?.checkIn
    ? todayAtt?.checkOut
      ? t("Đã hoàn thành ca")
      : t("Đang trong ca")
    : t("Chưa check-in");

  // ============================================================
  // CHECK-IN/OUT
  // ============================================================
  const handleCheckIn = async () => {
    if (checkingIn || checkingOut) return;
    if (!todayShifts.length) {
      toast(t("Bạn chưa có ca được duyệt hôm nay"), "error");
      return;
    }
    const shiftToCheck = selectedShift || todayShifts[0]?.shift;
    if (!shiftToCheck) {
      toast(t("Vui lòng chọn ca làm hợp lệ"), "error");
      return;
    }
    setCheckingIn(true);
    try {
      const res = await api.attendance.checkIn({ shift: shiftToCheck });
      setTodayAtt(res.attendance);
      toast(`${t("Check-in")} ${shiftToCheck} ${t("thành công!")}`, "success");
      load(true);
    } catch (e) {
      toast(e.message || t("Lỗi check-in"), "error");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (checkingIn || checkingOut) return;
    setCheckingOut(true);
    try {
      const res = await api.attendance.checkOut({});
      setTodayAtt(res.attendance);
      toast(t("Check-out thành công!"), "success");
      load(true);
    } catch (e) {
      toast(e.message || t("Lỗi check-out"), "error");
    } finally {
      setCheckingOut(false);
    }
  };

  // ✅ Hàm xử lý Toggle Task
  const handleToggleTask = useCallback(async (task) => {
    const id = task.id;
    if (togglingTaskId) return;
    setTogglingTaskId(id);
    setTasks((prev) =>
      prev.map((tk) => tk.id === id ? {
        ...tk, status: tk.status === "done" ? "pending" : "done",
        completed_at: tk.status === "done" ? null : new Date().toISOString(),
      } : tk)
    );
    try {
      await api.tasks.complete(id);
      toast(task.status === "done" ? t("Đã mở lại công việc") : t("Đã đánh dấu hoàn thành!"), "success");
    } catch (e) {
      setTasks((prev) => prev.map((tk) => (tk.id === id ? task : tk)));
      toast(e.message || t("Không cập nhật được"), "error");
    } finally {
      setTogglingTaskId(null);
    }
  }, [togglingTaskId, t]);

  const handleOpenHandover = useCallback(() => setShowHandover(true), []);
  const handleCloseHandover = useCallback(() => setShowHandover(false), []);
  const handlePrintHandover = useCallback(() => setTimeout(() => window.print(), 100), []);

  // ---- RENDER ----
  if (loading) {
    return (
      <div className="shifthist-loading">
        <Loader2 size={22} className="shifthist-spin" />
        <span>{t("Đang tải...")}</span>
      </div>
    );
  }

  return (
    <div className="shifthist">
      {error && (
        <div className="shifthist-alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => load(false)}>
            {t("Thử lại")}
          </button>
        </div>
      )}

      {/* ============ HERO ============ */}
      <div className="staff-hero">
        <div className="staff-hero__row">
          <div className="staff-hero__left">
            <div className="staff-hero__chips">
              <span className="staff-hero__chip staff-hero__chip--success">
                <span className="staff-hero__chip-dot" />
                {t("Ca làm việc")}
              </span>
              <span className="staff-hero__chip-sep">•</span>
              <span className="staff-hero__chip staff-hero__chip--neutral">
                {clockDateLabel}
              </span>
              {currentShift && (
                <>
                  <span className="staff-hero__chip-sep">•</span>
                  <span className="staff-hero__chip staff-hero__chip--neutral">
                    {currentShift.id} ({currentShift.time})
                  </span>
                </>
              )}
            </div>

            <h1 className="staff-hero__title">
              {shiftLabel}
              <span> — {t("Ca trực & chấm công")}</span>
            </h1>

            <div className="staff-hero__meta">
              <div className="staff-hero__meta-item">
                <BadgeCheck size={16} style={{ color: "var(--st-primary-container)" }} />
                <span>
                  {t("Nhân viên:")} <b>{user?.name || "—"}</b>
                </span>
              </div>
              <span className="staff-hero__meta-sep" />
              <div className="staff-hero__meta-item">
                <Store size={16} />
                <span>
                  {t("Mã NV:")} <b>{user?.employeeCode || "NV-2024-08"}</b>
                </span>
              </div>
              <span className="staff-hero__meta-sep" />
              <div className="staff-hero__meta-item" style={{ fontVariantNumeric: "tabular-nums" }}>
                <Timer size={16} style={{ color: "var(--st-info)" }} />
                <span>
                  {t("Giờ làm hôm nay:")} <b>{kpi.hours.toFixed(1)}h</b>
                </span>
              </div>
            </div>
          </div>

          <div className="shifthist-clockbox">
            <div className="shifthist-clockbox__time">{clockLabel}</div>
            <span className="shifthist-clockbox__sub">
              {t("Tự động cập nhật mỗi 30 giây")}
            </span>
            <div className="staff-hero__actions">
              <button type="button" className="staff-hero__action" onClick={() => load(false)} disabled={refreshing}>
                {refreshing ? <Loader2 size={18} className="shifthist-spin" /> : <RefreshCw size={18} />}
                <span>{t("Làm mới")}</span>
              </button>
              <button type="button" className="staff-hero__action staff-hero__action--primary" onClick={() => setShowRegister(true)}>
                <PlusCircle size={18} />
                <span>{t("Đăng ký ca")}</span>
              </button>
              <button type="button" className="staff-hero__action" onClick={handleOpenHandover}>
                <Printer size={18} />
                <span>{t("In phiếu giao ca")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============ KPI ============ */}
      <div className="staff-kpi-grid">
        <StaffKPICard
          icon={<CalendarDays size={22} />}
          label={t("Ca được phân hôm nay")}
          value={kpi.total}
          unit={t("ca")}
          legendRows={[{ label: t("Danh sách ca:"), value: shiftLabel }]}
        />
        <StaffKPICard
          icon={<LogIn size={22} />}
          label={t("Đã chấm công")}
          value={`${kpi.checkedIn}/${kpi.total}`}
          colorVariant="success"
          progressSegments={[{ pct: kpi.total ? (kpi.checkedIn / kpi.total) * 100 : 0, variant: "success" }]}
        />
        <StaffKPICard
          icon={<TrendingUp size={22} />}
          label={t("Giờ làm hôm nay")}
          value={kpi.hours.toFixed(1)}
          unit={t("giờ")}
          colorVariant="primary"
          progressSegments={[{ pct: Math.min(100, (kpi.hours / 6) * 100), variant: "primary" }]}
          legendRows={[{ label: t("Chuẩn 1 ca:"), value: "6.0h" }]}
        />
        <StaffKPICard
          icon={<Clock size={22} />}
          label={t("Đi muộn hôm nay")}
          value={kpi.late}
          unit={t("lần")}
          colorVariant="tertiary"
          badge={kpi.late === 0 ? { icon: <BadgeCheck size={12} />, text: t("Đúng giờ toàn ca"), variant: "success" } : null}
        />
      </div>

      {/* ============ CHECK-IN/OUT CARD ============ */}
      <div className="shift-checkin-card">
        <div className="shift-checkin-card__head">
          <div className="shift-checkin-card__title">
            <Clock size={18} style={{ color: "var(--st-primary)" }} />
            <span>{t("Chấm công hôm nay")}</span>
          </div>
          <span className="shift-checkin-card__status">
            {todayAtt?.checkIn
              ? todayAtt?.checkOut
                ? t("Đã hoàn thành ca")
                : t("Đang trong ca")
              : t("Chưa check-in")}
          </span>
        </div>

        <div className="shift-checkin-rows">
          <div className="shift-checkin-row">
            <span>{t("Check-in")}</span>
            <b>{fmtTime(todayAtt?.checkIn) || "—"}</b>
          </div>
          <div className="shift-checkin-row">
            <span>{t("Check-out")}</span>
            <b>{fmtTime(todayAtt?.checkOut) || "—"}</b>
          </div>
          <div className="shift-checkin-row">
            <span>{t("Giờ làm")}</span>
            <b>{todayAtt?.hours ? `${todayAtt.hours}h` : "—"}</b>
          </div>
          <div className="shift-checkin-row">
            <span>{t("Ca làm")}</span>
            <b>{todayAtt?.shift || "—"}</b>
          </div>
        </div>

        {!todayAtt?.checkIn && todayShifts.length > 0 && (
          <div className="shift-checkin-picker">
            <span className="shift-checkin-picker__label">
              {t("Chọn ca (đã được duyệt hôm nay)")}
            </span>
            <div className="shift-checkin-picker__grid">
              {todayShifts.map((s) => {
                const shift = SHIFTS.find((x) => x.id === s.shift);
                if (!shift) return null;
                const Icon = shift.icon;
                const active = (selectedShift || todayShifts[0]?.shift) === s.shift;
                return (
                  <button
                    key={s.id || s.shift}
                    type="button"
                    className={`shift-picker-btn ${active ? "active" : ""}`}
                    onClick={() => setSelectedShift(s.shift)}
                    style={{
                      borderColor: active ? shift.color : undefined,
                      background: active ? shift.color + "15" : undefined,
                    }}
                  >
                    <Icon size={18} style={{ color: active ? shift.color : undefined }} />
                    <span className="shift-picker-btn__label" style={{ color: active ? shift.color : undefined }}>
                      {shift.label} {s.station ? `(${s.station})` : ""}
                    </span>
                    <span className="shift-picker-btn__time">{shift.time}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!todayAtt?.checkIn && todayShifts.length === 0 && (
          <div className="shift-checkin-empty">
            <AlertTriangle size={24} style={{ color: "#f59e0b" }} />
            <b>{t("Chưa có ca được duyệt hôm nay")}</b>
            <span>{t("Vui lòng liên hệ admin để được phân ca trước khi check-in.")}</span>
          </div>
        )}

        <div className="shift-checkin-actions">
          <button
            type="button"
            className="shift-checkin-btn shift-checkin-btn--success"
            onClick={handleCheckIn}
            disabled={!!todayAtt?.checkIn || checkingIn || checkingOut || todayShifts.length === 0}
          >
            {checkingIn ? <Loader2 size={16} className="shifthist-spin" /> : <LogIn size={16} />}
            <span>
              {todayAtt?.checkIn ? t("Đã check-in") : checkingIn ? t("Đang xử lý...") : t("Check-in")}
            </span>
          </button>

          <button
            type="button"
            className="shift-checkin-btn shift-checkin-btn--warning"
            onClick={handleCheckOut}
            disabled={!todayAtt?.checkIn || !!todayAtt?.checkOut || checkingIn || checkingOut}
          >
            {checkingOut ? <Loader2 size={16} className="shifthist-spin" /> : <LogIn size={16} style={{ transform: "rotate(180deg)" }} />}
            <span>
              {todayAtt?.checkOut ? t("Đã check-out") : checkingOut ? t("Đang xử lý...") : t("Check-out")}
            </span>
          </button>
        </div>

        <p className="shift-checkin-hint">
          {t("Ca sáng: 06:30 - 12:30 · Ca chiều: 12:30 - 18:30 · Đi muộn sau 15 phút.")}
        </p>
      </div>

            {/* ============ LỊCH SỬ ĐĂNG KÝ CA ============ */}
      <div className="shifthist-card" style={{ marginBottom: 20 }}>
        <div className="shifthist-card__head">
          <h3 className="shifthist-card__title">
            <CalendarDays size={16} />
            {t("Lịch sử đăng ký ca làm")}
          </h3>
          <span className="shifthist-card__badge">
            {upcoming.length} {t("ca")}
          </span>
        </div>
        <div className="shifthist-card__body">
          {upcoming.length === 0 ? (
            <div className="shifthist-empty">
              {t("Bạn chưa đăng ký ca làm nào.")}
            </div>
          ) : (
            <div className="shifthist-table-wrap">
              <table className="shifthist-table">
                <thead>
                  <tr>
                    <th>{t("Ngày")}</th>
                    <th>{t("Ca làm")}</th>
                    <th>{t("Quầy")}</th>
                    <th>{t("Trạng thái")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...upcoming].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((s) => (
                    <tr key={s.id}>
                      <td><b>{new Date(s.date).toLocaleDateString("vi-VN")}</b></td>
                      <td>{s.shift}</td>
                      <td>{s.station || "—"}</td>
                      <td>
                        <span className={`shifthist-pill shifthist-pill--${
                          s.status === "approved" ? "success" : s.status === "rejected" ? "danger" : "warning"
                        }`}>
                          {s.status === "approved" ? t("Đã duyệt") : s.status === "rejected" ? t("Từ chối") : t("Chờ duyệt")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ============ NHẬT KÝ + KÍP TRỰC ============ */}
      <div className="staff-workspace">
        <div className="staff-workspace__kds">
          <div className="shifthist-card">
            <div className="shifthist-card__head">
              <h3 className="shifthist-card__title">
                <Clock size={16} />
                {t("Nhật ký ca hôm nay")}
              </h3>
              <span className="shifthist-card__badge">
                {timeline.length} {t("mốc")}
              </span>
            </div>
            <div className="shifthist-card__body">
              {timeline.length === 0 ? (
                <div className="shifthist-empty">
                  {t("Chưa có check-in / check-out nào hôm nay")}
                </div>
              ) : (
                <div className="shifthist-timeline">
                  {timeline.map((ev) => (
                    <div key={ev.key} className="shifthist-event">
                      <div className="shifthist-event__rail">
                        <span className={"shifthist-event__dot" + (ev.type === "out" ? " shifthist-event__dot--out" : "")} />
                        <span className="shifthist-event__line" />
                      </div>
                      <div className="shifthist-event__body">
                        <div className="shifthist-event__title">
                          {ev.type === "in" ? `${t("Check-in")} — ${ev.shift}` : `${t("Check-out")} — ${ev.shift}`}
                        </div>
                        <div className="shifthist-event__meta">
                          {fmtTime(ev.at)}
                          {ev.status ? ` • ${t(ev.status)}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="staff-workspace__side">
          <div className="shifthist-card">
            <div className="shifthist-card__head">
              <h3 className="shifthist-card__title">
                <Users size={16} />
                {t("Kíp trực hôm nay")}
              </h3>
              <span className="shifthist-card__badge">
                {team.length} {t("người")}
              </span>
            </div>
            <div className="shifthist-card__body">
              {team.length === 0 ? (
                <div className="shifthist-empty">
                  {t("Chưa có ai chấm công hôm nay")}
                </div>
              ) : (
                <div className="shifthist-team">
                  {team.map((m) => (
                    <div key={`${m.id}-${m.shift}`} className="shifthist-member">
                      <span className="shifthist-member__avatar">
                        {getInitials(m.employee_name)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="shifthist-member__name">
                          {m.employee_name}
                          {user && String(m.employee_id) === String(user.id) ? ` (${t("Bạn")})` : ""}
                        </div>
                        <div className="shifthist-member__meta">
                          {m.shift} • {t("vào")} {fmtTime(m.checkIn)}
                          {m.checkOut ? ` • ${t("ra")} ${fmtTime(m.checkOut)}` : ""}
                        </div>
                      </div>
                      <span className={`shifthist-pill shifthist-pill--${pillVariant(m.status)} shifthist-member__status`}>
                        {t(m.status || "—")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============ CÔNG VIỆC ĐƯỢC GIAO (MỚI THÊM) ============ */}
      <section className="tasks-card">
        <div className="tasks-card__head">
          <div className="tasks-card__head-left">
            <ClipboardList size={20} className="tasks-card__head-icon" />
            <div>
              <h3 className="tasks-card__title">{t("Công Việc Được Giao")}</h3>
              <span className="tasks-card__sub">
                {pendingTasks.length > 0
                  ? `${pendingTasks.length} ${t("việc chưa hoàn thành")} · ${doneTasks.length} ${t("đã xong")}`
                  : doneTasks.length > 0
                  ? `${t("Đã hoàn thành tất cả")} ${doneTasks.length} ${t("việc")}`
                  : t("Không có công việc nào")}
              </span>
            </div>
          </div>
          {pendingTasks.length > 0 && (
            <span className="tasks-card__badge">{doneTasks.length}/{tasks.length} {t("việc")}</span>
          )}
        </div>

        <div className="tasks-card__body">
          {tasks.length === 0 ? (
            <div className="tasks-card__empty">
              <CheckSquare size={40} style={{ opacity: 0.3 }} />
              <div>{t("Chưa có công việc nào được giao")}</div>
            </div>
          ) : (
            <div className="tasks-card__list">
              {[...tasks]
                .sort((a, b) => {
                  if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
                  const order = { urgent: 0, high: 1, normal: 2, low: 3 };
                  return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
                })
                .map((task) => {
                  const isDone = task.status === "done";
                  const isToggling = togglingTaskId === task.id;
                  const prioColor = task.priority === "urgent" ? "#ef4444" : task.priority === "high" ? "#f59e0b" : "var(--st-primary-container)";
                  return (
                    <div key={task.id} className={`tasks-row ${isDone ? "tasks-row--done" : ""}`}>
                      <button type="button" className={`tasks-row__check ${isDone ? "tasks-row__check--done" : ""}`} onClick={() => handleToggleTask(task)} disabled={isToggling} aria-label={isDone ? t("Bỏ đánh dấu hoàn thành") : t("Đánh dấu hoàn thành")}>
                        {isToggling ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : isDone ? <Check size={14} /> : null}
                      </button>
                      <div className="tasks-row__content">
                        <div className="tasks-row__title-row">
                          <b className={`tasks-row__title ${isDone ? "tasks-row__title--done" : ""}`}>{task.title}</b>
                          {task.priority !== "normal" && (
                            <span className="tasks-row__priority" style={{ color: prioColor, borderColor: prioColor }}>
                              {task.priority === "urgent" ? t("Khẩn") : task.priority === "high" ? t("Cao") : t("Thấp")}
                            </span>
                          )}
                        </div>
                        {task.description && <p className="tasks-row__desc">{task.description}</p>}
                        <div className="tasks-row__meta">
                          {task.shift && <span className="tasks-row__meta-item"><Timer size={11} />{task.shift}</span>}
                          {task.due_date && <span className="tasks-row__meta-item">{t("Hạn:")} {task.due_date}</span>}
                          {task.assigned_by_name && <span className="tasks-row__meta-item">{t("Giao bởi")}: {task.assigned_by_name}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </section>

      {/* ============ LỊCH SỬ GẦN NHẤT ============ */}
      <div className="shifthist-card">
        <div className="shifthist-card__head">
          <h3 className="shifthist-card__title">
            <History size={16} />
            {t("Lịch sử chấm công gần nhất")}
          </h3>
          <span className="shifthist-card__badge">
            {recent.length} {t("bản ghi")}
          </span>
        </div>

        {recent.length === 0 ? (
          <div className="shifthist-empty">
            <CalendarX size={30} style={{ opacity: 0.45 }} />
            <div>{t("Chưa có dữ liệu chấm công")}</div>
          </div>
        ) : (
          <div className="shifthist-table-wrap">
            <table className="shifthist-table">
              <thead>
                <tr>
                  <th>{t("Ngày")}</th>
                  <th>{t("Ca làm")}</th>
                  <th>{t("Check-in")}</th>
                  <th>{t("Check-out")}</th>
                  <th>{t("Giờ làm")}</th>
                  <th>{t("Trạng thái")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.date}</b></td>
                    <td>{a.shift || "—"}</td>
                    <td>{fmtTime(a.checkIn)}</td>
                    <td>{fmtTime(a.checkOut)}</td>
                    <td>{a.hours ? `${a.hours}h` : "—"}</td>
                    <td>
                      <span className={`shifthist-pill shifthist-pill--${pillVariant(a.status)}`}>
                        {t(a.status || "—")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============ MODAL ĐĂNG KÝ CA ============ */}
      {showRegister && (
        <RegisterModal
          existingShifts={upcoming}
          onSave={async (data) => {
            const res = await api.shifts.register(data);
            toast(
              `${t("Đã đăng ký")} ${res.created} ${t("ca")}` +
                (res.skipped
                  ? ` (${t("bỏ qua")} ${res.skipped} ${t("ca trùng")})`
                  : ""),
              "success"
            );

            // Cập nhật ngay lập tức vào Lịch sử đăng ký
            const newShifts = [];
            Object.entries(data.dateShifts).forEach(([date, shiftList]) => {
              shiftList.forEach(shift => {
                newShifts.push({
                  id: `temp-${Date.now()}-${Math.random()}`,
                  date,
                  shift,
                  status: 'pending',
                  employee_id: user?.id,
                  station: null
                });
              });
            });

            setUpcoming(prev => {
              const existing = new Set(prev.map(s => `${s.date}-${s.shift}`));
              const uniqueNew = newShifts.filter(s => !existing.has(`${s.date}-${s.shift}`));
              return [...prev, ...uniqueNew];
            });

            setShowRegister(false);
            load(true);
          }}
          onClose={() => setShowRegister(false)}
        />
      )}

      {/* ============ MODAL PHIẾU GIAO CA ============ */}
      {showHandover && (
        <div className="handover-overlay" role="dialog" aria-modal="true">
          <div className="handover-modal">
            <div className="handover-modal__toolbar no-print">
              <h3 className="handover-modal__toolbar-title">
                {t("Xem trước phiếu giao ca")}
              </h3>
              <div className="handover-modal__toolbar-actions">
                <button type="button" className="handover-modal__btn handover-modal__btn--ghost" onClick={handleCloseHandover}>
                  <X size={16} /><span>{t("Đóng")}</span>
                </button>
                <button type="button" className="handover-modal__btn handover-modal__btn--primary" onClick={handlePrintHandover}>
                  <Printer size={16} /><span>{t("In phiếu")}</span>
                </button>
              </div>
            </div>

            <div className="handover-sheet" id="handover-print-area">
              <div className="handover-sheet__header">
                <div className="handover-sheet__logo">
                  <img src="/icon.svg" alt="Canteen VWA" width={48} height={48} style={{ display: "block" }} />
                  <div className="handover-sheet__logo-text">
                    <b>CANTEEN VWA</b>
                    <span>Học viện Phụ Nữ Việt Nam</span>
                  </div>
                </div>
                <div className="handover-sheet__title-wrap">
                  <h1 className="handover-sheet__title">PHIẾU GIAO CA</h1>
                  <span className="handover-sheet__subtitle">Shift Handover Report</span>
                </div>
                <div className="handover-sheet__meta-right">
                  <div><b>{t("Mã phiếu:")}</b> {handoverShiftCode}</div>
                  <div><b>{t("Ngày:")}</b> {handoverPrintDate}</div>
                  <div><b>{t("Giờ in:")}</b> {handoverPrintTimeOnly}</div>
                </div>
              </div>

              <div className="handover-sheet__section">
                <div className="handover-sheet__section-title">{t("THÔNG TIN CA")}</div>
                <div className="handover-sheet__grid">
                  <div className="handover-sheet__row">
                    <span className="handover-sheet__label">{t("Ca làm việc:")}</span>
                    <span className="handover-sheet__value">
                      {t(handoverShiftInfo.title)} ({handoverShiftInfo.time})
                    </span>
                  </div>
                  <div className="handover-sheet__row">
                    <span className="handover-sheet__label">{t("Nhân viên:")}</span>
                    <span className="handover-sheet__value">
                      {handoverStaffName}{handoverStaffCode ? ` (${handoverStaffCode})` : ""}
                    </span>
                  </div>
                  <div className="handover-sheet__row">
                    <span className="handover-sheet__label">{t("Ngày làm việc:")}</span>
                    <span className="handover-sheet__value">{today}</span>
                  </div>
                  <div className="handover-sheet__row">
                    <span className="handover-sheet__label">{t("Ca được phân:")}</span>
                    <span className="handover-sheet__value">
                      {todayShifts.length > 0 ? shiftLabel : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="handover-sheet__section">
                <div className="handover-sheet__section-title">{t("CHẤM CÔNG")}</div>
                <table className="handover-sheet__table">
                  <tbody>
                    <tr><td>{t("Check-in")}</td><td className="handover-sheet__num">{todayAtt?.checkIn ? fmtTime(todayAtt.checkIn) : "—"}</td></tr>
                    <tr><td>{t("Check-out")}</td><td className="handover-sheet__num">{todayAtt?.checkOut ? fmtTime(todayAtt.checkOut) : "—"}</td></tr>
                    <tr><td>{t("Giờ làm hôm nay")}</td><td className="handover-sheet__num handover-sheet__num--big">{todayAtt?.hours ? fmtHours(todayAtt.hours) : "0.0h"}</td></tr>
                    <tr><td>{t("Ca đang chấm")}</td><td className="handover-sheet__num">{todayAtt?.shift || "—"}</td></tr>
                    <tr><td>{t("Trạng thái")}</td><td className="handover-sheet__num">{handoverAttStatus}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="handover-sheet__section">
                <div className="handover-sheet__section-title">{t("GHI CHÚ")}</div>
                <div className="handover-sheet__note-box">
                  <div className="handover-sheet__note-line" />
                  <div className="handover-sheet__note-line" />
                  <div className="handover-sheet__note-line" />
                </div>
              </div>

              <div className="handover-sheet__signatures">
                <div className="handover-sheet__sign">
                  <b>{t("Người giao ca")}</b><span>({t("Ký, ghi rõ họ tên")})</span>
                  <div className="handover-sheet__sign-space" />
                  <div className="handover-sheet__sign-name">{handoverStaffName}</div>
                </div>
                <div className="handover-sheet__sign">
                  <b>{t("Người nhận ca")}</b><span>({t("Ký, ghi rõ họ tên")})</span>
                  <div className="handover-sheet__sign-space" />
                  <div className="handover-sheet__sign-name">&nbsp;</div>
                </div>
              </div>

              <div className="handover-sheet__footer">
                {t("Phiếu được tạo tự động bởi hệ thống Canteen VWA — {time}").replace("{time}", handoverPrintTime)}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ---------- Modal overlay ---------- */
        .handover-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 24px 16px;
          overflow-y: auto;
        }

        .handover-modal {
          width: 100%;
          max-width: 820px;
          background: var(--st-surface);
          border-radius: 12px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
          overflow: hidden;
        }

        .handover-modal__toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: var(--st-surface-low);
          border-bottom: 1px solid var(--st-outline-light);
        }

        .handover-modal__toolbar-title {
          margin: 0;
          font-family: var(--st-font-head);
          font-size: 15px;
          font-weight: 700;
          color: var(--st-text);
        }

        .handover-modal__toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .handover-modal__btn {
          height: 38px;
          padding: 0 14px;
          border-radius: 8px;
          border: 0;
          font-family: var(--st-font-head);
          font-size: 13px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .handover-modal__btn--ghost {
          background: var(--st-surface-container);
          color: var(--st-text);
        }
        .handover-modal__btn--ghost:hover {
          background: var(--st-surface-high);
        }

        .handover-modal__btn--primary {
          background: var(--st-primary-container);
          color: var(--st-on-primary);
        }
        .handover-modal__btn--primary:hover {
          background: var(--st-primary);
        }

        /* ---------- Tờ phiếu giao ca ---------- */
        .handover-sheet {
          background: #ffffff;
          color: #111827;
          padding: 28px 32px 32px;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          line-height: 1.5;
        }

        .handover-sheet__header {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 2px solid #111827;
        }

        .handover-sheet__logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .handover-sheet__logo-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .handover-sheet__logo-text b {
          font-family: "Plus Jakarta Sans", sans-serif;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
          color: #111827;
        }

        .handover-sheet__logo-text span {
          font-size: 11px;
          color: #6b7280;
        }

        .handover-sheet__title-wrap {
          text-align: center;
          min-width: 0;
        }

        .handover-sheet__title {
          margin: 0;
          font-family: "Plus Jakarta Sans", sans-serif;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #111827;
        }

        .handover-sheet__subtitle {
          display: block;
          font-size: 11px;
          color: #6b7280;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-top: 2px;
        }

        .handover-sheet__meta-right {
          text-align: right;
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 12px;
          white-space: nowrap;
        }

        .handover-sheet__meta-right b {
          color: #374151;
          font-weight: 700;
        }

        .handover-sheet__section {
          margin-top: 18px;
        }

        .handover-sheet__section-title {
          font-family: "Plus Jakarta Sans", sans-serif;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #004ac6;
          padding-bottom: 4px;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 8px;
        }

        .handover-sheet__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 24px;
        }

        .handover-sheet__row {
          display: flex;
          align-items: baseline;
          gap: 8px;
          padding: 3px 0;
        }

        .handover-sheet__label {
          color: #6b7280;
          min-width: 110px;
        }

        .handover-sheet__value {
          font-weight: 600;
          color: #111827;
          flex: 1;
        }

        .handover-sheet__table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }

        .handover-sheet__table td {
          padding: 5px 8px;
          border-bottom: 1px dashed #e5e7eb;
        }

        .handover-sheet__table tr:last-child td {
          border-bottom: 0;
        }

        .handover-sheet__num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          font-weight: 700;
          color: #111827;
          white-space: nowrap;
        }

        .handover-sheet__num--big {
          font-size: 15px;
          color: #004ac6;
        }

        .handover-sheet__note-box {
          padding: 4px 0;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .handover-sheet__note-line {
          border-bottom: 1px dotted #9ca3af;
          height: 1px;
        }

        .handover-sheet__signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 24px;
        }

        .handover-sheet__sign {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          text-align: center;
        }

        .handover-sheet__sign b {
          font-family: "Plus Jakarta Sans", sans-serif;
          font-size: 12.5px;
          font-weight: 800;
          color: #111827;
        }

        .handover-sheet__sign span {
          font-size: 11px;
          color: #6b7280;
          font-style: italic;
        }

        .handover-sheet__sign-space {
          height: 56px;
        }

        .handover-sheet__sign-name {
          font-family: "Plus Jakarta Sans", sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #111827;
          border-top: 1px solid #111827;
          padding-top: 4px;
          min-width: 160px;
        }

        .handover-sheet__footer {
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 10.5px;
          color: #9ca3af;
        }

        /* ---------- @media print ---------- */
        @media print {
          body * { visibility: hidden !important; }
          #handover-print-area, #handover-print-area * { visibility: visible !important; }
          #handover-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #fff !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 20px 24px !important;
          }
          .no-print { display: none !important; }
          .handover-overlay {
            position: static !important;
            background: #fff !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .handover-modal {
            max-width: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// REGISTER MODAL
// ============================================================
function getNextWeekDays() {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMon = day === 0 ? 1 : 8 - day;
  const nextMon = new Date(d);
  nextMon.setDate(d.getDate() + daysUntilMon);
  nextMon.setHours(0, 0, 0, 0);

  const arr = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(nextMon);
    dd.setDate(nextMon.getDate() + i);
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, "0");
    const dt = String(dd.getDate()).padStart(2, "0");
    arr.push(`${y}-${m}-${dt}`);
  }
  return arr;
}

function RegisterModal({ existingShifts = [], onSave, onClose }) {
  const { t } = useI18n();
  const displayWeekDays = useMemo(() => getNextWeekDays(), []);

  const [dateShifts, setDateShifts] = useState({});
  const [activeDate, setActiveDate] = useState(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  const currentShifts = activeDate ? dateShifts[activeDate] || [] : [];

  const toggleShift = (shiftId) => {
    if (!activeDate) {
      toast(t("Vui lòng chọn ngày trước"), "error");
      return;
    }
    setDateShifts((prev) => {
      const cur = prev[activeDate] || [];
      const has = cur.includes(shiftId);
      const next = has ? cur.filter((x) => x !== shiftId) : [...cur, shiftId];
      const copy = { ...prev };
      if (next.length === 0) delete copy[activeDate];
      else copy[activeDate] = next;
      return copy;
    });
  };

  const applyToWholeWeek = () => {
    const tpl = currentShifts.length > 0 ? currentShifts : ["Ca sáng"];
    const next = { ...dateShifts };
    for (const d of displayWeekDays) next[d] = [...tpl];
    setDateShifts(next);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const dates = Object.keys(dateShifts).filter(
      (d) => dateShifts[d]?.length > 0
    );
    if (!dates.length) {
      toast(t("Chọn ít nhất 1 ngày và 1 ca"), "error");
      return;
    }
    setSubmitting(true);
    try {
      await onSave({
        dates,
        shifts: Object.values(dateShifts).flat(),
        dateShifts,
        note,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const totalAssignments = Object.values(dateShifts).reduce(
    (s, arr) => s + (arr?.length || 0),
    0
  );

  return (
    <div
      onClick={() => !submitting && onClose()}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: MODAL_Z,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--st-surface, #fff)",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3
            style={{
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--st-text, #172033)",
            }}
          >
            <ClipboardList size={20} /> {t("Đăng ký ca làm")}
          </h3>
          <button
            onClick={() => !submitting && onClose()}
            type="button"
            aria-label={t("Đóng")}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--st-text-muted, #8993a3)",
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            marginBottom: 14,
            padding: "8px 12px",
            background: "rgba(38, 52, 213, 0.08)",
            borderRadius: 8,
            fontSize: 12,
            color: "#2634d5",
            fontWeight: 600,
          }}
        >
          📅 {t("Đăng ký cho tuần sau")} · {t("Admin sẽ duyệt")}
        </div>

        <form onSubmit={submit}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 8,
              marginTop: 12,
              color: "var(--st-text-muted, #475569)",
            }}
          >
            {t("Ngày")} *{" "}
            <span style={{ fontWeight: 400, color: "#94a3b8" }}>
              ({t("bấm ngày → chọn ca")})
            </span>
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            {displayWeekDays.map((d) => {
              const isActive = activeDate === d;
              const isAssigned = dateShifts[d] && dateShifts[d].length > 0;
              const dayLabel = new Date(d + "T00:00:00").toLocaleDateString(
                "vi-VN",
                { weekday: "short" }
              );
              let bg = "var(--st-surface-low, #f5f7fb)";
              let color = "var(--st-text, #172033)";
              let border = "1px solid var(--st-outline, #e5e9ef)";
              if (isAssigned && !isActive) {
                bg = "#d1fae5";
                color = "#065f46";
                border = "1px solid #18a967";
              }
              if (isActive) {
                bg = isAssigned ? "#18a967" : "#2634d5";
                color = "#fff";
                border = "2px solid " + (isAssigned ? "#18a967" : "#2634d5");
              }
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setActiveDate(d)}
                  disabled={submitting}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 8,
                    background: bg,
                    color,
                    border,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600 }}>
                    {dayLabel}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {d.slice(8)}
                  </span>
                </button>
              );
            })}
          </div>

          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 8,
              marginTop: 16,
              color: "var(--st-text-muted, #475569)",
            }}
          >
            {t("Ca làm")} *
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10,
            }}
          >
            {SHIFTS.map((s) => {
              const Icon = s.icon;
              const sel = currentShifts.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleShift(s.id)}
                  disabled={submitting}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 10,
                    background: sel ? s.color + "20" : "var(--st-surface, #fff)",
                    border: sel
                      ? "2px solid " + s.color
                      : "2px solid var(--st-outline, #e5e9ef)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon
                    size={18}
                    style={{ color: sel ? s.color : "#94a3b8" }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: sel ? s.color : "var(--st-text-muted, #475569)",
                    }}
                  >
                    {s.label}
                  </span>
                  <span style={{ fontSize: 9, color: "#94a3b8" }}>
                    {s.time}
                  </span>
                </button>
              );
            })}
          </div>

          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 4,
              marginTop: 12,
              color: "var(--st-text-muted, #475569)",
            }}
          >
            {t("Ghi chú")}
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("VD: Có thể đến trễ 10 phút...")}
            disabled={submitting}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid var(--st-outline, #e5e9ef)",
              borderRadius: 8,
              outline: "none",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />

          {totalAssignments > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(38, 52, 213, 0.08)",
                borderRadius: 8,
                fontSize: 12,
                color: "#2634d5",
                fontWeight: 600,
              }}
            >
              📋 {t("Sẽ đăng ký")} <b>{totalAssignments}</b> {t("ca")} —{" "}
              {t("chờ admin duyệt")}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                flex: 1,
                padding: 12,
                border: "1px solid var(--st-outline, #e5e9ef)",
                borderRadius: 8,
                background: "var(--st-surface, #fff)",
                cursor: "pointer",
                color: "var(--st-text, #172033)",
                fontWeight: 600,
              }}
            >
              {t("Hủy")}
            </button>
            <button
              type="submit"
              disabled={submitting || totalAssignments === 0}
              style={{
                flex: 1,
                padding: 12,
                background:
                  submitting || totalAssignments === 0 ? "#94a3b8" : "#2634d5",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                fontWeight: 700,
                cursor:
                  submitting || totalAssignments === 0
                    ? "not-allowed"
                    : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Save size={14} />{" "}
              {submitting ? t("Đang gửi...") : t("Đăng ký ca")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}