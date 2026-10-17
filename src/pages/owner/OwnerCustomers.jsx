// ============================================================
// OWNERCUSTOMERS.JSX â€” Quáº£n lÃ½ khÃ¡ch hÃ ng + MÃ£ ngÃ nh (V4)
// ============================================================
// V4 (2026-10):
//   - âœ… DÃ¹ng api.school.* + api.users.* (thay vÃ¬ fetch trá»±c tiáº¿p)
//   - Giá»¯ V3: Tab MÃ£ ngÃ nh, cá»™t MSSV, Set Ä‘iá»ƒm, Gá»¡ MSSV, filter ngÃ nh
// ============================================================

import { SkeletonTable } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Search, Lock, Unlock, Trash2, Eye, Pencil, Mail, Phone, Ticket, Gift,
  Ban, X, Copy, Check, Users, Globe, User as UserIcon, Loader2,
  AlertCircle, Edit, Award, GraduationCap, Unlink, Plus, RefreshCw,
  Save, UserRound, ChevronDown, RotateCcw, Shield,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";

// ============================================================
// HELPERS
// ============================================================
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ä‘/g, "d")
    .trim();
}

function validatePhone(phone, t) {
  const p = String(phone || "").trim();
  if (!p) return null;
  if (!/^0\d{9,10}$/.test(p)) return t("SÄT pháº£i báº¯t Ä‘áº§u báº±ng 0 vÃ  cÃ³ 10-11 chá»¯ sá»‘");
  return null;
}

// âœ… Xáº¾P Háº NG THÃ€NH VIÃŠN THEO CHI TIÃŠU (VND)
function getMemberTier(totalSpent) {
  const t = Number(totalSpent) || 0;
  if (t >= 4000000) return "Háº¡ng Kim cÆ°Æ¡ng";
  if (t >= 2500000) return "Háº¡ng VÃ ng";
  if (t >= 1000000) return "Háº¡ng Báº¡c";
  return "ThÃ nh viÃªn má»›i";
}

const TIER_BADGE = {
  "ThÃ nh viÃªn má»›i": { color: "#64748b", bg: "#f1f5f9", icon: "ðŸ‘¤" },
  "Háº¡ng Báº¡c":       { color: "#475569", bg: "#e2e8f0", icon: "ðŸ¥ˆ" },
  "Háº¡ng VÃ ng":      { color: "#f59e0b", bg: "#fef3c7", icon: "ðŸ†" },
  "Háº¡ng Kim cÆ°Æ¡ng": { color: "#0EA5E9", bg: "#e0f2fe", icon: "ðŸ’Ž" },
};

const TIER_THRESHOLDS = [
  { id: "all",             label: "Táº¥t cáº£ háº¡ng" },
  { id: "ThÃ nh viÃªn má»›i",  label: "ThÃ nh viÃªn má»›i" },
  { id: "Háº¡ng Báº¡c",        label: "Háº¡ng Báº¡c" },
  { id: "Háº¡ng VÃ ng",       label: "Háº¡ng VÃ ng" },
  { id: "Háº¡ng Kim cÆ°Æ¡ng",  label: "Háº¡ng Kim cÆ°Æ¡ng" },
];
// âœ… PHÃ‚N LOáº I KHÃCH HÃ€NG THEO EMAIL
function getCustomerType(email) {
  const e = String(email || "").toLowerCase().trim();
  if (e.endsWith("@vwa.edu.vn")) return "Giáº£ng viÃªn";
  if (e.endsWith("@hpn.edu.vn")) return "Sinh viÃªn";
  return "KhÃ¡ch";
}

const TYPE_BADGE = {
  "Giáº£ng viÃªn": { color: "#8b5cf6", bg: "#ede9fe", icon: "ðŸŽ“" },
  "Sinh viÃªn":  { color: "#0EA5E9", bg: "#e0f2fe", icon: "ðŸŽ“" },
  "KhÃ¡ch":      { color: "#f59e0b", bg: "#fef3c7", icon: "ðŸ‘¤" },
};

