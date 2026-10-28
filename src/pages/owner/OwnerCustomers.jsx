// ============================================================
// OWNERCUSTOMERS.JSX — Quản lý khách hàng + Mã ngành (V5 — B9.6a)
// ============================================================
// V5:
//   - Bug 1: toast set xu dùng object interpolation (không .replace)
//   - Bug 2: fmtNumber dùng locale (không hardcode vi-VN)
//   - Bug 3: toLocaleDateString voucher dùng locale
//   - Bug 4: xoá dead state filterFaculty + facultyOptions
//   - Bug 5: thêm submittingRef cho saveEdit/savePoints/saveMajor
//   - Bug 6: Modal thêm body scroll lock
// ============================================================

import { SkeletonTable } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search, Lock, Unlock, Trash2, Eye, Mail, Phone, Ticket, Gift,
  Ban, X, Copy, Check, Users, Globe, User as UserIcon, Loader2,
  AlertCircle, Edit, Award, GraduationCap, Unlink, Plus, RefreshCw,
  Save, UserRound, ChevronDown, RotateCcw, Shield,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function validatePhone(phone, t) {
  const p = String(phone || "").trim();
  if (!p) return null;
  if (!/^0\d{9,10}$/.test(p)) return t("SĐT phải bắt đầu bằng 0 và có 10-11 chữ số");
  return null;
}

function getMemberTier(totalSpent) {
  const v = Number(totalSpent) || 0;
  if (v >= 10000000) return "Hạng Kim cương";
  if (v >= 3000000) return "Hạng Vàng";
  if (v >= 1000000) return "Hạng Bạc";
  return "Thành viên mới";
}

const TIER_BADGE = {
  "Thành viên mới": { color: "#64748b", bg: "#f1f5f9", icon: "👤" },
  "Hạng Bạc":       { color: "#475569", bg: "#e2e8f0", icon: "🥈" },
  "Hạng Vàng":      { color: "#f59e0b", bg: "#fef3c7", icon: "🏆" },
  "Hạng Kim cương": { color: "#0EA5E9", bg: "#e0f2fe", icon: "💎" },
};

const TIER_THRESHOLDS = [
  { id: "all",             label: "Tất cả hạng" },
  { id: "Thành viên mới",  label: "Thành viên mới" },
  { id: "Hạng Bạc",        label: "Hạng Bạc" },
  { id: "Hạng Vàng",       label: "Hạng Vàng" },
  { id: "Hạng Kim cương",  label: "Hạng Kim cương" },
];

function getCustomerType(email) {
  const e = String(email || "").toLowerCase().trim();
  if (e.endsWith("@vwa.edu.vn")) return "Giảng viên";
  if (e.endsWith("@hpn.edu.vn")) return "Sinh viên";
  return "Khách";
}

const TYPE_BADGE = {
  "Giảng viên": { color: "#8b5cf6", bg: "#ede9fe", icon: "🎓" },
  "Sinh viên":  { color: "#0EA5E9", bg: "#e0f2fe", icon: "🎓" },
  "Khách":      { color: "#f59e0b", bg: "#fef3c7", icon: "👤" },
};

const CUSTOMER_GRADIENT = "linear-gradient(135deg, #f59e0b, #ef4444)";
const VOUCHER_GRADIENT = "linear-gradient(135deg, #8b5cf6, #ec4899)";
const USED_GRADIENT = "linear-gradient(135deg, #94a3b8, #64748b)";
const MODAL_Z = 2147483600;

