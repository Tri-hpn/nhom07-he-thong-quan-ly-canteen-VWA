// ============================================================
// OWNEREMPLOYEES.JSX — Quản lý nhân viên (Admin) V2
// ============================================================
// Layout: Card grid (đồng bộ với OwnerMenu)
//   - Toolbar: search + filter trạng thái + nút "Thêm nhân viên"
//   - Grid card: avatar + info + ca hôm nay + chấm công + actions
//   - Pagination 12 NV/trang
//   - Modal: Xem/Sửa/Thêm + Giao việc + Danh sách task
//
// ✅ TÍNH NĂNG MỚI:
//   - Card grid thay bảng
//   - Filter trạng thái (Hoạt động / Bị khóa)
//   - Pagination
//   - Hiển thị ca làm hôm nay + chấm công
//   - Nút "Giao việc" trên mỗi card
//   - Modal xem danh sách task đã giao
//
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// 🔧 FIX #89: t() truyền vars thay vì .replace("{password}", ...)
// 🔧 FIX: Xóa hoàn toàn import + tab OwnerShifts (file đã bị xóa
//         trong commit cfd02140, route /owner/shifts đã redirect
//         sang /owner/attendance)
// ============================================================

import { SkeletonList } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus, Search, Pencil, Trash2, KeyRound, Eye, EyeOff, X, Save,
  User as UserIcon, Mail, Phone, Lock, Shield, Loader2, AlertCircle,
  Users, Filter, ChevronLeft, ChevronRight, ClipboardList, Calendar,
  Sun, Sunrise, Sunset, CheckCircle2, Clock, AlertTriangle, Flag,
  Briefcase, CheckSquare,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useI18n } from "../../hooks/useI18n";
// ❌ ĐÃ XÓA: import OwnerShifts from "./OwnerShifts";

// ============================================================
// CONSTANTS
// ============================================================

const EMPLOYEE_GRADIENT = "linear-gradient(135deg, #2634d5, #20c779)";
const DEFAULT_PASSWORD = "123456";
const MODAL_Z = 2147483600;
const PAGE_SIZE = 12;

const STATUS_FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "active", label: "Hoạt động" },
  { id: "locked", label: "Bị khóa" },
];

const SHIFT_OPTIONS = [
  { id: "", label: "Không gắn ca" },
  { id: "Ca sáng", label: "Ca sáng (06:30-12:30)" },
  { id: "Ca chiều", label: "Ca chiều (12:30-18:30)" },
];

const PRIORITY_OPTIONS = [
  { id: "low", label: "Thấp", color: "#64748b" },
  { id: "normal", label: "Bình thường", color: "#2634d5" },
  { id: "high", label: "Cao", color: "#f59e0b" },
  { id: "urgent", label: "Khẩn cấp", color: "#ef4444" },
];

const PRIORITY_MAP = {
  low: { label: "Thấp", color: "#64748b", bg: "#f1f5f9" },
  normal: { label: "Bình thường", color: "#2634d5", bg: "#eef2ff" },
  high: { label: "Cao", color: "#b45309", bg: "#fef3c7" },
  urgent: { label: "Khẩn cấp", color: "#b91c1c", bg: "#fee2e2" },
};

const STATUS_MAP = {
  pending: { label: "Chờ làm", color: "#b45309", bg: "#fef3c7" },
  done: { label: "Hoàn thành", color: "#065f46", bg: "#d1fae5" },
  cancelled: { label: "Đã huỷ", color: "#64748b", bg: "#e2e8f0" },
};