// ============================================================
// CONSTANTS
// ============================================================
const CUSTOMER_GRADIENT = "linear-gradient(135deg, #f59e0b, #ef4444)";
const VOUCHER_GRADIENT = "linear-gradient(135deg, #8b5cf6, #ec4899)";
const USED_GRADIENT = "linear-gradient(135deg, #94a3b8, #64748b)";
const MODAL_Z = 2147483600;

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function OwnerCustomers() {
  const { t } = useI18n();

  // ---------- TAB STATE ----------
  const [activeTab, setActiveTab] = useState("customers"); // "customers" | "majors"

  const STATUS_FILTERS = useMemo(
    () => [
      { id: "all",    label: t("Táº¥t cáº£") },
      { id: "active", label: t("Hoáº¡t Ä‘á»™ng") },
      { id: "locked", label: t("Bá»‹ khÃ³a") },
    ],
    [t]
  );

  const CUSTOMER_TYPE_FILTERS = useMemo(
    () => [
      { id: "all",        label: t("Táº¥t cáº£ loáº¡i") },
      { id: "Giáº£ng viÃªn", label: t("Giáº£ng viÃªn") },
      { id: "Sinh viÃªn",  label: t("Sinh viÃªn")  },
      { id: "KhÃ¡ch",      label: t("KhÃ¡ch")      },
    ],
    [t]
  );

  // ---------- Customer list state ----------
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFaculty, setFilterFaculty] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterTier, setFilterTier] = useState("all");
  const [orders, setOrders] = useState([]);
  const [openStatus, setOpenStatus] = useState(false);
  const [openType, setOpenType] = useState(false);
  const [openTier, setOpenTier] = useState(false);

  // ---------- Detail modal ----------
  const [detail, setDetail] = useState(null);

  // ---------- Edit modal ----------
  const [editModal, setEditModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // ---------- Voucher modal ----------
  const [voucherModal, setVoucherModal] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [voucherStats, setVoucherStats] = useState({
    total: 0, used: 0, available: 0, totalValue: 0,
  });
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [voucherTab, setVoucherTab] = useState("active");
  const [copiedId, setCopiedId] = useState(null);

  // ---------- Points modal ----------
  const [pointsModal, setPointsModal] = useState(null);
  const [pointsForm, setPointsForm] = useState({ points: "", reason: "" });
  const [pointsSaving, setPointsSaving] = useState(false);
  const [pointsError, setPointsError] = useState("");

  // ---------- Majors tab state ----------
  const [majorsMap, setMajorsMap] = useState({});
  const [majorsLoading, setMajorsLoading] = useState(false);
  const [majorsQ, setMajorsQ] = useState("");
  const [majorEditModal, setMajorEditModal] = useState(null);
  const [majorForm, setMajorForm] = useState({ code: "", name: "", faculty: "", code_full: "" });
  const [majorSaving, setMajorSaving] = useState(false);
  const [majorError, setMajorError] = useState("");

  // ---------- Confirm dialog ----------
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ============================================================
  // LOAD CUSTOMERS
  // ============================================================
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.users.list("CUSTOMER");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || t("KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch khÃ¡ch hÃ ng"));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api.orders.all("Táº¥t cáº£");
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    }
  }, []);

  // ============================================================
  // LOAD MAJORS MAP
  // ============================================================
  const loadMajors = useCallback(async () => {
    setMajorsLoading(true);
    try {
      const res = await api.school.majorsMap();
      setMajorsMap(res && typeof res === "object" ? res : {});
    } catch (e) {
      toast(e.message || t("KhÃ´ng táº£i Ä‘Æ°á»£c báº£ng mÃ£ ngÃ nh"), "error");
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

  // ESC
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

  // ---------- Stats ----------
  const statusCounts = useMemo(() => {
    const active = list.filter((c) => (c.status || "Hoáº¡t Ä‘á»™ng") === "Hoáº¡t Ä‘á»™ng").length;
    const locked = list.length - active;
    return { all: list.length, active, locked };
  }, [list]);

  // âœ… Äáº¿m sá»‘ lÆ°á»£ng theo phÃ¢n loáº¡i
  const typeCounts = useMemo(() => {
    const counts = { all: list.length };
    for (const c of list) {
      const t2 = getCustomerType(c.email);
      counts[t2] = (counts[t2] || 0) + 1;
    }
    return counts;
  }, [list]);

  // âœ… Map user_id â†’ tá»•ng chi tiÃªu (Ä‘Æ¡n HoÃ n thÃ nh)
  const tierSpentMap = useMemo(() => {
    const map = {};
    for (const o of orders) {
      if (o.status !== "HoÃ n thÃ nh") continue;
      const uid = o.user_id || o.customer_id;
      if (uid == null) continue;
      map[uid] = (map[uid] || 0) + (Number(o.total) || 0);
    }
    return map;
  }, [orders]);

  // âœ… Äáº¿m sá»‘ lÆ°á»£ng theo háº¡ng
  const tierCounts = useMemo(() => {
    const counts = { all: list.length };
    for (const c of list) {
      const spent = tierSpentMap[c.id] || 0;
      const tier = getMemberTier(spent);
      counts[tier] = (counts[tier] || 0) + 1;
    }
    return counts;
  }, [list, tierSpentMap]);

  const facultyOptions = useMemo(() => {
    const set = new Set();
    list.forEach((c) => {
      if (c.major_code && c.major_name) {
        set.add(JSON.stringify({ code: c.major_code, name: c.major_name }));
      }
    });
    return Array.from(set).map((s) => JSON.parse(s));
  }, [list]);

  // ---------- Filter + Search ----------
  const filtered = useMemo(() => {
    let result = list;

    if (filterStatus === "active") {
      result = result.filter((c) => (c.status || "Hoáº¡t Ä‘á»™ng") === "Hoáº¡t Ä‘á»™ng");
    } else if (filterStatus === "locked") {
      result = result.filter((c) => c.status === "Bá»‹ khÃ³a");
    }

    if (filterFaculty !== "all") {
      result = result.filter((c) => c.major_code === filterFaculty);
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
  }, [list, q, filterStatus, filterFaculty, filterType, filterTier, tierSpentMap]);

  const hasFilter = q.trim() !== "" || filterStatus !== "all" || filterFaculty !== "all" || filterType !== "all" || filterTier !== "all";

  const clearFilters = () => {
    setQ("");
    setFilterStatus("all");
    setFilterFaculty("all");
    setFilterType("all");
    setFilterTier("all");
  };

  // ---------- Majors filter ----------
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

  // ---------- Confirm helpers ----------
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

  // ============================================================
  // CUSTOMER HANDLERS
  // ============================================================
  const toggleLock = (c) => {
    const newStatus = c.status === "Hoáº¡t Ä‘á»™ng" ? "Bá»‹ khÃ³a" : "Hoáº¡t Ä‘á»™ng";
    const isLocking = newStatus === "Bá»‹ khÃ³a";

    setConfirm({
      title: isLocking
        ? t("KhÃ³a tÃ i khoáº£n") + ` "${c.name}"?`
        : t("Má»Ÿ khÃ³a tÃ i khoáº£n") + ` "${c.name}"?`,
      message: isLocking
        ? t("KhÃ¡ch hÃ ng sáº½ khÃ´ng thá»ƒ Ä‘Äƒng nháº­p vÃ  Ä‘áº·t mÃ³n cho Ä‘áº¿n khi Ä‘Æ°á»£c má»Ÿ láº¡i.")
        : t("KhÃ¡ch hÃ ng sáº½ cÃ³ thá»ƒ Ä‘Äƒng nháº­p vÃ  Ä‘áº·t mÃ³n trá»Ÿ láº¡i."),
      confirmText: isLocking ? t("KhÃ³a tÃ i khoáº£n") : t("Má»Ÿ khÃ³a"),
      cancelText: t("Há»§y"),
      danger: isLocking,
      onConfirm: async () => {
        await api.users.update(c.id, { status: newStatus });
        toast(isLocking ? t("ÄÃ£ khÃ³a tÃ i khoáº£n") : t("ÄÃ£ má»Ÿ khÃ³a tÃ i khoáº£n"), "success");
        setConfirm(null);
        load();
      },
    });
  };

  const remove = (c) => {
    setConfirm({
      title: t("XÃ³a tÃ i khoáº£n") + ` "${c.name}"?`,
      message:
        t("HÃ nh Ä‘á»™ng nÃ y khÃ´ng thá»ƒ hoÃ n tÃ¡c. ToÃ n bá»™ dá»¯ liá»‡u liÃªn quan") +
        " " +
        t("(Ä‘Æ¡n hÃ ng, vÃ­, voucher, chat...) sáº½ bá»‹ xoÃ¡ vÄ©nh viá»…n."),
      confirmText: t("XÃ³a vÄ©nh viá»…n"),
      cancelText: t("Há»§y"),
      danger: true,
      onConfirm: async () => {
        await api.users.remove(c.id);
        toast(t("ÄÃ£ xÃ³a tÃ i khoáº£n"), "success");
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
    if (saving) return;

    const f = new FormData(e.currentTarget);
    const name = f.get("name")?.trim();
    const phone = f.get("phone")?.trim();
    const status = f.get("status");

    if (!name) return setEditError(t("Vui lÃ²ng nháº­p há» tÃªn"));
    const phoneErr = validatePhone(phone, t);
    if (phoneErr) return setEditError(phoneErr);

    setEditError("");
    setSaving(true);
    try {
      await api.users.update(editModal.id, { name, phone, status });
      toast(t("ÄÃ£ cáº­p nháº­t thÃ´ng tin khÃ¡ch hÃ ng"), "success");
      setEditModal(null);
      load();
    } catch (e) {
      setEditError(e.message || t("KhÃ´ng lÆ°u Ä‘Æ°á»£c"));
    } finally {
      setSaving(false);
    }
  };

  const openPointsModal = (c) => {
    setPointsError("");
    setPointsForm({ points: String(c.points || 0), reason: "" });
    setPointsModal(c);
  };

  const savePoints = async () => {
    if (pointsSaving) return;
    setPointsError("");

    const p = Number(pointsForm.points);
    if (!Number.isFinite(p) || p < 0) {
      setPointsError(t("Äiá»ƒm pháº£i lÃ  sá»‘ >= 0"));
      return;
    }

    setPointsSaving(true);
    try {
      await api.users.setPoints(pointsModal.id, {
        points: p,
        reason: pointsForm.reason.trim(),
      });

      toast(t("ÄÃ£ set Ä‘iá»ƒm thÃ nh cÃ´ng: {n} Ä‘iá»ƒm").replace("{n}", String(p)), "success");
      setPointsModal(null);
      load();
    } catch (e) {
      setPointsError(e.message || t("KhÃ´ng set Ä‘Æ°á»£c Ä‘iá»ƒm"));
    } finally {
      setPointsSaving(false);
    }
  };

  const unlinkMssv = (c) => {
    setConfirm({
      title: t("Gá»¡ liÃªn káº¿t MSSV") + ` "${c.name}"?`,
      message:
        t("MSSV") +
        ` ${c.student_code} ` +
        t("sáº½ bá»‹ gá»¡ khá»i tÃ i khoáº£n nÃ y. KhÃ¡ch hÃ ng sáº½ máº¥t thÃ´ng tin ngÃ nh/khoa vÃ  cáº§n liÃªn káº¿t láº¡i tá»« Ä‘áº§u."),
      confirmText: t("Gá»¡ liÃªn káº¿t"),
      cancelText: t("Há»§y"),
      danger: true,
      onConfirm: async () => {
        await api.users.unlinkMssv(c.id);
        toast(t("ÄÃ£ gá»¡ liÃªn káº¿t MSSV"), "success");
        setConfirm(null);
        load();
      },
    });
  };

  // ============================================================
  // VOUCHER HANDLERS
  // ============================================================
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
      toast(e.message || t("KhÃ´ng táº£i Ä‘Æ°á»£c vÃ­ voucher"), "error");
    } finally {
      setLoadingVouchers(false);
    }
  };

  const revokeVoucher = (v) => {
    setConfirm({
      title: t("Thu há»“i voucher") + ` "${v.code}"?`,
      message:
        t("Voucher trá»‹ giÃ¡") + ` ${fmtMoney(v.value)} ` +
        t("sáº½ bá»‹ thu há»“i khá»i vÃ­ cá»§a khÃ¡ch hÃ ng vÃ  khÃ´ng thá»ƒ khÃ´i phá»¥c."),
      confirmText: t("Thu há»“i"),
      cancelText: t("Há»§y"),
      danger: true,
      onConfirm: async () => {
        await api.vouchers.revoke(v.id);
        toast(t("ÄÃ£ thu há»“i voucher"), "success");
        setConfirm(null);
        if (voucherModal) loadVouchers(voucherModal);
      },
    });
  };

  const copyCode = (v) => {
    navigator.clipboard.writeText(v.code);
    setCopiedId(v.id);
    toast(t("ÄÃ£ sao chÃ©p mÃ£") + " " + v.code, "success");
    setTimeout(() => setCopiedId(null), 1500);
  };

  // ============================================================
  // MAJORS HANDLERS
  // ============================================================
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
    if (majorSaving) return;
    setMajorError("");

    const code = majorForm.code.trim();
    const name = majorForm.name.trim();
    const faculty = majorForm.faculty.trim();
    const code_full = majorForm.code_full.trim();

    if (!code) return setMajorError(t("Vui lÃ²ng nháº­p mÃ£ ngÃ nh"));
    if (!/^\d{3,4}$/.test(code)) return setMajorError(t("MÃ£ ngÃ nh pháº£i lÃ  3 hoáº·c 4 chá»¯ sá»‘"));
    if (!name) return setMajorError(t("Vui lÃ²ng nháº­p tÃªn ngÃ nh"));

    if (majorEditModal?.isNew && majorsMap[code]) {
      return setMajorError(t("MÃ£ ngÃ nh nÃ y Ä‘Ã£ tá»“n táº¡i"));
    }
    if (
      !majorEditModal?.isNew &&
      code !== majorEditModal.originalCode &&
      majorsMap[code]
    ) {
      return setMajorError(t("MÃ£ ngÃ nh nÃ y Ä‘Ã£ tá»“n táº¡i"));
    }

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
        majorEditModal?.isNew ? t("ÄÃ£ thÃªm mÃ£ ngÃ nh") : t("ÄÃ£ cáº­p nháº­t mÃ£ ngÃ nh"),
        "success"
      );
      setMajorEditModal(null);
    } catch (e) {
      setMajorError(e.message || t("KhÃ´ng lÆ°u Ä‘Æ°á»£c"));
    } finally {
      setMajorSaving(false);
    }
  };

  const deleteMajor = (code, info) => {
    setConfirm({
      title: t("XoÃ¡ mÃ£ ngÃ nh") + ` "${code}"?`,
      message:
        t("MÃ£ ngÃ nh") + ` "${info.name}" ` +
        t("sáº½ bá»‹ xoÃ¡. Sinh viÃªn Ä‘Ã£ liÃªn káº¿t vá»›i mÃ£ nÃ y váº«n giá»¯ thÃ´ng tin cÅ©, nhÆ°ng sinh viÃªn má»›i sáº½ khÃ´ng tra cá»©u Ä‘Æ°á»£c."),
      confirmText: t("XoÃ¡"),
      cancelText: t("Há»§y"),
      danger: true,
      onConfirm: async () => {
        const newMap = { ...majorsMap };
        delete newMap[code];

        const d = await api.school.updateMajorsMap(newMap);
        setMajorsMap(d.map || newMap);
        toast(t("ÄÃ£ xoÃ¡ mÃ£ ngÃ nh"), "success");
        setConfirm(null);
      },
    });
  };

  const resetMajors = () => {
    setConfirm({
      title: t("KhÃ´i phá»¥c báº£ng mÃ£ ngÃ nh máº·c Ä‘á»‹nh?"),
      message: t("ToÃ n bá»™ thay Ä‘á»•i cá»§a báº¡n sáº½ bá»‹ máº¥t vÃ  quay vá» báº£ng 10 mÃ£ ngÃ nh gá»‘c."),
      confirmText: t("KhÃ´i phá»¥c"),
      cancelText: t("Há»§y"),
      danger: true,
      onConfirm: async () => {
        const d = await api.school.resetMajorsMap();
        setMajorsMap(d.map || {});
        toast(t("ÄÃ£ khÃ´i phá»¥c báº£ng mÃ£ ngÃ nh máº·c Ä‘á»‹nh"), "success");
        setConfirm(null);
      },
    });
  };

  // ============================================================
  // UTILS
  // ============================================================
  const getInitials = (name) => (name || "?").slice(0, 2).toUpperCase();
  const fmtNumber = (n) => typeof n === "number" ? n.toLocaleString("vi-VN") : n ?? "â€”";
  const fmtMoney = (n) => fmtNumber(n) + "Ä‘";

  const getVoucherSource = (v) => {
    if (v.claimed_from)
      return { label: t("Nháº­n tá»« Æ¯Ä"), color: "#8b5cf6", bg: "#ede9fe", icon: Globe };
    if (v.points_used > 0)
      return { label: t("Äá»•i Ä‘iá»ƒm"), color: "#f59e0b", bg: "#fef3c7", icon: Gift };
    return { label: t("Admin táº·ng"), color: "#2634d5", bg: "#eef2ff", icon: UserIcon };
  };

  const visibleVouchers = useMemo(
    () => vouchers.filter((v) => (voucherTab === "active" ? !v.used : v.used)),
    [vouchers, voucherTab]
  );

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      <div>
        {/* ============================================================
            TAB SWITCH
            ============================================================ */}
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
            {t("KhÃ¡ch hÃ ng")}
            <span
              style={{
                background: activeTab === "customers" ? "rgba(255,255,255,0.3)" : "var(--card-bg, #e2e8f0)",
                color: activeTab === "customers" ? "#fff" : "var(--text-muted, #64748b)",
                minWidth: 22,
                height: 18,
                padding: "0 6px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
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
            <GraduationCap size={16} />
            {t("MÃ£ ngÃ nh")}
            <span
              style={{
                background: activeTab === "majors" ? "rgba(255,255,255,0.3)" : "var(--card-bg, #e2e8f0)",
                color: activeTab === "majors" ? "#fff" : "var(--text-muted, #64748b)",
                minWidth: 22,
                height: 18,
                padding: "0 6px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {Object.keys(majorsMap).length}
            </span>
          </button>
        </div>

        {/* ============================================================
            TAB 1: CUSTOMERS
            ============================================================ */}
        {activeTab === "customers" && (
          <>
            {/* ============================================================
                Há»˜P 1: Search + Counter + Clear
                ============================================================ */}
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
                  placeholder={t("TÃ¬m theo tÃªn, email, MSSV, SÄT...")}
                  style={{
                    flex: 1,
                    border: 0,
                    outline: "none",
                    background: "transparent",
                    color: "var(--text-primary, #172033)",
                    fontSize: 13,
                    minWidth: 0,
                  }}
                />
                {q && (
                  <button
                    onClick={() => setQ("")}
                    style={{
                      background: "transparent",
                      border: 0,
                      cursor: "pointer",
                      color: "var(--text-light, #8993a3)",
                      padding: 2,
                      display: "grid",
                      placeItems: "center",
                    }}
                    aria-label={t("XÃ³a tÃ¬m kiáº¿m")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  background: "var(--bg-tertiary, #f8fafc)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "var(--text-primary, #172033)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                <Users size={16} />
                <b>{filtered.length}</b>
                <span style={{ color: "var(--text-muted, #64748b)", fontWeight: 500 }}>
                  {t("khÃ¡ch hÃ ng")}
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
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  <RotateCcw size={14} />
                  {t("XÃ³a lá»c")}
                </button>
              )}
            </div>

            {/* ============================================================
                Há»˜P 2: 3 cá»¥m filter (Tráº¡ng thÃ¡i | PhÃ¢n loáº¡i | Háº¡ng)
                ============================================================ */}
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
              {/* Cá»¥m 1: Tráº¡ng thÃ¡i */}
              <div>
                <button
                  onClick={() => setOpenStatus((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, cursor: "pointer", padding: 0, width: "100%", textAlign: "left", marginBottom: openStatus ? 10 : 0 }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2ff", color: "#2634d5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Shield size={16} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)", flex: 1 }}>
                    {t("Tráº¡ng thÃ¡i")}
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

              {/* Cá»¥m 2: PhÃ¢n loáº¡i */}
              <div style={{ paddingLeft: 20, borderLeft: "1px solid var(--border-color, #eef2f7)" }}>
                <button
                  onClick={() => setOpenType((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, cursor: "pointer", padding: 0, width: "100%", textAlign: "left", marginBottom: openType ? 10 : 0 }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2ff", color: "#2634d5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <UserRound size={16} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)", flex: 1 }}>
                    {t("PhÃ¢n loáº¡i")}
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

              {/* Cá»¥m 3: Háº¡ng */}
              <div style={{ paddingLeft: 20, borderLeft: "1px solid var(--border-color, #eef2f7)" }}>
                <button
                  onClick={() => setOpenTier((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, cursor: "pointer", padding: 0, width: "100%", textAlign: "left", marginBottom: openTier ? 10 : 0 }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eef2ff", color: "#2634d5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Award size={16} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)", flex: 1 }}>
                    {t("Háº¡ng")}
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
                  headers={[t("ID"), t("KhÃ¡ch hÃ ng"), t("LiÃªn há»‡"), t("MSSV Â· NgÃ nh"), t("Äiá»ƒm"), t("Háº¡ng"), t("Loáº¡i"), t("Tráº¡ng thÃ¡i"), t("Thao tÃ¡c")]}
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
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u")}</div>
                  <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>{error}</div>
                  <button
                    onClick={load}
                    style={{
                      padding: "8px 16px",
                      background: "#ef4444",
                      color: "#fff",
                      border: 0,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {t("Thá»­ láº¡i")}
                  </button>
                </div>
              )}

              {!loading && !error && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                        <th style={thStyle}>{t("ID")}</th>
                        <th style={thStyle}>{t("KhÃ¡ch hÃ ng")}</th>
                        <th style={thStyle}>{t("LiÃªn há»‡")}</th>
                        <th style={thStyle}>{t("MSSV Â· NgÃ nh")}</th>
                        <th style={thStyle}>{t("Äiá»ƒm")}</th>
                        <th style={thStyle}>{t("Háº¡ng")}</th>
                        <th style={thStyle}>{t("Loáº¡i")}</th>
                        <th style={thStyle}>{t("Tráº¡ng thÃ¡i")}</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tÃ¡c")}</th>
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
                                  {c.phone || "â€”"}
                                </span>
                              </div>
                            </td>

                            <td style={tdStyle}>
                              {hasMssv ? (
                                <div
                                  title={`MSSV: ${c.student_code}${c.major_name ? ` Â· ${c.major_name}` : ""}`}
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
                                  {t("ChÆ°a liÃªn káº¿t")}
                                </span>
                              )}
                            </td>

                            <td style={tdStyle}>
                              <b style={{ color: "#f59e0b" }}>
                                {fmtNumber(c.points || 0)} {t("Ä‘iá»ƒm")}
                              </b>
                            </td>

                            <td style={tdStyle}>
                              <MemberTierBadge spent={tierSpentMap[c.id] || 0} />
                            </td>

                            <td style={tdStyle}>
                              <CustomerTypeBadge type={getCustomerType(c.email)} />
                            </td>

                            <td style={tdStyle}>
                              <StatusBadge status={c.status || "Hoáº¡t Ä‘á»™ng"} t={t} />
                            </td>

                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <IconButton onClick={() => loadVouchers(c)} title={t("VÃ­ voucher")} color="#8b5cf6" bg="#f5f3ff">
                                  <Ticket size={15} />
                                </IconButton>
                                <IconButton onClick={() => setDetail(c)} title={t("Xem chi tiáº¿t")}>
                                  <Eye size={15} />
                                </IconButton>
                                <IconButton onClick={() => openEdit(c)} title={t("Sá»­a")}>
                                  <Edit size={15} />
                                </IconButton>
                                <IconButton onClick={() => openPointsModal(c)} title={t("Set Ä‘iá»ƒm")} color="#f59e0b" bg="#fff4d8">
                                  <Award size={15} />
                                </IconButton>
                                {hasMssv && (
                                  <IconButton onClick={() => unlinkMssv(c)} title={t("Gá»¡ liÃªn káº¿t MSSV")} color="#dc2626" bg="#fef2f2">
                                    <Unlink size={15} />
                                  </IconButton>
                                )}
                                <IconButton
                                  onClick={() => toggleLock(c)}
                                  title={c.status === "Hoáº¡t Ä‘á»™ng" ? t("KhÃ³a tÃ i khoáº£n") : t("Má»Ÿ khÃ³a")}
                                  color={c.status === "Hoáº¡t Ä‘á»™ng" ? "#ef4444" : "#18a967"}
                                >
                                  {c.status === "Hoáº¡t Ä‘á»™ng" ? <Lock size={15} /> : <Unlock size={15} />}
                                </IconButton>
                                <IconButton onClick={() => remove(c)} title={t("XÃ³a")} color="#ef4444">
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
                                ? t("KhÃ´ng cÃ³ khÃ¡ch hÃ ng nÃ o khá»›p bá»™ lá»c")
                                : t("ChÆ°a cÃ³ khÃ¡ch hÃ ng nÃ o")}
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

        {/* ============================================================
            TAB 2: MAJORS MAP
            ============================================================ */}
        {activeTab === "majors" && (
          <>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 20,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "var(--card-bg, #fff)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  flex: 1,
                  maxWidth: 400,
                }}
              >
                <Search size={18} style={{ color: "var(--text-light, #8993a3)" }} />
                <input
                  value={majorsQ}
                  onChange={(e) => setMajorsQ(e.target.value)}
                  placeholder={t("TÃ¬m theo mÃ£, tÃªn ngÃ nh, khoa...")}
                  style={{
                    flex: 1,
                    border: 0,
                    outline: "none",
                    fontSize: 13,
                    background: "transparent",
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
                  padding: "10px 16px",
                  background: "#2634d5",
                  color: "#fff",
                  border: 0,
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={15} /> {t("ThÃªm mÃ£ ngÃ nh")}
              </button>

              <button
                onClick={resetMajors}
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "var(--text-muted, #475569)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RefreshCw size={15} /> {t("KhÃ´i phá»¥c máº·c Ä‘á»‹nh")}
              </button>

              <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginLeft: "auto" }}>
                <b style={{ color: "var(--text-primary, #172033)" }}>{filteredMajors.length}</b>{" "}
                {t("mÃ£ ngÃ nh")}
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
              {majorsLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
                  <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                  <div style={{ fontSize: 13 }}>{t("Äang táº£i báº£ng mÃ£ ngÃ nh...")}</div>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                        <th style={thStyle}>{t("MÃ£ ngÃ nh")}</th>
                        <th style={thStyle}>{t("TÃªn ngÃ nh")}</th>
                        <th style={thStyle}>{t("Khoa")}</th>
                        <th style={thStyle}>{t("MÃ£ Bá»™ GD")}</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tÃ¡c")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMajors.map(([code, info]) => (
                        <tr key={code} style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}>
                          <td style={tdStyle}>
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "4px 10px",
                                borderRadius: 8,
                                background: "#eef2ff",
                                color: "#2634d5",
                                fontWeight: 800,
                                fontFamily: "ui-monospace, monospace",
                                fontSize: 13,
                                letterSpacing: 0.5,
                              }}
                            >
                              {code}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <b style={{ fontSize: 13 }}>{info.name || "â€”"}</b>
                          </td>
                          <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                            {info.faculty || "â€”"}
                          </td>
                          <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted, #64748b)", fontFamily: "ui-monospace, monospace" }}>
                            {info.code_full || "â€”"}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <IconButton onClick={() => openEditMajor(code, info)} title={t("Sá»­a")}>
                                <Edit size={15} />
                              </IconButton>
                              <IconButton onClick={() => deleteMajor(code, info)} title={t("XoÃ¡")} color="#ef4444">
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
                                ? t("KhÃ´ng cÃ³ mÃ£ ngÃ nh nÃ o khá»›p tÃ¬m kiáº¿m")
                                : t("Báº£ng mÃ£ ngÃ nh trá»‘ng")}
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

        {/* ============================================================
            MODAL: CHI TIáº¾T KHÃCH HÃ€NG
            ============================================================ */}
        {detail && (
          <Modal onClose={() => setDetail(null)} maxWidth={520}>
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
                <InfoBlock label={t("MÃ£ KH")} value={`KH${detail.id}`} />
                <InfoBlock label={t("SÄT")} value={detail.phone || "â€”"} />
                <InfoBlock label={t("Äiá»ƒm tÃ­ch lÅ©y")} value={fmtNumber(detail.points || 0)} highlight="#f59e0b" />
                <InfoBlock label={t("Tráº¡ng thÃ¡i")} value={detail.status || t("Hoáº¡t Ä‘á»™ng")} />

                {detail.student_code ? (
                  <>
                    <InfoBlock label={t("MSSV")} value={detail.student_code} mono />
                    <InfoBlock label={t("NgÃ nh há»c")} value={detail.major_name || "â€”"} />
                    <InfoBlock label={t("Khoa")} value={detail.faculty || "â€”"} />
                    <InfoBlock label={t("NÄƒm nháº­p há»c")} value={detail.year_in ? String(detail.year_in) : "â€”"} />
                  </>
                ) : (
                  <div style={{ gridColumn: "span 2" }}>
                    <InfoBlock label={t("MSSV")} value={t("ChÆ°a liÃªn káº¿t")} />
                  </div>
                )}
              </div>

              <button onClick={() => setDetail(null)} style={{ ...btnPrimaryStyle, marginTop: 16 }}>
                {t("ÄÃ³ng")}
              </button>
            </div>
          </Modal>
        )}

        {/* ============================================================
            MODAL: Sá»¬A KHÃCH HÃ€NG
            ============================================================ */}
        {editModal && (
          <Modal onClose={() => !saving && setEditModal(null)} maxWidth={480}>
            <h3 style={{ marginTop: 0, marginBottom: 20, color: "var(--text-primary, #172033)" }}>
              {t("Chá»‰nh sá»­a khÃ¡ch hÃ ng")}
            </h3>
            <form onSubmit={saveEdit}>
              <label style={modalLabelStyle}>{t("Há» tÃªn")} *</label>
              <input
                name="name"
                defaultValue={editModal.name}
                required
                style={modalInputStyle}
                autoFocus
                onChange={() => editError && setEditError("")}
              />

              <label style={modalLabelStyle}>{t("Sá»‘ Ä‘iá»‡n thoáº¡i")}</label>
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

              <label style={modalLabelStyle}>{t("Tráº¡ng thÃ¡i")}</label>
              <select name="status" defaultValue={editModal.status || "Hoáº¡t Ä‘á»™ng"} style={modalInputStyle}>
                <option>{t("Hoáº¡t Ä‘á»™ng")}</option>
                <option>{t("Bá»‹ khÃ³a")}</option>
              </select>

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button type="button" onClick={() => setEditModal(null)} disabled={saving} style={btnCancelStyle}>
                  {t("Há»§y")}
                </button>
                <button type="submit" disabled={saving} style={btnPrimaryStyleLoading(saving)}>
                  {saving ? (
                    <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />{t("Äang lÆ°u...")}</>
                  ) : t("LÆ°u thay Ä‘á»•i")}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* ============================================================
            MODAL: SET ÄIá»‚M
            ============================================================ */}
        {pointsModal && (
          <Modal onClose={() => !pointsSaving && setPointsModal(null)} maxWidth={460}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fff4d8", color: "#f59e0b", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Award size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, color: "var(--text-primary, #172033)", fontSize: 16 }}>
                  {t("Set Ä‘iá»ƒm cho khÃ¡ch hÃ ng")}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                  {pointsModal.name} Â· {pointsModal.email}
                </p>
              </div>
            </div>

            <div style={{ background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted, #64748b)" }}>{t("Äiá»ƒm hiá»‡n táº¡i")}:</span>
              <b style={{ color: "#f59e0b", fontSize: 16 }}>
                {fmtNumber(pointsModal.points || 0)} {t("Ä‘iá»ƒm")}
              </b>
            </div>

            <label style={modalLabelStyle}>{t("Äiá»ƒm má»›i")} *</label>
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
                {Number(pointsForm.points) - Number(pointsModal.points || 0)} {t("Ä‘iá»ƒm")})
              </div>
            )}

            {pointsError && (
              <div style={{ color: "#ef4444", fontSize: 12, marginTop: -10, marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={12} /> {pointsError}
              </div>
            )}

            <label style={modalLabelStyle}>{t("LÃ½ do (tÃ¹y chá»n)")}</label>
            <input
              type="text"
              value={pointsForm.reason}
              onChange={(e) => setPointsForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder={t("VD: ThÆ°á»Ÿng sinh viÃªn tÃ­ch cá»±c")}
              style={modalInputStyle}
              disabled={pointsSaving}
              maxLength={200}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setPointsModal(null)} disabled={pointsSaving} style={btnCancelStyle}>
                {t("Há»§y")}
              </button>
              <button type="button" onClick={savePoints} disabled={pointsSaving} style={btnPrimaryStyleLoading(pointsSaving)}>
                {pointsSaving ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />{t("Äang lÆ°u...")}</>
                ) : (
                  <><Award size={14} /> {t("LÆ°u Ä‘iá»ƒm")}</>
                )}
              </button>
            </div>
          </Modal>
        )}

        {/* ============================================================
            MODAL: Sá»¬A / THÃŠM MÃƒ NGÃ€NH
            ============================================================ */}
        {majorEditModal && (
          <Modal onClose={() => !majorSaving && setMajorEditModal(null)} maxWidth={520}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eef2ff", color: "#2634d5", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <GraduationCap size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, color: "var(--text-primary, #172033)", fontSize: 16 }}>
                  {majorEditModal.isNew ? t("ThÃªm mÃ£ ngÃ nh má»›i") : t("Sá»­a mÃ£ ngÃ nh")}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                  {majorEditModal.isNew
                    ? t("MÃ£ ngÃ nh dÃ¹ng Ä‘á»ƒ tra cá»©u thÃ´ng tin sinh viÃªn khi liÃªn káº¿t MSSV")
                    : `${t("Äang sá»­a")} ${majorEditModal.originalCode}`}
                </p>
              </div>
            </div>

            <label style={modalLabelStyle}>{t("MÃ£ ngÃ nh")} * <span style={{ fontWeight: 400, color: "var(--text-light, #94a3b8)" }}>(3-4 chá»¯ sá»‘)</span></label>
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
                {t("KhÃ´ng thá»ƒ Ä‘á»•i mÃ£ ngÃ nh sau khi Ä‘Ã£ táº¡o. XoÃ¡ vÃ  táº¡o má»›i náº¿u cáº§n.")}
              </div>
            )}

            <label style={modalLabelStyle}>{t("TÃªn ngÃ nh")} *</label>
            <input
              type="text"
              value={majorForm.name}
              onChange={(e) => { setMajorForm((f) => ({ ...f, name: e.target.value })); if (majorError) setMajorError(""); }}
              placeholder={t("VD: CÃ´ng nghá»‡ thÃ´ng tin / Thiáº¿t káº¿ Game")}
              style={modalInputStyle}
              disabled={majorSaving}
              maxLength={200}
            />

            <label style={modalLabelStyle}>{t("Khoa")}</label>
            <input
              type="text"
              value={majorForm.faculty}
              onChange={(e) => setMajorForm((f) => ({ ...f, faculty: e.target.value }))}
              placeholder={t("VD: Khoa CÃ´ng nghá»‡ ThÃ´ng tin & Truyá»n thÃ´ng")}
              style={modalInputStyle}
              disabled={majorSaving}
              maxLength={200}
            />

            <label style={modalLabelStyle}>{t("MÃ£ Bá»™ GD")}</label>
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
                {t("Há»§y")}
              </button>
              <button type="button" onClick={saveMajor} disabled={majorSaving} style={btnPrimaryStyleLoading(majorSaving)}>
                {majorSaving ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />{t("Äang lÆ°u...")}</>
                ) : (
                  <><Save size={14} /> {majorEditModal.isNew ? t("ThÃªm") : t("LÆ°u")}</>
                )}
              </button>
            </div>
          </Modal>
        )}

        {/* ============================================================
            MODAL: VÃ VOUCHER
            ============================================================ */}
        {voucherModal && (
          <Modal onClose={() => setVoucherModal(null)} maxWidth={620}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 50, height: 50, borderRadius: "50%", background: CUSTOMER_GRADIENT, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                  {getInitials(voucherModal.name)}
                </div>
                <div>
                  <h3 style={{ margin: 0, color: "var(--text-primary, #172033)", display: "flex", alignItems: "center", gap: 6, fontSize: 16 }}>
                    <Ticket size={18} style={{ color: "#8b5cf6" }} /> {t("VÃ­ voucher")}
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--text-light, #8993a3)", marginTop: 2 }}>
                    <b style={{ color: "var(--text-primary, #172033)" }}>{voucherModal.name}</b> Â· {voucherModal.email}
                  </div>
                </div>
              </div>
              <button onClick={() => setVoucherModal(null)} style={modalCloseStyle} aria-label={t("ÄÃ³ng")}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
              <MiniStat label={t("Tá»”NG")} value={voucherStats.total} color="#2634d5" bg="#eef2ff" />
              <MiniStat label={t("KHáº¢ Dá»¤NG")} value={voucherStats.available} color="#18a967" bg="#e8f9f1" />
              <MiniStat label={t("ÄÃƒ DÃ™NG")} value={voucherStats.used} color="#ef4444" bg="#fee2e2" />
              <MiniStat label={t("Tá»”NG GIÃ TRá»Š")} value={fmtMoney(voucherStats.totalValue || 0)} color="#f59e0b" bg="#fff4d8" smallValue />
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "var(--bg-tertiary, #f5f7fb)", padding: 4, borderRadius: 10 }}>
              {[
                { id: "active", label: t("Kháº£ dá»¥ng"), count: voucherStats.available, color: "#18a967" },
                { id: "used", label: t("ÄÃ£ dÃ¹ng"), count: voucherStats.used, color: "#ef4444" },
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
                <div style={{ fontSize: 13 }}>{t("Äang táº£i vÃ­ voucher...")}</div>
              </div>
            ) : visibleVouchers.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10 }}>
                <Ticket size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 13 }}>
                  {voucherTab === "active" ? t("KhÃ¡ch chÆ°a cÃ³ voucher kháº£ dá»¥ng") : t("KhÃ¡ch chÆ°a dÃ¹ng voucher nÃ o")}
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
                              {new Date(v.created_at).toLocaleDateString("vi-VN")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: v.used ? "var(--text-muted, #64748b)" : "#18a967" }}>
                          {fmtMoney(v.value)}
                        </div>
                        <span style={{ fontSize: 10, color: v.used ? "#ef4444" : "#18a967", fontWeight: 700 }}>
                          {v.used ? t("ÄÃ£ dÃ¹ng") : t("Kháº£ dá»¥ng")}
                        </span>
                      </div>

                      {!v.used && (
                        <button onClick={() => revokeVoucher(v)} title={t("Thu há»“i")} style={{ padding: 6, border: "1px solid #ef4444", borderRadius: 6, background: "var(--card-bg, #fff)", cursor: "pointer", color: "#ef4444", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={() => setVoucherModal(null)} style={{ ...btnPrimaryStyle, marginTop: 16 }}>
              {t("ÄÃ³ng")}
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

// ============================================================
// SUB-COMPONENTS
// ============================================================
function StatusBadge({ status, t }) {
  const active = status === "Hoáº¡t Ä‘á»™ng";
  return (
    <span style={{ display: "inline-flex", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: active ? "#e8f9f1" : "#fde8e8", color: active ? "#18a967" : "#ef4444", whiteSpace: "nowrap" }}>
      {t(status)}
    </span>
  );
}

function MemberTierBadge({ spent }) {
  const tier = getMemberTier(spent);
  const meta = TIER_BADGE[tier] || TIER_BADGE["ThÃ nh viÃªn má»›i"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: "nowrap" }}>
      {meta.icon} {tier}
    </span>
  );
}
function CustomerTypeBadge({ type }) {
  const meta = TYPE_BADGE[type] || TYPE_BADGE["KhÃ¡ch"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: "nowrap" }}>
      {meta.icon} {type}
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

function Modal({ children, onClose, maxWidth = 480 }) {
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: MODAL_Z, padding: 20, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card-bg, #fff)", borderRadius: 14, padding: 24, width: "100%", maxWidth, maxHeight: "90vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// STYLE CONSTANTS
// ============================================================
const thStyle = { padding: 11, textAlign: "left", fontSize: 12, color: "var(--text-muted, #64748b)", fontWeight: 600 };
const tdStyle = { padding: 11, color: "var(--text-primary, #172033)", fontSize: 13 };
const modalCloseStyle = { background: "transparent", border: 0, cursor: "pointer", color: "var(--text-light, #8993a3)", padding: 4, display: "grid", placeItems: "center" };
const modalInputStyle = { width: "100%", padding: 10, border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8, marginBottom: 14, outline: "none", background: "var(--bg-secondary, #fff)", color: "var(--text-primary, #172033)", fontSize: 13, boxSizing: "border-box" };
const modalLabelStyle = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-muted, #475569)" };
const btnPrimaryStyle = { width: "100%", padding: 12, background: "#2634d5", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
const btnPrimaryStyleLoading = (loading) => ({ flex: 1, padding: 12, background: loading ? "#94a3b8" : "#2634d5", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 });
const btnCancelStyle = { flex: 1, padding: 12, border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8, background: "var(--card-bg, #fff)", cursor: "pointer", color: "var(--text-primary, #172033)", fontWeight: 600, fontSize: 13 };