export default function OwnerCustomers() {
  const { t, locale } = useI18n();

  const [activeTab, setActiveTab] = useState("customers");

  const STATUS_FILTERS = useMemo(
    () => [
      { id: "all",    label: t("Tất cả") },
      { id: "active", label: t("Hoạt động") },
      { id: "locked", label: t("Bị khóa") },
    ],
    [t]
  );

  const CUSTOMER_TYPE_FILTERS = useMemo(
    () => [
      { id: "all",        label: t("Tất cả loại") },
      { id: "Giảng viên", label: t("Giảng viên") },
      { id: "Sinh viên",  label: t("Sinh viên")  },
      { id: "Khách",      label: t("Khách")      },
    ],
    [t]
  );

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [orders, setOrders] = useState([]);
  const [openStatus, setOpenStatus] = useState(false);
  const [openType, setOpenType] = useState(false);
  const [openTier, setOpenTier] = useState(false);

  const [detail, setDetail] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [voucherModal, setVoucherModal] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [voucherStats, setVoucherStats] = useState({
    total: 0, used: 0, available: 0, totalValue: 0,
  });
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [voucherTab, setVoucherTab] = useState("active");
  const [copiedId, setCopiedId] = useState(null);

  const [pointsModal, setPointsModal] = useState(null);
  const [pointsForm, setPointsForm] = useState({ points: "", reason: "" });
  const [pointsSaving, setPointsSaving] = useState(false);
  const [pointsError, setPointsError] = useState("");

  const [majorsMap, setMajorsMap] = useState({});
  const [majorsLoading, setMajorsLoading] = useState(false);
  const [majorsQ, setMajorsQ] = useState("");
  const [majorEditModal, setMajorEditModal] = useState(null);
  const [majorForm, setMajorForm] = useState({ code: "", name: "", faculty: "", code_full: "" });
  const [majorSaving, setMajorSaving] = useState(false);
  const [majorError, setMajorError] = useState("");

  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // 🔧 B9.6a — chống double-submit
  const saveEditRef = useRef(false);
  const savePointsRef = useRef(false);
  const saveMajorRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.users.list("CUSTOMER");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || t("Không tải được danh sách khách hàng"));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api.orders.all("Tất cả");
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    }
  }, []);

  const loadMajors = useCallback(async () => {
    setMajorsLoading(true);
    try {
      const res = await api.school.majorsMap();
      setMajorsMap(res && typeof res === "object" ? res : {});
    } catch (e) {
      toast(e.message || t("Không tải được bảng mã ngành"), "error");
      setMajorsMap({});
    } finally {
      setMajorsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    loadOrders();
  }, [load, loadOrders]);

  useEffect(() => {
    if (activeTab === "majors" && Object.keys(majorsMap).length === 0) {
      loadMajors();
    }
  }, [activeTab, majorsMap, loadMajors]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (majorEditModal && !majorSaving) setMajorEditModal(null);
      else if (pointsModal && !pointsSaving) setPointsModal(null);
      else if (editModal && !saving) setEditModal(null);
      else if (voucherModal) setVoucherModal(null);
      else if (detail) setDetail(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editModal, voucherModal, detail, pointsModal, majorEditModal, saving, pointsSaving, majorSaving]);

  const statusCounts = useMemo(() => {
    const active = list.filter((c) => (c.status || "Hoạt động") === "Hoạt động").length;
    const locked = list.length - active;
    return { all: list.length, active, locked };
  }, [list]);

  const typeCounts = useMemo(() => {
    const counts = { all: list.length };
    for (const c of list) {
      const t2 = getCustomerType(c.email);
      counts[t2] = (counts[t2] || 0) + 1;
    }
    return counts;
  }, [list]);

  const tierSpentMap = useMemo(() => {
    const map = {};
    for (const o of orders) {
      if (o.status !== "Hoàn thành") continue;
      const uid = o.user_id || o.customer_id;
      if (uid == null) continue;
      map[uid] = (map[uid] || 0) + (Number(o.total) || 0);
    }
    return map;
  }, [orders]);

  const tierCounts = useMemo(() => {
    const counts = { all: list.length };
    for (const c of list) {
      const spent = tierSpentMap[c.id] || 0;
      const tier = getMemberTier(spent);
      counts[tier] = (counts[tier] || 0) + 1;
    }
    return counts;
  }, [list, tierSpentMap]);

  const filtered = useMemo(() => {
    let result = list;

    if (filterStatus === "active") {
      result = result.filter((c) => (c.status || "Hoạt động") === "Hoạt động");
    } else if (filterStatus === "locked") {
      result = result.filter((c) => c.status === "Bị khóa");
    }

    if (filterType !== "all") {
      result = result.filter((c) => getCustomerType(c.email) === filterType);
    }

    if (filterTier !== "all") {
      result = result.filter((c) => {
        const spent = tierSpentMap[c.id] || 0;
        return getMemberTier(spent) === filterTier;
      });
    }

    if (q.trim()) {
      const s = normalize(q);
      result = result.filter(
        (c) =>
          normalize(c.name).includes(s) ||
          normalize(c.email).includes(s) ||
          (c.phone || "").includes(q.trim()) ||
          (c.student_code || "").includes(q.trim()) ||
          normalize(c.major_name || "").includes(s)
      );
    }

    return result;
  }, [list, q, filterStatus, filterType, filterTier, tierSpentMap]);

  const hasFilter = q.trim() !== "" || filterStatus !== "all" || filterType !== "all" || filterTier !== "all";

  const clearFilters = () => {
    setQ("");
    setFilterStatus("all");
    setFilterType("all");
    setFilterTier("all");
  };

  const filteredMajors = useMemo(() => {
    const entries = Object.entries(majorsMap);
    if (!majorsQ.trim()) return entries;
    const s = normalize(majorsQ);
    return entries.filter(([code, m]) =>
      code.includes(majorsQ.trim()) ||
      normalize(m.name).includes(s) ||
      normalize(m.faculty).includes(s)
    );
  }, [majorsMap, majorsQ]);

  const closeConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirm(null);
  }, [confirmBusy]);

  const runConfirm = useCallback(async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmBusy(false);
    }
  }, [confirm, confirmBusy]);

  const toggleLock = (c) => {
    const newStatus = c.status === "Hoạt động" ? "Bị khóa" : "Hoạt động";
    const isLocking = newStatus === "Bị khóa";

    setConfirm({
      title: isLocking
        ? t("Khóa tài khoản") + ` "${c.name}"?`
        : t("Mở khóa tài khoản") + ` "${c.name}"?`,
      message: isLocking
        ? t("Khách hàng sẽ không thể đăng nhập và đặt món cho đến khi được mở lại.")
        : t("Khách hàng sẽ có thể đăng nhập và đặt món trở lại."),
      confirmText: isLocking ? t("Khóa tài khoản") : t("Mở khóa"),
      cancelText: t("Hủy"),
      danger: isLocking,
      onConfirm: async () => {
        await api.users.update(c.id, { status: newStatus });
        toast(isLocking ? t("Đã khóa tài khoản") : t("Đã mở khóa tài khoản"), "success");
        setConfirm(null);
        load();
      },
    });
  };

  const remove = (c) => {
    setConfirm({
      title: t("Xóa tài khoản") + ` "${c.name}"?`,
      message:
        t("Hành động này không thể hoàn tác. Toàn bộ dữ liệu liên quan") +
        " " +
        t("(đơn hàng, ví, voucher, chat...) sẽ bị xoá vĩnh viễn."),
      confirmText: t("Xóa vĩnh viễn"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        await api.users.remove(c.id);
        toast(t("Đã xóa tài khoản"), "success");
        setConfirm(null);
        load();
      },
    });
  };

  const openEdit = (c) => {
    setEditError("");
    setEditModal(c);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (saveEditRef.current) return;

    const f = new FormData(e.currentTarget);
    const name = f.get("name")?.trim();
    const phone = f.get("phone")?.trim();
    const status = f.get("status");

    if (!name) return setEditError(t("Vui lòng nhập họ tên"));
    const phoneErr = validatePhone(phone, t);
    if (phoneErr) return setEditError(phoneErr);

    setEditError("");
    saveEditRef.current = true;
    setSaving(true);
    try {
      await api.users.update(editModal.id, { name, phone, status });
      toast(t("Đã cập nhật thông tin khách hàng"), "success");
      setEditModal(null);
      load();
    } catch (e) {
      setEditError(e.message || t("Không lưu được"));
    } finally {
      saveEditRef.current = false;
      setSaving(false);
    }
  };

  const openPointsModal = (c) => {
    setPointsError("");
    setPointsForm({ points: String(c.points || 0), reason: "" });
    setPointsModal(c);
  };

  const savePoints = async () => {
    if (savePointsRef.current) return;
    setPointsError("");

    const p = Number(pointsForm.points);
    if (!Number.isFinite(p) || p < 0) {
      setPointsError(t("Xu phải là số >= 0"));
      return;
    }

    savePointsRef.current = true;
    setPointsSaving(true);
    try {
      await api.users.setPoints(pointsModal.id, {
        points: p,
        reason: pointsForm.reason.trim(),
      });

      toast(t("Đã set xu thành công: {n} xu", { n: p }), "success");
      setPointsModal(null);
      load();
    } catch (e) {
      setPointsError(e.message || t("Không set được xu"));
    } finally {
      savePointsRef.current = false;
      setPointsSaving(false);
    }
  };

  const unlinkMssv = (c) => {
    setConfirm({
      title: t("Gỡ liên kết MSSV") + ` "${c.name}"?`,
      message:
        t("MSSV") +
        ` ${c.student_code} ` +
        t("sẽ bị gỡ khỏi tài khoản này. Khách hàng sẽ mất thông tin ngành/khoa và cần liên kết lại từ đầu."),
      confirmText: t("Gỡ liên kết"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        await api.users.unlinkMssv(c.id);
        toast(t("Đã gỡ liên kết MSSV"), "success");
        setConfirm(null);
        load();
      },
    });
  };

  const loadVouchers = async (customer) => {
    setVoucherModal(customer);
    setVoucherTab("active");
    setLoadingVouchers(true);
    setVouchers([]);
    setVoucherStats({ total: 0, used: 0, available: 0, totalValue: 0 });

    try {
      const res = await api.vouchers.ofUser(customer.id);
      setVouchers(res?.vouchers || []);
      setVoucherStats(res?.stats || { total: 0, used: 0, available: 0, totalValue: 0 });
    } catch (e) {
      toast(e.message || t("Không tải được ví voucher"), "error");
    } finally {
      setLoadingVouchers(false);
    }
  };

  const revokeVoucher = (v) => {
    setConfirm({
      title: t("Thu hồi voucher") + ` "${v.code}"?`,
      message:
        t("Voucher trị giá") + ` ${fmtMoney(v.value)} ` +
        t("sẽ bị thu hồi khỏi ví của khách hàng và không thể khôi phục."),
      confirmText: t("Thu hồi"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        await api.vouchers.revoke(v.id);
        toast(t("Đã thu hồi voucher"), "success");
        setConfirm(null);
        if (voucherModal) loadVouchers(voucherModal);
      },
    });
  };

  const copyCode = (v) => {
    navigator.clipboard.writeText(v.code);
    setCopiedId(v.id);
    toast(t("Đã sao chép mã") + " " + v.code, "success");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const openAddMajor = () => {
    setMajorError("");
    setMajorForm({ code: "", name: "", faculty: "", code_full: "" });
    setMajorEditModal({ isNew: true });
  };

  const openEditMajor = (code, info) => {
    setMajorError("");
    setMajorForm({
      code,
      name: info.name || "",
      faculty: info.faculty || "",
      code_full: info.code_full || "",
    });
    setMajorEditModal({ isNew: false, originalCode: code });
  };

  const saveMajor = async () => {
    if (saveMajorRef.current) return;
    setMajorError("");

    const code = majorForm.code.trim();
    const name = majorForm.name.trim();
    const faculty = majorForm.faculty.trim();
    const code_full = majorForm.code_full.trim();

    if (!code) return setMajorError(t("Vui lòng nhập mã ngành"));
    if (!/^\d{3,4}$/.test(code)) return setMajorError(t("Mã ngành phải là 3 hoặc 4 chữ số"));
    if (!name) return setMajorError(t("Vui lòng nhập tên ngành"));

    if (majorEditModal?.isNew && majorsMap[code]) {
      return setMajorError(t("Mã ngành này đã tồn tại"));
    }
    if (
      !majorEditModal?.isNew &&
      code !== majorEditModal.originalCode &&
      majorsMap[code]
    ) {
      return setMajorError(t("Mã ngành này đã tồn tại"));
    }

    saveMajorRef.current = true;
    setMajorSaving(true);
    try {
      const newMap = { ...majorsMap };
      if (!majorEditModal?.isNew && code !== majorEditModal.originalCode) {
        delete newMap[majorEditModal.originalCode];
      }
      newMap[code] = { name, faculty, code_full };

      const d = await api.school.updateMajorsMap(newMap);
      setMajorsMap(d.map || newMap);
      toast(
        majorEditModal?.isNew ? t("Đã thêm mã ngành") : t("Đã cập nhật mã ngành"),
        "success"
      );
      setMajorEditModal(null);
    } catch (e) {
      setMajorError(e.message || t("Không lưu được"));
    } finally {
      saveMajorRef.current = false;
      setMajorSaving(false);
    }
  };

  const deleteMajor = (code, info) => {
    setConfirm({
      title: t("Xoá mã ngành") + ` "${code}"?`,
      message:
        t("Mã ngành") + ` "${info.name}" ` +
        t("sẽ bị xoá. Sinh viên đã liên kết với mã này vẫn giữ thông tin cũ, nhưng sinh viên mới sẽ không tra cứu được."),
      confirmText: t("Xoá"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        const newMap = { ...majorsMap };
        delete newMap[code];

        const d = await api.school.updateMajorsMap(newMap);
        setMajorsMap(d.map || newMap);
        toast(t("Đã xoá mã ngành"), "success");
        setConfirm(null);
      },
    });
  };

  const resetMajors = () => {
    setConfirm({
      title: t("Khôi phục bảng mã ngành mặc định?"),
      message: t("Toàn bộ thay đổi của bạn sẽ bị mất và quay về bảng 10 mã ngành gốc."),
      confirmText: t("Khôi phục"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        const d = await api.school.resetMajorsMap();
        setMajorsMap(d.map || {});
        toast(t("Đã khôi phục bảng mã ngành mặc định"), "success");
        setConfirm(null);
      },
    });
  };

  const getInitials = (name) => (name || "?").slice(0, 2).toUpperCase();

  // 🔧 B9.6a — fmtNumber/fmtMoney dùng locale
  const fmtNumber = useCallback((n) => {
    if (typeof n !== "number") return n ?? "—";
    try {
      return new Intl.NumberFormat(locale || "vi").format(n);
    } catch {
      return String(n);
    }
  }, [locale]);

  const fmtMoney = useCallback(
    (n) => fmtNumber(n) + "đ",
    [fmtNumber]
  );

  const getVoucherSource = (v) => {
    if (v.claimed_from)
      return { label: t("Nhận từ ƯĐ"), color: "#8b5cf6", bg: "#ede9fe", icon: Globe };
    if (v.points_used > 0)
      return { label: t("Đổi xu"), color: "#f59e0b", bg: "#fef3c7", icon: Gift };
    return { label: t("Admin tặng"), color: "#2634d5", bg: "#eef2ff", icon: UserIcon };
  };

  const visibleVouchers = useMemo(
    () => vouchers.filter((v) => (voucherTab === "active" ? !v.used : v.used)),
    [vouchers, voucherTab]
  );

  return (
    <>
      <div>
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            background: "var(--bg-tertiary, #f5f7fb)",
            padding: 4,
            borderRadius: 12,
            width: "fit-content",
          }}
        >
          <button
            onClick={() => setActiveTab("customers")}
            style={{
              padding: "10px 20px",
              background: activeTab === "customers" ? "#2634d5" : "transparent",
              color: activeTab === "customers" ? "#fff" : "var(--text-muted, #475569)",
              border: 0,
              borderRadius: 9,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <Users size={16} />
            {t("Khách hàng")}
            <span
              style={{
                background: activeTab === "customers" ? "rgba(255,255,255,0.3)" : "var(--card-bg, #e2e8f0)",
                color: activeTab === "customers" ? "#fff" : "var(--text-muted, #64748b)",
                minWidth: 22, height: 18, padding: "0 6px", borderRadius: 10,
                fontSize: 11, fontWeight: 800,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {list.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("majors")}
            style={{
              padding: "10px 20px",
              background: activeTab === "majors" ? "#2634d5" : "transparent",
              color: activeTab === "majors" ? "#fff" : "var(--text-muted, #475569)",
              border: 0, borderRadius: 9, cursor: "pointer",
              fontSize: 13, fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
            }}
          >
            <GraduationCap size={16} />
            {t("Mã ngành")}
            <span
              style={{
                background: activeTab === "majors" ? "rgba(255,255,255,0.3)" : "var(--card-bg, #e2e8f0)",
                color: activeTab === "majors" ? "#fff" : "var(--text-muted, #64748b)",
                minWidth: 22, height: 18, padding: "0 6px", borderRadius: 10,
                fontSize: 11, fontWeight: 800,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {Object.keys(majorsMap).length}
            </span>
          </button>
        </div>

        {activeTab === "customers" && (
          <>
            <div
              style={{
                background: "var(--card-bg, #fff)",
                border: "1px solid var(--border-color, #e7ebf0)",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "var(--bg-tertiary, #f8fafc)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 10,
                  padding: "9px 14px",
                  flex: 1,
                  minWidth: 240,
                }}
              >
                <Search size={18} style={{ color: "var(--text-light, #8993a3)", flexShrink: 0 }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("Tìm theo tên, email, MSSV, SĐT...")}
                  style={{
                    flex: 1, border: 0, outline: "none", background: "transparent",
                    color: "var(--text-primary, #172033)", fontSize: 13, minWidth: 0,
                  }}
                />
                {q && (
                  <button
                    onClick={() => setQ("")}
                    style={{
                      background: "transparent", border: 0, cursor: "pointer",
                      color: "var(--text-light, #8993a3)", padding: 2,
                      display: "grid", placeItems: "center",
                    }}
                    aria-label={t("Xoá tìm kiếm")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px",
                  background: "var(--bg-tertiary, #f8fafc)",
                  borderRadius: 10, fontSize: 13,
                  color: "var(--text-primary, #172033)",
                  fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                <Users size={16} />
                <b>{filtered.length}</b>
                <span style={{ color: "var(--text-muted, #64748b)", fontWeight: 500 }}>
                  {t("khách hàng")}
                </span>
              </div>

              {hasFilter && (
                <button
                  onClick={clearFilters}
                  style={{
                    padding: "9px 16px",
                    background: "var(--card-bg, #fff)",
                    border: "1px solid var(--border-color, #cbd5e1)",
                    color: "var(--text-primary, #172033)",
                    borderRadius: 10, fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  <RotateCcw size={14} />
                  {t("Xoá lọc")}
                </button>
              )}
            </div>

            <div
              style={{
                background: "var(--card-bg, #fff)",
                border: "1px solid var(--border-color, #e7ebf0)",
                borderRadius: 12,
                padding: "16px 20px",
                marginBottom: 20,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 20,
                alignItems: "start",
              }}
            >
              <div>
                <button
                  onClick={() => setOpenStatus((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, cursor: "pointer", padding: 0, width: "100%", textAlign: "left", marginBottom: openStatus ? 10 : 0 }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2ff", color: "#2634d5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Shield size={16} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)", flex: 1 }}>
                    {t("Trạng thái")}
                  </span>
                  <ChevronDown size={14} style={{ color: "var(--text-muted, #64748b)", transition: "transform 0.2s", transform: openStatus ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
                {openStatus && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {STATUS_FILTERS.map((f) => {
                      const active = filterStatus === f.id;
                      const count = statusCounts[f.id] || 0;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setFilterStatus(f.id)}
                          style={{ padding: "6px 12px", background: active ? "#2634d5" : "var(--card-bg, #fff)", color: active ? "#fff" : "var(--text-muted, #475569)", border: "1px solid " + (active ? "#2634d5" : "var(--border-color, #e5e9ef)"), borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                        >
                          {f.label}
                          <span style={{ background: active ? "rgba(255,255,255,0.25)" : "var(--bg-tertiary, #f1f5f9)", color: active ? "#fff" : "var(--text-muted, #64748b)", minWidth: 18, height: 16, padding: "0 5px", borderRadius: 8, fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ paddingLeft: 20, borderLeft: "1px solid var(--border-color, #eef2f7)" }}>
                <button
                  onClick={() => setOpenType((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, cursor: "pointer", padding: 0, width: "100%", textAlign: "left", marginBottom: openType ? 10 : 0 }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2ff", color: "#2634d5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <UserRound size={16} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)", flex: 1 }}>
                    {t("Phân loại")}
                  </span>
                  <ChevronDown size={14} style={{ color: "var(--text-muted, #64748b)", transition: "transform 0.2s", transform: openType ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
                {openType && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {CUSTOMER_TYPE_FILTERS.map((f) => {
                      const active = filterType === f.id;
                      const count = typeCounts[f.id] || 0;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setFilterType(f.id)}
                          style={{ padding: "6px 12px", background: active ? "#2634d5" : "var(--card-bg, #fff)", color: active ? "#fff" : "var(--text-muted, #475569)", border: "1px solid " + (active ? "#2634d5" : "var(--border-color, #e5e9ef)"), borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                        >
                          {f.label}
                          <span style={{ background: active ? "rgba(255,255,255,0.25)" : "var(--bg-tertiary, #f1f5f9)", color: active ? "#fff" : "var(--text-muted, #64748b)", minWidth: 18, height: 16, padding: "0 5px", borderRadius: 8, fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ paddingLeft: 20, borderLeft: "1px solid var(--border-color, #eef2f7)" }}>
                <button
                  onClick={() => setOpenTier((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, cursor: "pointer", padding: 0, width: "100%", textAlign: "left", marginBottom: openTier ? 10 : 0 }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2ff", color: "#2634d5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Award size={16} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)", flex: 1 }}>
                    {t("Hạng")}
                  </span>
                  <ChevronDown size={14} style={{ color: "var(--text-muted, #64748b)", transition: "transform 0.2s", transform: openTier ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
                {openTier && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {TIER_THRESHOLDS.map((f) => {
                      const active = filterTier === f.id;
                      const count = tierCounts[f.id] || 0;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setFilterTier(f.id)}
                          style={{ padding: "6px 12px", background: active ? "#2634d5" : "var(--card-bg, #fff)", color: active ? "#fff" : "var(--text-muted, #475569)", border: "1px solid " + (active ? "#2634d5" : "var(--border-color, #e5e9ef)"), borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                        >
                          {t(f.label)}
                          <span style={{ background: active ? "rgba(255,255,255,0.25)" : "var(--bg-tertiary, #f1f5f9)", color: active ? "#fff" : "var(--text-muted, #64748b)", minWidth: 18, height: 16, padding: "0 5px", borderRadius: 8, fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                background: "var(--card-bg, #fff)",
                border: "1px solid var(--border-color, #e7ebf0)",
                borderRadius: 12,
                padding: 20,
              }}
            >
              {loading && (
                <SkeletonTable
                  columns={9}
                  rows={5}
                  headers={[t("ID"), t("Khách hàng"), t("Liên hệ"), t("MSSV · Ngành"), t("Xu"), t("Hạng"), t("Loại"), t("Trạng thái"), t("Thao tác")]}
                />
              )}

              {!loading && error && (
                <div
                  style={{
                    textAlign: "center",
                    padding: 30,
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: 10,
                    color: "#ef4444",
                  }}
                >
                  <AlertCircle size={26} style={{ marginBottom: 10 }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("Không tải được dữ liệu")}</div>
                  <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>{error}</div>
                  <button
                    onClick={load}
                    style={{
                      padding: "8px 16px",
                      background: "#ef4444", color: "#fff", border: 0, borderRadius: 8,
                      cursor: "pointer", fontWeight: 600, fontSize: 13,
                    }}
                  >
                    {t("Thử lại")}
                  </button>
                </div>
              )}

              {!loading && !error && (
                <div style={{ overflowX: "auto" }}>
                  <table className="customer-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                        <th style={thStyle}>{t("ID")}</th>
                        <th style={thStyle}>{t("Khách hàng")}</th>
                        <th style={thStyle}>{t("Liên hệ")}</th>
                        <th style={thStyle}>{t("MSSV · Ngành")}</th>
                        <th style={thStyle}>{t("Xu")}</th>
                        <th style={thStyle}>{t("Hạng")}</th>
                        <th style={thStyle}>{t("Loại")}</th>
                        <th style={thStyle}>{t("Trạng thái")}</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tác")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c) => {
                        const hasMssv = !!c.student_code;
                        return (
                          <tr key={c.id} style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}>
                            <td style={tdStyle}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted, #64748b)" }}>
                                KH{c.id}
                              </span>
                            </td>

                            <td style={tdStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div
                                  style={{
                                    width: 34, height: 34, borderRadius: "50%",
                                    background: CUSTOMER_GRADIENT, color: "#fff",
                                    display: "grid", placeItems: "center",
                                    fontWeight: 700, fontSize: 12, flexShrink: 0,
                                  }}
                                >
                                  {getInitials(c.name)}
                                </div>
                                <b style={{ fontSize: 13 }}>{c.name}</b>
                              </div>
                            </td>

                            <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <span>
                                  <Mail size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />
                                  {c.email}
                                </span>
                                <span>
                                  <Phone size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />
                                  {c.phone || "—"}
                                </span>
                              </div>
                            </td>

                            <td style={tdStyle}>
                              {hasMssv ? (
                                <div
                                  title={`MSSV: ${c.student_code}${c.major_name ? ` · ${c.major_name}` : ""}`}
                                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                                >
                                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: "#0c4a6e" }}>
                                    {c.student_code}
                                  </span>
                                  {c.major_name && (
                                    <span style={{ fontSize: 11, color: "var(--text-muted, #64748b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                                      {c.major_name}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: "var(--text-light, #94a3b8)", fontStyle: "italic" }}>
                                  {t("Chưa liên kết")}
                                </span>
                              )}
                            </td>

                            <td style={tdStyle}>
                              <b style={{ color: "#f59e0b" }}>
                                {fmtNumber(c.points || 0)} {t("xu")}
                              </b>
                            </td>

                            <td style={tdStyle}>
                              <MemberTierBadge spent={tierSpentMap[c.id] || 0} t={t} />
                            </td>

                            <td style={tdStyle}>
                              <CustomerTypeBadge type={getCustomerType(c.email)} t={t} />
                            </td>

                            <td style={tdStyle}>
                              <StatusBadge status={c.status || "Hoạt động"} t={t} />
                            </td>

                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <IconButton onClick={() => loadVouchers(c)} title={t("Ví voucher")} color="#8b5cf6" bg="#f5f3ff">
                                  <Ticket size={15} />
                                </IconButton>
                                <IconButton onClick={() => setDetail(c)} title={t("Xem chi tiết")}>
                                  <Eye size={15} />
                                </IconButton>
                                <IconButton onClick={() => openEdit(c)} title={t("Sửa")}>
                                  <Edit size={15} />
                                </IconButton>
                                <IconButton onClick={() => openPointsModal(c)} title={t("Set xu")} color="#f59e0b" bg="#fff4d8">
                                  <Award size={15} />
                                </IconButton>
                                {hasMssv && (
                                  <IconButton onClick={() => unlinkMssv(c)} title={t("Gỡ liên kết MSSV")} color="#dc2626" bg="#fef2f2">
                                    <Unlink size={15} />
                                  </IconButton>
                                )}
                                <IconButton
                                  onClick={() => toggleLock(c)}
                                  title={c.status === "Hoạt động" ? t("Khóa tài khoản") : t("Mở khóa")}
                                  color={c.status === "Hoạt động" ? "#ef4444" : "#18a967"}
                                >
                                  {c.status === "Hoạt động" ? <Lock size={15} /> : <Unlock size={15} />}
                                </IconButton>
                                <IconButton onClick={() => remove(c)} title={t("Xóa")} color="#ef4444">
                                  <Trash2 size={15} />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {!filtered.length && (
                        <tr>
                          <td colSpan="9" style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
                            <Users size={36} style={{ opacity: 0.35, marginBottom: 10 }} />
                            <div>
                              {hasFilter
                                ? t("Không có khách hàng nào khớp bộ lọc")
                                : t("Chưa có khách hàng nào")}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "majors" && (
          <>
            <div
              style={{
                display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "var(--card-bg, #fff)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 10, padding: "10px 14px",
                  flex: 1, maxWidth: 400,
                }}
              >
                <Search size={18} style={{ color: "var(--text-light, #8993a3)" }} />
                <input
                  value={majorsQ}
                  onChange={(e) => setMajorsQ(e.target.value)}
                  placeholder={t("Tìm theo mã, tên ngành, khoa...")}
                  style={{
                    flex: 1, border: 0, outline: "none", fontSize: 13, background: "transparent",
                    color: "var(--text-primary, #172033)",
                  }}
                />
                {majorsQ && (
                  <button
                    onClick={() => setMajorsQ("")}
                    style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-light, #8993a3)", padding: 2 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <button
                onClick={openAddMajor}
                style={{
                  padding: "10px 16px", background: "#2634d5", color: "#fff",
                  border: 0, borderRadius: 10, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                <Plus size={15} /> {t("Thêm mã ngành")}
              </button>

              <button
                onClick={resetMajors}
                style={{
                  padding: "10px 16px", background: "transparent",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 10, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", color: "var(--text-muted, #475569)",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                <RefreshCw size={15} /> {t("Khôi phục mặc định")}
              </button>

              <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginLeft: "auto" }}>
                <b style={{ color: "var(--text-primary, #172033)" }}>{filteredMajors.length}</b>{" "}
                {t("mã ngành")}
              </div>
            </div>

            <div
              style={{
                background: "var(--card-bg, #fff)",
                border: "1px solid var(--border-color, #e7ebf0)",
                borderRadius: 12, padding: 20,
              }}
            >
              {majorsLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
                  <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                  <div style={{ fontSize: 13 }}>{t("Đang tải bảng mã ngành...")}</div>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="customer-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                        <th style={thStyle}>{t("Mã ngành")}</th>
                        <th style={thStyle}>{t("Tên ngành")}</th>
                        <th style={thStyle}>{t("Khoa")}</th>
                        <th style={thStyle}>{t("Mã Bộ GD")}</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tác")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMajors.map(([code, info]) => (
                        <tr key={code} style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}>
                          <td style={tdStyle}>
                            <span
                              style={{
                                display: "inline-flex", padding: "4px 10px", borderRadius: 8,
                                background: "#eef2ff", color: "#2634d5", fontWeight: 800,
                                fontFamily: "ui-monospace, monospace", fontSize: 13, letterSpacing: 0.5,
                              }}
                            >
                              {code}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <b style={{ fontSize: 13 }}>{info.name || "—"}</b>
                          </td>
                          <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                            {info.faculty || "—"}
                          </td>
                          <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted, #64748b)", fontFamily: "ui-monospace, monospace" }}>
                            {info.code_full || "—"}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <IconButton onClick={() => openEditMajor(code, info)} title={t("Sửa")}>
                                <Edit size={15} />
                              </IconButton>
                              <IconButton onClick={() => deleteMajor(code, info)} title={t("Xoá")} color="#ef4444">
                                <Trash2 size={15} />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {!filteredMajors.length && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
                            <GraduationCap size={36} style={{ opacity: 0.35, marginBottom: 10 }} />
                            <div>
                              {majorsQ
                                ? t("Không có mã ngành nào khớp tìm kiếm")
                                : t("Bảng mã ngành trống")}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {detail && (
          <Modal onClose={() => setDetail(null)} maxWidth={520} t={t}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 70, height: 70, borderRadius: "50%",
                  background: CUSTOMER_GRADIENT, color: "#fff",
                  display: "grid", placeItems: "center",
                  fontWeight: 700, fontSize: 24, margin: "0 auto 12px",
                }}
              >
                {getInitials(detail.name)}
              </div>
              <h3 style={{ margin: "0 0 6px", color: "var(--text-primary, #172033)" }}>{detail.name}</h3>
              <p style={{ color: "var(--text-muted, #64748b)", margin: 0, fontSize: 13 }}>{detail.email}</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20, textAlign: "left" }}>
                <InfoBlock label={t("Mã KH")} value={`KH${detail.id}`} />
                <InfoBlock label={t("SĐT")} value={detail.phone || "—"} />
                <InfoBlock label={t("Xu tích lũy")} value={fmtNumber(detail.points || 0)} highlight="#f59e0b" />
                <InfoBlock label={t("Trạng thái")} value={detail.status || t("Hoạt động")} />

                {detail.student_code ? (
                  <>
                    <InfoBlock label={t("MSSV")} value={detail.student_code} mono />
                    <InfoBlock label={t("Ngành học")} value={detail.major_name || "—"} />
                    <InfoBlock label={t("Khoa")} value={detail.faculty || "—"} />
                    <InfoBlock label={t("Năm nhập học")} value={detail.year_in ? String(detail.year_in) : "—"} />
                  </>
                ) : (
                  <div style={{ gridColumn: "span 2" }}>
                    <InfoBlock label={t("MSSV")} value={t("Chưa liên kết")} />
                  </div>
                )}
              </div>

              <button onClick={() => setDetail(null)} style={{ ...btnPrimaryStyle, marginTop: 16 }}>
                {t("Đóng")}
              </button>
            </div>
          </Modal>
        )}

        {editModal && (
          <Modal onClose={() => !saving && setEditModal(null)} maxWidth={480} t={t}>
            <h3 style={{ marginTop: 0, marginBottom: 20, color: "var(--text-primary, #172033)" }}>
              {t("Chỉnh sửa khách hàng")}
            </h3>
            <form onSubmit={saveEdit}>
              <label style={modalLabelStyle}>{t("Họ tên")} *</label>
              <input
                name="name"
                defaultValue={editModal.name}
                required
                style={modalInputStyle}
                autoFocus
                onChange={() => editError && setEditError("")}
              />

              <label style={modalLabelStyle}>{t("Số điện thoại")}</label>
              <input
                name="phone"
                defaultValue={editModal.phone || ""}
                placeholder={t("VD: 0901234567")}
                inputMode="numeric"
                style={{ ...modalInputStyle, borderColor: editError ? "#ef4444" : undefined }}
                onChange={() => editError && setEditError("")}
              />
              {editError && (
                <div style={{ color: "#ef4444", fontSize: 12, marginTop: -10, marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                  <AlertCircle size={12} /> {editError}
                </div>
              )}

              <label style={modalLabelStyle}>{t("Trạng thái")}</label>
              <select name="status" defaultValue={editModal.status || "Hoạt động"} style={modalInputStyle}>
                <option>{t("Hoạt động")}</option>
                <option>{t("Bị khóa")}</option>
              </select>

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button type="button" onClick={() => setEditModal(null)} disabled={saving} style={btnCancelStyle}>
                  {t("Hủy")}
                </button>
                <button type="submit" disabled={saving} style={btnPrimaryStyleLoading(saving)}>
                  {saving ? (
                    <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />{t("Đang lưu...")}</>
                  ) : t("Lưu thay đổi")}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {pointsModal && (
          <Modal onClose={() => !pointsSaving && setPointsModal(null)} maxWidth={460} t={t}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fff4d8", color: "#f59e0b", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Award size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, color: "var(--text-primary, #172033)", fontSize: 16 }}>
                  {t("Set xu cho khách hàng")}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                  {pointsModal.name} · {pointsModal.email}
                </p>
              </div>
            </div>

            <div style={{ background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted, #64748b)" }}>{t("Xu hiện tại")}:</span>
              <b style={{ color: "#f59e0b", fontSize: 16 }}>
                {fmtNumber(pointsModal.points || 0)} {t("xu")}
              </b>
            </div>

            <label style={modalLabelStyle}>{t("Xu mới")} *</label>
            <input
              type="number"
              min={0}
              value={pointsForm.points}
              onChange={(e) => { setPointsForm((f) => ({ ...f, points: e.target.value })); if (pointsError) setPointsError(""); }}
              style={{ ...modalInputStyle, borderColor: pointsError ? "#ef4444" : undefined, fontSize: 16, fontWeight: 700, color: "#f59e0b" }}
              autoFocus
              disabled={pointsSaving}
            />

            {Number(pointsForm.points) !== Number(pointsModal.points || 0) && (
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: -10, marginBottom: 12, color: Number(pointsForm.points) > Number(pointsModal.points || 0) ? "#18a967" : "#ef4444" }}>
                ({Number(pointsForm.points) > Number(pointsModal.points || 0) ? "+" : ""}
                {Number(pointsForm.points) - Number(pointsModal.points || 0)} {t("xu")})
              </div>
            )}

            {pointsError && (
              <div style={{ color: "#ef4444", fontSize: 12, marginTop: -10, marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={12} /> {pointsError}
              </div>
            )}

            <label style={modalLabelStyle}>{t("Lý do (tùy chọn)")}</label>
            <input
              type="text"
              value={pointsForm.reason}
              onChange={(e) => setPointsForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder={t("VD: Thưởng sinh viên tích cực")}
              style={modalInputStyle}
              disabled={pointsSaving}
              maxLength={200}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setPointsModal(null)} disabled={pointsSaving} style={btnCancelStyle}>
                {t("Hủy")}
              </button>
              <button type="button" onClick={savePoints} disabled={pointsSaving} style={btnPrimaryStyleLoading(pointsSaving)}>
                {pointsSaving ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />{t("Đang lưu...")}</>
                ) : (
                  <><Award size={14} /> {t("Lưu xu")}</>
                )}
              </button>
            </div>
          </Modal>
        )}

        {majorEditModal && (
          <Modal onClose={() => !majorSaving && setMajorEditModal(null)} maxWidth={520} t={t}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eef2ff", color: "#2634d5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <GraduationCap size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, color: "var(--text-primary, #172033)", fontSize: 16 }}>
                  {majorEditModal.isNew ? t("Thêm mã ngành mới") : t("Sửa mã ngành")}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                  {majorEditModal.isNew
                    ? t("Mã ngành dùng để tra cứu thông tin sinh viên khi liên kết MSSV")
                    : `${t("Đang sửa")} ${majorEditModal.originalCode}`}
                </p>
              </div>
            </div>

            <label style={modalLabelStyle}>{t("Mã ngành")} * <span style={{ fontWeight: 400, color: "var(--text-light, #94a3b8)" }}>(3-4 chữ số)</span></label>
            <input
              type="text"
              value={majorForm.code}
              onChange={(e) => {
                setMajorForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 4) }));
                if (majorError) setMajorError("");
              }}
              placeholder={t("VD: 7482")}
              style={{ ...modalInputStyle, fontFamily: "ui-monospace, monospace", letterSpacing: 1 }}
              autoFocus
              disabled={majorSaving || !majorEditModal.isNew}
              inputMode="numeric"
              maxLength={4}
            />
            {!majorEditModal.isNew && (
              <div style={{ fontSize: 11, color: "var(--text-light, #94a3b8)", marginTop: -10, marginBottom: 10 }}>
                {t("Không thể đổi mã ngành sau khi đã tạo. Xoá và tạo mới nếu cần.")}
              </div>
            )}

            <label style={modalLabelStyle}>{t("Tên ngành")} *</label>
            <input
              type="text"
              value={majorForm.name}
              onChange={(e) => { setMajorForm((f) => ({ ...f, name: e.target.value })); if (majorError) setMajorError(""); }}
              placeholder={t("VD: Công nghệ thông tin / Thiết kế Game")}
              style={modalInputStyle}
              disabled={majorSaving}
              maxLength={200}
            />

            <label style={modalLabelStyle}>{t("Khoa")}</label>
            <input
              type="text"
              value={majorForm.faculty}
              onChange={(e) => setMajorForm((f) => ({ ...f, faculty: e.target.value }))}
              placeholder={t("VD: Khoa Công nghệ Thông tin & Truyền thông")}
              style={modalInputStyle}
              disabled={majorSaving}
              maxLength={200}
            />

            <label style={modalLabelStyle}>{t("Mã Bộ GD")}</label>
            <input
              type="text"
              value={majorForm.code_full}
              onChange={(e) => setMajorForm((f) => ({ ...f, code_full: e.target.value }))}
              placeholder={t("VD: 7480201")}
              style={{ ...modalInputStyle, fontFamily: "ui-monospace, monospace" }}
              disabled={majorSaving}
              maxLength={20}
            />

            {majorError && (
              <div style={{ color: "#ef4444", fontSize: 12, marginTop: -10, marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={12} /> {majorError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setMajorEditModal(null)} disabled={majorSaving} style={btnCancelStyle}>
                {t("Hủy")}
              </button>
              <button type="button" onClick={saveMajor} disabled={majorSaving} style={btnPrimaryStyleLoading(majorSaving)}>
                {majorSaving ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />{t("Đang lưu...")}</>
                ) : (
                  <><Save size={14} /> {majorEditModal.isNew ? t("Thêm") : t("Lưu")}</>
                )}
              </button>
            </div>
          </Modal>
        )}

        {voucherModal && (
          <Modal onClose={() => setVoucherModal(null)} maxWidth={620} t={t}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 50, height: 50, borderRadius: "50%", background: CUSTOMER_GRADIENT, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                  {getInitials(voucherModal.name)}
                </div>
                <div>
                  <h3 style={{ margin: 0, color: "var(--text-primary, #172033)", display: "flex", alignItems: "center", gap: 6, fontSize: 16 }}>
                    <Ticket size={18} style={{ color: "#8b5cf6" }} /> {t("Ví voucher")}
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--text-light, #8993a3)", marginTop: 2 }}>
                    <b style={{ color: "var(--text-primary, #172033)" }}>{voucherModal.name}</b> · {voucherModal.email}
                  </div>
                </div>
              </div>
              <button onClick={() => setVoucherModal(null)} style={modalCloseStyle} aria-label={t("Đóng")}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
              <MiniStat label={t("TỔNG")} value={voucherStats.total} color="#2634d5" bg="#eef2ff" />
              <MiniStat label={t("KHẢ DỤNG")} value={voucherStats.available} color="#18a967" bg="#e8f9f1" />
              <MiniStat label={t("ĐÃ DÙNG")} value={voucherStats.used} color="#ef4444" bg="#fee2e2" />
              <MiniStat label={t("TỔNG GIÁ TRỊ")} value={fmtMoney(voucherStats.totalValue || 0)} color="#f59e0b" bg="#fff4d8" smallValue />
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "var(--bg-tertiary, #f5f7fb)", padding: 4, borderRadius: 10 }}>
              {[
                { id: "active", label: t("Khả dụng"), count: voucherStats.available, color: "#18a967" },
                { id: "used", label: t("Đã dùng"), count: voucherStats.used, color: "#ef4444" },
              ].map((tab) => {
                const isActive = voucherTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setVoucherTab(tab.id)}
                    style={{
                      flex: 1, padding: "10px 12px",
                      background: isActive ? tab.color : "transparent",
                      color: isActive ? "#fff" : "var(--text-muted, #475569)",
                      border: 0, borderRadius: 8, cursor: "pointer",
                      fontSize: 13, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    {tab.label}
                    <span style={{
                      background: isActive ? "rgba(255,255,255,0.3)" : "var(--bg-secondary, #e2e8f0)",
                      color: isActive ? "#fff" : "var(--text-muted, #475569)",
                      minWidth: 22, height: 20, padding: "0 7px", borderRadius: 10,
                      fontSize: 11, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>{tab.count}</span>
                  </button>
                );
              })}
            </div>

            {loadingVouchers ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
                <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                <div style={{ fontSize: 13 }}>{t("Đang tải ví voucher...")}</div>
              </div>
            ) : visibleVouchers.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10 }}>
                <Ticket size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 13 }}>
                  {voucherTab === "active" ? t("Khách chưa có voucher khả dụng") : t("Khách chưa dùng voucher nào")}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleVouchers.map((v) => {
                  const src = getVoucherSource(v);
                  const SrcIcon = src.icon;
                  const isCopied = copiedId === v.id;
                  return (
                    <div key={v.id} style={{ background: v.used ? "var(--bg-tertiary, #f8fafc)" : "var(--card-bg, #fff)", border: "1px solid " + (v.used ? "var(--border-color, #e5e9ef)" : "#8b5cf6"), borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 12, opacity: v.used ? 0.75 : 1 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 10, background: v.used ? USED_GRADIENT : VOUCHER_GRADIENT, color: "#fff", display: "grid", placeItems: "center", flexShrink: 0 }}>
                        <Ticket size={22} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <b style={{ fontSize: 12, fontFamily: "monospace", color: "#8b5cf6" }}>{v.code}</b>
                          <button onClick={() => copyCode(v)} style={{ background: "transparent", border: 0, cursor: "pointer", color: isCopied ? "#18a967" : "var(--text-light, #94a3b8)", padding: 2 }}>
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, background: src.bg, color: src.color, padding: "2px 8px", borderRadius: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <SrcIcon size={10} /> {src.label}
                          </span>
                          {v.created_at && (
                            <span style={{ fontSize: 10, color: "var(--text-light, #94a3b8)" }}>
                              {new Date(v.created_at).toLocaleDateString(locale || "vi")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: v.used ? "var(--text-muted, #64748b)" : "#18a967" }}>
                          {fmtMoney(v.value)}
                        </div>
                        <span style={{ fontSize: 10, color: v.used ? "#ef4444" : "#18a967", fontWeight: 700 }}>
                          {v.used ? t("Đã dùng") : t("Khả dụng")}
                        </span>
                      </div>

                      {!v.used && (
                        <button onClick={() => revokeVoucher(v)} title={t("Thu hồi")} style={{ padding: 6, border: "1px solid #ef4444", borderRadius: 6, background: "var(--card-bg, #fff)", cursor: "pointer", color: "#ef4444", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={() => setVoucherModal(null)} style={{ ...btnPrimaryStyle, marginTop: 16 }}>
              {t("Đóng")}
            </button>
          </Modal>
        )}

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          cancelText={confirm.cancelText}
          danger={confirm.danger}
          loading={confirmBusy}
          onConfirm={runConfirm}
          onClose={closeConfirm}
        />
      )}
    </>
  );
}

function StatusBadge({ status, t }) {
  const active = status === "Hoạt động";
  return (
    <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: active ? "#e8f9f1" : "#fde8e8", color: active ? "#18a967" : "#ef4444", whiteSpace: "nowrap" }}>
      {t(status)}
    </span>
  );
}

function MemberTierBadge({ spent, t }) {
  const tier = getMemberTier(spent);
  const meta = TIER_BADGE[tier] || TIER_BADGE["Thành viên mới"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: "nowrap" }}>
      {meta.icon} {t(tier)}
    </span>
  );
}

function CustomerTypeBadge({ type, t }) {
  const meta = TYPE_BADGE[type] || TYPE_BADGE["Khách"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: "nowrap" }}>
      {meta.icon} {t(type)}
    </span>
  );
}

function IconButton({ children, onClick, title, color = "var(--text-primary, #172033)", bg = "var(--card-bg, #fff)" }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{ padding: 6, border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 6, background: bg, cursor: "pointer", color, display: "grid", placeItems: "center", width: 30, height: 30, flexShrink: 0 }}>
      {children}
    </button>
  );
}

function InfoBlock({ label, value, highlight, mono }) {
  return (
    <div style={{ background: "var(--bg-tertiary, #f8fafc)", padding: "10px 14px", borderRadius: 10 }}>
      <span style={{ fontSize: 11, color: "var(--text-light, #8993a3)" }}>{label}</span>
      <div>
        <b style={{ color: highlight || "var(--text-primary, #172033)", fontFamily: mono ? "ui-monospace, monospace" : "inherit", letterSpacing: mono ? 0.5 : "normal" }}>
          {value}
        </b>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, bg, smallValue }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, color, fontWeight: 600, marginBottom: 4, letterSpacing: 0.3 }}>{label}</div>
      <b style={{ fontSize: smallValue ? 14 : 20, color }}>{value}</b>
    </div>
  );
}

// 🔧 B9.6a — Modal thêm body scroll lock
function Modal({ children, onClose, maxWidth = 480 }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: MODAL_Z, padding: 20, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card-bg, #fff)", borderRadius: 14, padding: 24, width: "100%", maxWidth, maxHeight: "90vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

const thStyle = { padding: 11, textAlign: "left", fontSize: 12, color: "var(--text-muted, #64748b)", fontWeight: 600, whiteSpace: "nowrap", minWidth: "100px" };
const tdStyle = { padding: 11, color: "var(--text-primary, #172033)", fontSize: 13, whiteSpace: "nowrap" };
const modalCloseStyle = { background: "transparent", border: 0, cursor: "pointer", color: "var(--text-light, #8993a3)", padding: 4, display: "grid", placeItems: "center" };
const modalInputStyle = { width: "100%", padding: 10, border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8, marginBottom: 14, outline: "none", background: "var(--bg-secondary, #fff)", color: "var(--text-primary, #172033)", fontSize: 13, boxSizing: "border-box" };
const modalLabelStyle = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-muted, #475569)" };
const btnPrimaryStyle = { width: "100%", padding: 12, background: "#2634d5", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
const btnPrimaryStyleLoading = (loading) => ({ flex: 1, padding: 12, background: loading ? "#94a3b8" : "#2634d5", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 });
const btnCancelStyle = { flex: 1, padding: 12, border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8, background: "var(--card-bg, #fff)", cursor: "pointer", color: "var(--text-primary, #172033)", fontWeight: 600, fontSize: 13 };