// ============================================================
// HELPERS
// ============================================================

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function getInitials(name) {
  return (name || "?").slice(0, 2).toUpperCase();
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

function isOverdue(task) {
  if (!task?.due_date || task.status !== "pending") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date + "T00:00:00");
  return due < today;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

function OwnerEmployeesInner() {
  const { t } = useI18n();

  // ---------- Data ----------
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // ---------- Pagination ----------
  const [page, setPage] = useState(1);

  // ---------- Ca làm + chấm công hôm nay (map theo employee_id) ----------
  const [todayShiftsMap, setTodayShiftsMap] = useState({});
  const [todayAttendanceMap, setTodayAttendanceMap] = useState({});

  // ---------- Task map (đếm task pending theo employee_id) ----------
  const [taskCountMap, setTaskCountMap] = useState({});

  // ---------- Detail modal ----------
  const [detailModal, setDetailModal] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---------- Add modal ----------
  const [addModal, setAddModal] = useState(false);
  const [adding, setAdding] = useState(false);

  // ---------- Assign task modal ----------
  const [assignModal, setAssignModal] = useState(null); // { employee }
  const [assigning, setAssigning] = useState(false);

  // ---------- Task list modal ----------
  const [taskListModal, setTaskListModal] = useState(null); // { employee, tasks: [] }
  const [taskListLoading, setTaskListLoading] = useState(false);

  // ---------- Confirm dialog ----------
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ---------- All users for email dup check ----------
  const [allUsers, setAllUsers] = useState([]);

  // ============================================================
  // LOAD
  // ============================================================

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.users.list("EMPLOYEE");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || t("Không tải được danh sách nhân viên"));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadAllUsers = useCallback(async () => {
    try {
      const data = await api.users.list();
      setAllUsers(Array.isArray(data) ? data : []);
    } catch {
      setAllUsers([]);
    }
  }, []);

  // Load ca làm hôm nay (map theo employee_id)
  const loadTodayShifts = useCallback(async () => {
    try {
      const data = await api.shifts.approvedToday();
      const map = {};
      (Array.isArray(data) ? data : []).forEach((s) => {
        if (!map[s.employee_id]) map[s.employee_id] = [];
        map[s.employee_id].push(s.shift);
      });
      setTodayShiftsMap(map);
    } catch {
      setTodayShiftsMap({});
    }
  }, []);

  // Load chấm công hôm nay (map theo employee_id)
  const loadTodayAttendance = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const data = await api.attendance.all({ from: todayStr, to: todayStr });
      const map = {};
      (Array.isArray(data) ? data : []).forEach((a) => {
        if (!map[a.employee_id]) map[a.employee_id] = a;
      });
      setTodayAttendanceMap(map);
    } catch {
      setTodayAttendanceMap({});
    }
  }, []);

  // Load task count (map theo employee_id — số task pending)
  const loadTaskCounts = useCallback(async () => {
    try {
      const data = await api.tasks.all({ status: "pending" });
      const map = {};
      (Array.isArray(data) ? data : []).forEach((task) => {
        map[task.assigned_to] = (map[task.assigned_to] || 0) + 1;
      });
      setTaskCountMap(map);
    } catch {
      setTaskCountMap({});
    }
  }, []);

  useEffect(() => {
    load();
    loadAllUsers();
    loadTodayShifts();
    loadTodayAttendance();
    loadTaskCounts();
  }, [load, loadAllUsers, loadTodayShifts, loadTodayAttendance, loadTaskCounts]);

  // ESC đóng modals
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (taskListModal) {
        setTaskListModal(null);
        return;
      }
      if (assignModal && !assigning) {
        setAssignModal(null);
        return;
      }
      if (addModal && !adding) {
        setAddModal(false);
        return;
      }
      if (detailModal && !saving) {
        closeDetail();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addModal, detailModal, assignModal, taskListModal, adding, saving, assigning]);

  // ============================================================
  // COMPUTED
  // ============================================================

  const existingEmails = useMemo(() => {
    const set = new Set();
    for (const u of allUsers) {
      if (u.email) set.add(u.email.toLowerCase().trim());
    }
    return set;
  }, [allUsers]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = list;

    // Filter trạng thái
    if (statusFilter === "active") {
      result = result.filter((e) => (e.status || "Hoạt động") === "Hoạt động");
    } else if (statusFilter === "locked") {
      result = result.filter((e) => e.status === "Bị khóa");
    }

    // Search
    if (q.trim()) {
      const s = normalize(q);
      result = result.filter(
        (e) =>
          normalize(e.name).includes(s) ||
          normalize(e.email).includes(s) ||
          String(e.id).includes(s)
      );
    }

    return result;
  }, [list, q, statusFilter]);

  // Reset page khi filter/search đổi
  useEffect(() => {
    setPage(1);
  }, [q, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // ============================================================
  // HANDLERS — Detail / Add / Edit
  // ============================================================

  const openDetail = (emp, mode = "view") => {
    setDetailModal({ employee: emp, mode });
    setShowPw(false);
  };

  const closeDetail = () => {
    setDetailModal(null);
    setShowPw(false);
  };

  const switchToEdit = () => {
    if (!detailModal) return;
    setDetailModal({ ...detailModal, mode: "edit" });
    setShowPw(false);
  };

  const switchToView = () => {
    if (!detailModal) return;
    setDetailModal({ ...detailModal, mode: "view" });
    setShowPw(false);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const f = new FormData(e.currentTarget);
    const data = {
      name: f.get("name")?.trim(),
      phone: f.get("phone")?.trim(),
      status: f.get("status"),
    };
    const newPwd = f.get("password");
    if (newPwd && newPwd.trim()) data.password = newPwd.trim();

    if (!data.name) {
      toast(t("Vui lòng nhập họ tên"), "error");
      return;
    }
    if (newPwd && newPwd.trim().length < 6) {
      toast(t("Mật khẩu phải từ 6 ký tự"), "error");
      return;
    }

    setSaving(true);
    try {
      await api.users.update(detailModal.employee.id, data);
      toast(t("Đã cập nhật nhân viên"), "success");

      const updated = await api.users.list("EMPLOYEE");
      setList(Array.isArray(updated) ? updated : []);
      const newDetail = updated.find(
        (u) => String(u.id) === String(detailModal.employee.id)
      );
      if (newDetail) {
        setDetailModal({ employee: newDetail, mode: "view" });
      } else {
        closeDetail();
      }
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally {
      setSaving(false);
    }
  };

  const saveAdd = async (e) => {
    e.preventDefault();
    if (adding) return;

    const f = new FormData(e.currentTarget);
    const name = f.get("name")?.trim();
    const email = f.get("email")?.trim().toLowerCase();
    const phone = f.get("phone")?.trim();
    const password = f.get("password")?.trim() || DEFAULT_PASSWORD;

    if (!name) return toast(t("Vui lòng nhập họ tên"), "error");
    if (!email) return toast(t("Vui lòng nhập email"), "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return toast(t("Email không hợp lệ"), "error");
    if (password.length < 6)
      return toast(t("Mật khẩu phải từ 6 ký tự"), "error");

    if (existingEmails.has(email)) {
      return toast(
        `${t("Email")} "${email}" ${t("đã được sử dụng — vui lòng dùng email khác")}`,
        "error"
      );
    }

    setAdding(true);
    try {
      await api.users.create({
        name,
        email,
        phone,
        role: "EMPLOYEE",
        status: f.get("status") || "Hoạt động",
        password,
      });
      toast(
        t("Đã thêm nhân viên mới") +
          " — " +
          t("nhân viên sẽ phải đổi mật khẩu khi đăng nhập lần đầu"),
        "success"
      );
      setAddModal(false);
      load();
      loadAllUsers();
    } catch (e) {
      toast(e.message || t("Không thêm được"), "error");
    } finally {
      setAdding(false);
    }
  };

  // ============================================================
  // HANDLERS — Confirm
  // ============================================================

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

  const remove = (emp) => {
    setConfirm({
      title: `${t("Xóa nhân viên")} "${emp.name}"?`,
      message:
        t("Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan") +
        " " +
        t("(chấm công, ca làm, chat...) sẽ bị xoá vĩnh viễn."),
      confirmText: t("Xóa vĩnh viễn"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        await api.users.remove(emp.id);
        toast(t("Đã xóa nhân viên"), "success");
        setConfirm(null);
        closeDetail();
        load();
        loadAllUsers();
      },
    });
  };

  const resetPassword = (emp) => {
    setConfirm({
      title: `${t("Reset mật khẩu của")} "${emp.name}"?`,
      message:
        `${t("Mật khẩu sẽ được đặt lại về")} "${DEFAULT_PASSWORD}".\n\n` +
        t("Hãy thông báo mật khẩu mới cho nhân viên sau khi reset.") +
        "\n\n" +
        t("Nhân viên sẽ được yêu cầu đổi mật khẩu ngay khi đăng nhập lần tới."),
      confirmText: t("Reset mật khẩu"),
      cancelText: t("Hủy"),
      danger: false,
      onConfirm: async () => {
        await api.users.update(emp.id, { password: DEFAULT_PASSWORD });
        toast(
          `${t("Đã reset mật khẩu về")} "${DEFAULT_PASSWORD}" — ` +
            t("nhân viên phải đổi mật khẩu khi đăng nhập"),
          "success"
        );
        setConfirm(null);
        load();
      },
    });
  };

  // ============================================================
  // HANDLERS — Assign task
  // ============================================================

  const openAssign = (emp) => {
    setAssignModal({ employee: emp });
  };

  const closeAssign = () => {
    if (assigning) return;
    setAssignModal(null);
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    if (assigning || !assignModal) return;

    const f = new FormData(e.currentTarget);
    const title = f.get("title")?.trim();
    const description = f.get("description")?.trim();
    const due_date = f.get("due_date") || "";
    const shift = f.get("shift") || "";
    const priority = f.get("priority") || "normal";

    if (!title) return toast(t("Vui lòng nhập tiêu đề công việc"), "error");

    setAssigning(true);
    try {
      await api.tasks.create({
        title,
        description,
        assigned_to: assignModal.employee.id,
        due_date,
        shift,
        priority,
      });
      toast(
        `${t("Đã giao việc cho")} ${assignModal.employee.name}`,
        "success"
      );
      setAssignModal(null);
      loadTaskCounts();
    } catch (e) {
      toast(e.message || t("Không giao được việc"), "error");
    } finally {
      setAssigning(false);
    }
  };

  // ============================================================
  // HANDLERS — View task list
  // ============================================================

  const openTaskList = async (emp) => {
    setTaskListModal({ employee: emp, tasks: [] });
    setTaskListLoading(true);
    try {
      const data = await api.tasks.all({ assigned_to: emp.id });
      setTaskListModal({ employee: emp, tasks: Array.isArray(data) ? data : [] });
    } catch (e) {
      toast(e.message || t("Không tải được danh sách công việc"), "error");
      setTaskListModal({ employee: emp, tasks: [] });
    } finally {
      setTaskListLoading(false);
    }
  };

  const closeTaskList = () => {
    setTaskListModal(null);
  };

  const deleteTask = (task) => {
    setConfirm({
      title: `${t("Xoá công việc")} "${task.title}"?`,
      message: t("Công việc sẽ bị xoá vĩnh viễn khỏi hệ thống."),
      confirmText: t("Xoá"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        try {
          await api.tasks.remove(task.id);
          toast(t("Đã xoá công việc"), "success");
          setConfirm(null);
          // Refresh list
          if (taskListModal) {
            openTaskList(taskListModal.employee);
          }
          loadTaskCounts();
        } catch (e) {
          toast(e.message || t("Không xoá được"), "error");
        }
      },
    });
  };
  // ============================================================
  // RENDER
  // ============================================================

  return (
    <>
      <div>
        {/* ============ TOOLBAR ============ */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 20,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {/* Search */}
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
              minWidth: 220,
              maxWidth: 400,
            }}
          >
            <Search size={18} style={{ color: "var(--text-light, #8993a3)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Tìm nhân viên...")}
              style={{
                flex: 1,
                border: 0,
                outline: "none",
                fontSize: 13,
                background: "transparent",
                color: "var(--text-primary, #172033)",
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
                }}
                aria-label={t("Xoá tìm kiếm")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter trạng thái */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: 4,
              background: "var(--card-bg, #fff)",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 10,
            }}
          >
            <Filter
              size={14}
              style={{
                color: "var(--text-light, #8993a3)",
                marginLeft: 8,
                marginRight: 4,
              }}
            />
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  style={{
                    padding: "6px 12px",
                    background: active ? "#2634d5" : "transparent",
                    color: active ? "#fff" : "var(--text-muted, #475569)",
                    border: 0,
                    borderRadius: 7,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t(f.label)}
                </button>
              );
            })}
          </div>

          {/* Add button */}
          <button
            onClick={() => setAddModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#2634d5",
              color: "#fff",
              padding: "10px 16px",
              border: 0,
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
              marginLeft: "auto",
            }}
          >
            <Plus size={16} /> {t("Thêm nhân viên")}
          </button>
        </div>

        {/* ============ RESULT INFO ============ */}
        {!loading && !error && filtered.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              fontSize: 13,
              color: "var(--text-muted, #64748b)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span>
              {t("Hiển thị")}{" "}
              <b style={{ color: "var(--text-primary, #172033)" }}>
                {paginatedItems.length}
              </b>{" "}
              / {filtered.length} {t("nhân viên")}
            </span>
          </div>
        )}

        {/* ============ LOADING ============ */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SkeletonList />
            <SkeletonList />
            <SkeletonList />
          </div>
        )}

        {/* ============ ERROR ============ */}
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
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {t("Không tải được dữ liệu")}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>
              {error}
            </div>
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
              {t("Thử lại")}
            </button>
          </div>
        )}

        {/* ============ EMPTY ============ */}
        {!loading && !error && filtered.length === 0 && (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--text-light, #8993a3)",
              background: "var(--card-bg, #fff)",
              borderRadius: 14,
            }}
          >
            <Users size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>
              {q || statusFilter !== "all"
                ? t("Không có nhân viên nào khớp bộ lọc")
                : t("Chưa có nhân viên nào")}
            </div>
          </div>
        )}

        {/* ============ CARD GRID ============ */}
        {!loading && !error && filtered.length > 0 && (
          <>
            <div className="admin-employees-grid">
              {paginatedItems.map((emp) => (
                <EmployeeCard
                  key={emp.id}
                  emp={emp}
                  todayShifts={todayShiftsMap[emp.id] || []}
                  todayAttendance={todayAttendanceMap[emp.id]}
                  taskCount={taskCountMap[emp.id] || 0}
                  onView={() => openDetail(emp, "view")}
                  onEdit={() => openDetail(emp, "edit")}
                  onReset={() => resetPassword(emp)}
                  onDelete={() => remove(emp)}
                  onAssign={() => openAssign(emp)}
                  onViewTasks={() => openTaskList(emp)}
                  t={t}
                />
              ))}
            </div>

            {/* ============ PAGINATION ============ */}
            {totalPages > 1 && (
              <div className="admin-employees-pagination">
                <button
                  type="button"
                  className="admin-employees-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label={t("Trang trước")}
                >
                  <ChevronLeft size={18} />
                  <span>{t("Trang trước")}</span>
                </button>

                <div className="admin-employees-page-indicator">
                  <span className="admin-employees-page-indicator__label">
                    {t("Trang")}
                  </span>
                  <span className="admin-employees-page-indicator__current">
                    {currentPage}
                  </span>
                  <span className="admin-employees-page-indicator__sep">/</span>
                  <span className="admin-employees-page-indicator__total">
                    {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  className="admin-employees-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label={t("Trang sau")}
                >
                  <span>{t("Trang sau")}</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============ DETAIL/EDIT MODAL ============ */}
      {detailModal && (
        <Modal onClose={() => !saving && closeDetail()} maxWidth={480}>
          {detailModal.mode === "view" && (
            <>
              <div style={modalHeaderStyle}>
                <h3 style={modalTitleStyle}>
                  <UserIcon size={20} /> {t("Chi tiết nhân viên")}
                </h3>
                <button
                  onClick={closeDetail}
                  style={modalCloseStyle}
                  aria-label={t("Đóng")}
                >
                  <X size={20} />
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: EMPLOYEE_GRADIENT,
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 28,
                    marginBottom: 12,
                  }}
                >
                  {getInitials(detailModal.employee.name)}
                </div>
                <h3
                  style={{
                    margin: "0 0 4px",
                    color: "var(--text-primary, #172033)",
                  }}
                >
                  {detailModal.employee.name}
                </h3>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 12px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "#eef2ff",
                    color: "#2634d5",
                  }}
                >
                  <Shield size={12} /> {t("Nhân viên")}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <InfoRow
                  icon={<UserIcon size={16} />}
                  label={t("Mã nhân viên")}
                  value={`NV${detailModal.employee.id}`}
                />
                <InfoRow
                  icon={<UserIcon size={16} />}
                  label={t("Họ và tên")}
                  value={detailModal.employee.name}
                />
                <InfoRow
                  icon={<Mail size={16} />}
                  label={t("Email")}
                  value={detailModal.employee.email}
                />
                <InfoRow
                  icon={<Phone size={16} />}
                  label={t("Số điện thoại")}
                  value={detailModal.employee.phone || "—"}
                />

                {/* Ca hôm nay */}
                <InfoRow
                  icon={<Calendar size={16} />}
                  label={t("Ca làm hôm nay")}
                  value={
                    (todayShiftsMap[detailModal.employee.id] || []).length > 0
                      ? (todayShiftsMap[detailModal.employee.id] || []).join(", ")
                      : t("Chưa phân ca")
                  }
                />

                {/* Chấm công hôm nay */}
                <InfoRow
                  icon={<Clock size={16} />}
                  label={t("Chấm công hôm nay")}
                  value={(() => {
                    const att = todayAttendanceMap[detailModal.employee.id];
                    if (!att || !att.checkIn) return t("Chưa check-in");
                    const ci = new Date(att.checkIn);
                    const hh = String(ci.getHours()).padStart(2, "0");
                    const mi = String(ci.getMinutes()).padStart(2, "0");
                    return att.checkOut
                      ? `${hh}:${mi} → ${t("Đã check-out")}`
                      : `${hh}:${mi} → ${t("Đang trong ca")}`;
                  })()}
                />

                {/* Số task */}
                <InfoRow
                  icon={<ClipboardList size={16} />}
                  label={t("Công việc đang giao")}
                  value={
                    (taskCountMap[detailModal.employee.id] || 0) > 0
                      ? `${taskCountMap[detailModal.employee.id]} ${t("việc chưa xong")}`
                      : t("Không có việc nào")
                  }
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: 14,
                    background: "var(--bg-tertiary, #f8fafc)",
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "#fef3c7",
                      color: "#92400e",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Lock size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-light, #8993a3)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 2,
                      }}
                    >
                      {t("Mật khẩu hiện tại")}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "var(--text-primary, #172033)",
                        fontWeight: 600,
                        fontFamily: "monospace",
                      }}
                    >
                      {detailModal.employee.plainPassword
                        ? showPw
                          ? detailModal.employee.plainPassword
                          : "•".repeat(
                              detailModal.employee.plainPassword.length || 6
                            )
                        : t("(Chưa có)")}
                    </div>
                  </div>
                  {detailModal.employee.plainPassword && (
                    <button
                      onClick={() => setShowPw(!showPw)}
                      style={{
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        color: "var(--text-light, #8993a3)",
                        padding: 4,
                      }}
                      aria-label={
                        showPw ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")
                      }
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>

                <InfoRow
                  icon={<UserIcon size={16} />}
                  label={t("Trạng thái")}
                  value={
                    <StatusBadge
                      status={detailModal.employee.status || "Hoạt động"}
                      t={t}
                    />
                  }
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  onClick={() => {
                    closeDetail();
                    openTaskList(detailModal.employee);
                  }}
                  style={{
                    ...btnPrimaryStyle,
                    background: "#0ea5e9",
                  }}
                >
                  <ClipboardList size={14} /> {t("Xem danh sách công việc")}
                </button>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <button onClick={closeDetail} style={btnCancelStyle}>
                    {t("Đóng")}
                  </button>
                  <button onClick={switchToEdit} style={btnPrimaryStyle}>
                    <Pencil size={14} /> {t("Sửa")}
                  </button>
                </div>
              </div>
            </>
          )}

          {detailModal.mode === "edit" && (
            <>
              <div style={modalHeaderStyle}>
                <h3 style={modalTitleStyle}>{t("Sửa nhân viên")}</h3>
                <button
                  onClick={closeDetail}
                  style={modalCloseStyle}
                  aria-label={t("Đóng")}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={saveEdit} autoComplete="off">
                <label style={labelStyle}>{t("Họ và tên")} *</label>
                <input
                  name="name"
                  defaultValue={detailModal.employee.name || ""}
                  required
                  style={inputStyle}
                  autoFocus
                />

                <label style={labelStyle}>
                  {t("Email (không sửa được)")}
                </label>
                <input
                  name="email"
                  type="email"
                  defaultValue={detailModal.employee.email || ""}
                  disabled
                  style={{
                    ...inputStyle,
                    background: "var(--bg-tertiary, #f5f7fb)",
                    cursor: "not-allowed",
                    opacity: 0.7,
                  }}
                />

                <label style={labelStyle}>{t("Số điện thoại")}</label>
                <input
                  name="phone"
                  defaultValue={detailModal.employee.phone || ""}
                  style={inputStyle}
                />

                <label style={labelStyle}>
                  {t("Mật khẩu mới (để trống = giữ nguyên)")}
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    name="password"
                    type={showPw ? "text" : "password"}
                    placeholder={t("Ít nhất 6 ký tự")}
                    style={inputStyle}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: 12,
                      background: "none",
                      border: 0,
                      cursor: "pointer",
                      color: "var(--text-light, #8993a3)",
                    }}
                    aria-label={
                      showPw ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")
                    }
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <label style={labelStyle}>{t("Trạng thái")}</label>
                <select
                  name="status"
                  defaultValue={detailModal.employee.status || "Hoạt động"}
                  style={inputStyle}
                >
                  <option>{t("Hoạt động")}</option>
                  <option>{t("Bị khóa")}</option>
                </select>

                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={switchToView}
                    disabled={saving}
                    style={{ ...btnCancelStyle, flex: 1 }}
                  >
                    <X size={14} /> {t("Hủy")}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{ ...btnPrimaryStyle, flex: 1, width: "auto" }}
                  >
                    {saving ? (
                      <>
                        <Loader2
                          size={14}
                          style={{ animation: "spin 1s linear infinite" }}
                        />
                        {t("Đang lưu...")}
                      </>
                    ) : (
                      <>
                        <Save size={14} /> {t("Lưu")}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </Modal>
      )}

      {/* ============ ADD MODAL ============ */}
      {addModal && (
        <Modal onClose={() => !adding && setAddModal(false)} maxWidth={480}>
          <div style={modalHeaderStyle}>
            <h3 style={modalTitleStyle}>{t("Thêm nhân viên")}</h3>
            <button
              onClick={() => !adding && setAddModal(false)}
              style={modalCloseStyle}
              aria-label={t("Đóng")}
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={saveAdd} autoComplete="off">
            <label style={labelStyle}>{t("Họ và tên")} *</label>
            <input name="name" required style={inputStyle} autoFocus />

            <label style={labelStyle}>{t("Email")} *</label>
            <input name="email" type="email" required style={inputStyle} />

            <label style={labelStyle}>{t("Số điện thoại")}</label>
            <input name="phone" style={inputStyle} />

            <label style={labelStyle}>
              {t("Mật khẩu (để trống = {password})", {
                password: DEFAULT_PASSWORD,
              })}
            </label>
            <input
              name="password"
              placeholder={DEFAULT_PASSWORD}
              style={inputStyle}
              autoComplete="new-password"
            />

            <label style={labelStyle}>{t("Trạng thái")}</label>
            <select name="status" defaultValue={t("Hoạt động")} style={inputStyle}>
              <option>{t("Hoạt động")}</option>
              <option>{t("Bị khóa")}</option>
            </select>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setAddModal(false)}
                disabled={adding}
                style={{ ...btnCancelStyle, flex: 1 }}
              >
                {t("Hủy")}
              </button>
              <button
                type="submit"
                disabled={adding}
                style={{ ...btnPrimaryStyle, flex: 1, width: "auto" }}
              >
                {adding ? (
                  <>
                    <Loader2
                      size={14}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    {t("Đang tạo...")}
                  </>
                ) : (
                  <>
                    <Save size={14} /> {t("Tạo nhân viên")}
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ============ ASSIGN TASK MODAL ============ */}
      {assignModal && (
        <Modal onClose={closeAssign} maxWidth={520}>
          <div style={modalHeaderStyle}>
            <h3 style={modalTitleStyle}>
              <ClipboardList size={20} style={{ color: "#0ea5e9" }} />
              {t("Giao việc cho nhân viên")}
            </h3>
            <button
              onClick={closeAssign}
              style={modalCloseStyle}
              aria-label={t("Đóng")}
            >
              <X size={20} />
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              background: "var(--bg-tertiary, #f5f7fb)",
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: EMPLOYEE_GRADIENT,
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {getInitials(assignModal.employee.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <b
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "var(--text-primary, #172033)",
                }}
              >
                {assignModal.employee.name}
              </b>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-light, #8993a3)",
                }}
              >
                NV{assignModal.employee.id} · {assignModal.employee.email}
              </span>
            </div>
          </div>

          <form onSubmit={submitAssign} autoComplete="off">
            <label style={labelStyle}>{t("Tiêu đề công việc")} *</label>
            <input
              name="title"
              required
              placeholder={t("VD: Kiểm tra nhiệt độ tủ mát")}
              style={inputStyle}
              autoFocus
            />

            <label style={labelStyle}>{t("Mô tả chi tiết")}</label>
            <textarea
              name="description"
              placeholder={t("Mô tả công việc, yêu cầu cụ thể...")}
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>{t("Ca làm việc")}</label>
                <select name="shift" defaultValue="" style={inputStyle}>
                  {SHIFT_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {t(o.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("Ưu tiên")}</label>
                <select name="priority" defaultValue="normal" style={inputStyle}>
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {t(o.label)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label style={labelStyle}>{t("Hạn hoàn thành")}</label>
            <input name="due_date" type="date" style={inputStyle} />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={closeAssign}
                disabled={assigning}
                style={{ ...btnCancelStyle, flex: 1 }}
              >
                {t("Hủy")}
              </button>
              <button
                type="submit"
                disabled={assigning}
                style={{
                  ...btnPrimaryStyle,
                  flex: 1,
                  width: "auto",
                  background: "#0ea5e9",
                }}
              >
                {assigning ? (
                  <>
                    <Loader2
                      size={14}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    {t("Đang giao...")}
                  </>
                ) : (
                  <>
                    <ClipboardList size={14} /> {t("Giao việc")}
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ============ TASK LIST MODAL ============ */}
      {taskListModal && (
        <Modal onClose={closeTaskList} maxWidth={640}>
          <div style={modalHeaderStyle}>
            <h3 style={modalTitleStyle}>
              <ClipboardList size={20} style={{ color: "#0ea5e9" }} />
              {t("Công việc của")} {taskListModal.employee.name}
            </h3>
            <button
              onClick={closeTaskList}
              style={modalCloseStyle}
              aria-label={t("Đóng")}
            >
              <X size={20} />
            </button>
          </div>

          {taskListLoading ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-light, #8993a3)",
              }}
            >
              <Loader2
                size={24}
                style={{ animation: "spin 1s linear infinite", marginBottom: 8 }}
              />
              <div>{t("Đang tải danh sách...")}</div>
            </div>
          ) : taskListModal.tasks.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-light, #8993a3)",
              }}
            >
              <ClipboardList size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>{t("Chưa có công việc nào được giao")}</div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                maxHeight: 500,
                overflowY: "auto",
                marginBottom: 16,
              }}
            >
              {taskListModal.tasks.map((task) => {
                const prio = PRIORITY_MAP[task.priority] || PRIORITY_MAP.normal;
                const stat = STATUS_MAP[task.status] || STATUS_MAP.pending;
                const overdue = isOverdue(task);

                return (
                  <div
                    key={task.id}
                    style={{
                      padding: 14,
                      background: "var(--card-bg, #fff)",
                      border: "1px solid var(--border-color, #e5e9ef)",
                      borderRadius: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                            marginBottom: 4,
                          }}
                        >
                          <b
                            style={{
                              fontSize: 13.5,
                              color: "var(--text-primary, #172033)",
                            }}
                          >
                            {task.title}
                          </b>
                          <span
                            style={{
                              padding: "1px 8px",
                              borderRadius: 10,
                              background: prio.bg,
                              color: prio.color,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            {t(prio.label)}
                          </span>
                          <span
                            style={{
                              padding: "1px 8px",
                              borderRadius: 10,
                              background: stat.bg,
                              color: stat.color,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            {t(stat.label)}
                          </span>
                          {overdue && (
                            <span
                              style={{
                                padding: "1px 8px",
                                borderRadius: 10,
                                background: "#fee2e2",
                                color: "#b91c1c",
                                fontSize: 10,
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              <AlertTriangle size={10} />
                              {t("Quá hạn")}
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p
                            style={{
                              margin: "4px 0 0",
                              fontSize: 12.5,
                              color: "var(--text-muted, #64748b)",
                              lineHeight: 1.5,
                            }}
                          >
                            {task.description}
                          </p>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            marginTop: 8,
                            flexWrap: "wrap",
                            fontSize: 11.5,
                            color: "var(--text-light, #8993a3)",
                          }}
                        >
                          {task.due_date && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Calendar size={11} />
                              {fmtDate(task.due_date)}
                            </span>
                          )}
                          {task.shift && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Clock size={11} />
                              {task.shift}
                            </span>
                          )}
                          <span>
                            {t("Giao bởi")}: {task.assigned_by_name || t("Admin")}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => deleteTask(task)}
                          title={t("Xoá công việc")}
                          aria-label={t("Xoá công việc")}
                          style={{
                            padding: 6,
                            border: "1px solid var(--border-color, #e5e9ef)",
                            borderRadius: 6,
                            background: "var(--card-bg, #fff)",
                            color: "#ef4444",
                            cursor: "pointer",
                            display: "grid",
                            placeItems: "center",
                            width: 30,
                            height: 30,
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={closeTaskList} style={{ ...btnPrimaryStyle, width: "100%" }}>
            {t("Đóng")}
          </button>
        </Modal>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

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
// SUB-COMPONENT: EmployeeCard — Card grid (đồng bộ OwnerMenu)
// ============================================================

function EmployeeCard({
  emp,
  todayShifts = [],
  todayAttendance,
  taskCount = 0,
  onView,
  onEdit,
  onReset,
  onDelete,
  onAssign,
  onViewTasks,
  t,
}) {
  const isActive = (emp.status || "Hoạt động") === "Hoạt động";
  const hasShiftToday = todayShifts.length > 0;

  // Chấm công hôm nay
  let attendanceLabel = null;
  let attendanceVariant = "neutral";
  if (todayAttendance?.checkIn) {
    const ci = new Date(todayAttendance.checkIn);
    const hh = String(ci.getHours()).padStart(2, "0");
    const mi = String(ci.getMinutes()).padStart(2, "0");
    if (todayAttendance.checkOut) {
      attendanceLabel = `${hh}:${mi} · ${t("Đã về")}`;
      attendanceVariant = "done";
    } else {
      attendanceLabel = `${hh}:${mi} · ${t("Đang làm")}`;
      attendanceVariant = "active";
    }
  } else if (hasShiftToday) {
    attendanceLabel = t("Chưa check-in");
    attendanceVariant = "warning";
  }

  return (
    <article
      className={`admin-emp-card ${
        !isActive ? "admin-emp-card--locked" : ""
      }`}
    >
      {/* Avatar + Status */}
      <div className="admin-emp-card__header">
        <div className="admin-emp-card__avatar">
          {getInitials(emp.name)}
          <span
            className={`admin-emp-card__status-dot admin-emp-card__status-dot--${
              isActive ? "active" : "locked"
            }`}
          />
        </div>

        <div className="admin-emp-card__title">
          <h3 className="admin-emp-card__name">{emp.name}</h3>
          <span className="admin-emp-card__id">NV{emp.id}</span>
        </div>

        <StatusBadge status={emp.status || "Hoạt động"} t={t} />
      </div>

      {/* Contact info */}
      <div className="admin-emp-card__info">
        <div className="admin-emp-card__info-row">
          <Mail size={12} />
          <span className="admin-emp-card__info-text">{emp.email}</span>
        </div>
        <div className="admin-emp-card__info-row">
          <Phone size={12} />
          <span className="admin-emp-card__info-text">
            {emp.phone || "—"}
          </span>
        </div>
      </div>

      {/* Status row: Ca + Chấm công + Task count */}
      <div className="admin-emp-card__status-row">
        {/* Ca hôm nay */}
        <div
          className={`admin-emp-card__chip ${
            hasShiftToday ? "admin-emp-card__chip--shift" : ""
          }`}
        >
          {hasShiftToday ? <Sunrise size={11} /> : <Sun size={11} />}
          <span>
            {hasShiftToday
              ? todayShifts.join(", ")
              : t("Chưa phân ca")}
          </span>
        </div>

        {/* Chấm công */}
        {attendanceLabel && (
          <div
            className={`admin-emp-card__chip admin-emp-card__chip--att-${attendanceVariant}`}
          >
            <Clock size={11} />
            <span>{attendanceLabel}</span>
          </div>
        )}

        {/* Task count */}
        {taskCount > 0 && (
          <button
            type="button"
            className="admin-emp-card__chip admin-emp-card__chip--tasks"
            onClick={onViewTasks}
            title={t("Xem công việc")}
          >
            <ClipboardList size={11} />
            <span>
              {taskCount} {t("việc")}
            </span>
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="admin-emp-card__actions">
        <button
          type="button"
          className="admin-emp-card__btn admin-emp-card__btn--primary"
          onClick={onAssign}
          title={t("Giao việc cho nhân viên")}
        >
          <ClipboardList size={14} />
          <span>{t("Giao việc")}</span>
        </button>

        <div className="admin-emp-card__icon-actions">
          <button
            type="button"
            className="admin-emp-card__icon-btn"
            onClick={onView}
            title={t("Xem chi tiết")}
            aria-label={t("Xem chi tiết")}
          >
            <Eye size={14} />
          </button>
          <button
            type="button"
            className="admin-emp-card__icon-btn"
            onClick={onEdit}
            title={t("Sửa")}
            aria-label={t("Sửa")}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="admin-emp-card__icon-btn admin-emp-card__icon-btn--warning"
            onClick={onReset}
            title={t("Reset mật khẩu")}
            aria-label={t("Reset mật khẩu")}
          >
            <KeyRound size={14} />
          </button>
          <button
            type="button"
            className="admin-emp-card__icon-btn admin-emp-card__icon-btn--danger"
            onClick={onDelete}
            title={t("Xóa")}
            aria-label={t("Xóa")}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function StatusBadge({ status, t }) {
  const active = status === "Hoạt động";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: active ? "#e8f9f1" : "#fde8e8",
        color: active ? "#18a967" : "#ef4444",
        whiteSpace: "nowrap",
      }}
    >
      {t(status)}
    </span>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 14,
        background: "var(--bg-tertiary, #f8fafc)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "#eef2ff",
          color: "#2634d5",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-light, #8993a3)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--text-primary, #172033)",
            fontWeight: 600,
            wordBreak: "break-word",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function Modal({ children, onClose, maxWidth = 480 }) {
  return (
    <div
      onClick={onClose}
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
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================
// WRAPPER: OwnerEmployees
// ============================================================
// 🔧 FIX: Xóa hoàn toàn tab "Ca làm & chấm công" — route
//         /owner/shifts đã redirect sang /owner/attendance trong App.jsx.
//         Tab này không còn cần thiết vì OwnerShifts.jsx đã bị xóa.

export default function OwnerEmployees() {
  return <OwnerEmployeesInner />;
}

// ============================================================
// STYLE CONSTANTS
// ============================================================

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  marginTop: 12,
  color: "var(--text-muted, #475569)",
};

const inputStyle = {
  width: "100%",
  padding: 10,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  boxSizing: "border-box",
  marginBottom: 4,
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};

const modalTitleStyle = {
  margin: 0,
  color: "var(--text-primary, #172033)",
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const modalCloseStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 4,
  display: "grid",
  placeItems: "center",
};

const btnPrimaryStyle = {
  padding: 12,
  background: "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 13,
};

const btnCancelStyle = {
  padding: 12,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  background: "var(--card-bg, #fff)",
  cursor: "pointer",
  color: "var(--text-primary, #172033)",
  fontWeight: 600,
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};