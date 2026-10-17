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
// ============================================================

import { SkeletonList, Skeleton, SkeletonStats } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Plus, Search, Pencil, Trash2, KeyRound, Eye, EyeOff, X, Save,
  User as UserIcon, Mail, Phone, Lock, Shield, Loader2, AlertCircle,
  Users, Filter, ChevronLeft, ChevronRight, ClipboardList, Calendar,
  Sun, Sunrise, Sunset, CheckCircle2, Clock, AlertTriangle, Flag,
  Briefcase, CheckSquare, Check, CalendarDays, Bell, Edit, UserX,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useI18n } from "../../hooks/useI18n";
import EmployeePermissionsModal from "../../components/EmployeePermissionsModal";

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
  const [permModal, setPermModal] = useState(null);
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
                  onPermissions={() => setPermModal(emp)}
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

                <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
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

      {permModal && (
        <EmployeePermissionsModal
          user={permModal}
          onClose={() => setPermModal(null)}
        />
      )}

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
  onPermissions,
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
          {onPermissions && (
            <button
              type="button"
              className="admin-emp-card__icon-btn"
              onClick={onPermissions}
              title={t("Phân quyền")}
              aria-label={t("Phân quyền")}
            >
              <Shield size={14} />
            </button>
          )}
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

function normalizeShift(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
}
function isApproved(shift) { return !shift.status || shift.status === "approved"; }
function isPending(shift) { return shift.status === "pending"; }

const SHIFT_DEFS = [
  { id: "Ca sáng",  label: "Ca sáng",  time: "06:30 - 12:30", icon: Sunrise, color: "#f59e0b" },
  { id: "Ca chiều", label: "Ca chiều", time: "12:30 - 18:30", icon: Sun,     color: "#2634d5" },
];
const SHIFT_TABS = [
  { id: "today",   label: "Hôm nay" },
  { id: "week",    label: "Theo tuần" },
  { id: "assign",  label: "Phân ca" },
  { id: "history", label: "Lịch sử" },
];

const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false });
const DATE_SHORT_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit" });
const DATE_LONG_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const WEEKDAY_SHORT_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short" });

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(d) {
  if (!d) return "—";
  const date = new Date(d);
  return isNaN(date.getTime()) ? "—" : TIME_FORMATTER.format(date);
}
function fmtShiftDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return isNaN(d.getTime()) ? "—" : DATE_SHORT_FORMATTER.format(d);
}
function shiftColor(shiftId) {
  const sh = SHIFT_DEFS.find((x) => x.id === shiftId);
  return sh ? sh.color : "#64748b";
}
function shiftCode(shiftId) {
  if (shiftId === "Ca sáng") return "S";
  if (shiftId === "Ca chiều") return "C";
  return "?";
}

const REFRESH_MS = 30000;

function OwnerShiftsInner() {
  const { t } = useI18n();

  const [tab, setTab] = useState("today");

  // ---------- Data ----------
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---------- UI state ----------
  const [assignModal, setAssignModal] = useState(null);
  const [weekDate, setWeekDate] = useState(getToday());
  const [historyMonth, setHistoryMonth] = useState(getToday().slice(0, 7));
  const [search, setSearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState("nextWeek");

  // Processing per-shift (approve/reject)
  const [processingId, setProcessingId] = useState(null);

  // Confirm dialog
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Race-safe
  const reqIdRef = useRef(0);

  // Tab visible (pause auto-refresh)
  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" || !document.hidden
  );

  // ---------- Track tab visibility ----------
  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ---------- Load all data ----------

  const load = useCallback(async (silent = false) => {
    const myReqId = ++reqIdRef.current;
    if (!silent) setLoading(true);
    setError("");

    try {
      const [empsRes, attsRes, shiftsRes] = await Promise.all([
        api.users.list("EMPLOYEE").catch(() => []),
        api.attendance.all({ month: historyMonth }).catch(() => []),
        // Lấy CẢ ca pending để admin duyệt
        api.shifts.all({ include_pending: 1 }).catch(() => []),
      ]);

      if (myReqId !== reqIdRef.current) return;

      setEmployees(Array.isArray(empsRes) ? empsRes : []);
      setAttendances(Array.isArray(attsRes) ? attsRes : []);
      setShifts(Array.isArray(shiftsRes) ? shiftsRes : []);
    } catch (e) {
      if (myReqId === reqIdRef.current) {
        setError(e.message || t("Không tải được dữ liệu ca làm"));
      }
    } finally {
      if (myReqId === reqIdRef.current) setLoading(false);
    }
  }, [historyMonth, t]);

  useEffect(() => {
    load(false);
  }, [load]);

  // Auto-refresh 30s khi tab visible
  useEffect(() => {
    if (!tabVisible) return;
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, tabVisible]);

  // ---------- Computed ----------

  const stats = useMemo(() => {
    const today = getToday();
    const todayAtts = attendances.filter((a) => a.date === today);
    return {
      total: employees.length,
      working: todayAtts.filter((a) => a.checkIn && !a.checkOut).length,
      late: todayAtts.filter((a) => a.status === "Đi muộn").length,
      absent: Math.max(0, employees.length - todayAtts.length),
    };
  }, [employees, attendances]);

  // Chỉ hiển thị ca APPROVED trong tab "Hôm nay"
  const todayShifts = useMemo(() => {
    const today = getToday();
    return SHIFT_DEFS.map((s) => ({
      ...s,
      employees: shifts.filter(
        (x) =>
          x.date === today &&
          x.shift === s.id &&
          isApproved(x)
      ),
    }));
  }, [shifts]);

  // Đếm ca pending hôm nay (để hiện cảnh báo)
  const pendingTodayCount = useMemo(() => {
    const today = getToday();
    return shifts.filter(
      (s) => s.date === today && isPending(s)
    ).length;
  }, [shifts]);

  // Week days (Mon-Sun) của tuần chứa weekDate
  const weekDays = useMemo(() => {
    const start = new Date(weekDate + "T00:00:00");
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dt = String(d.getDate()).padStart(2, "0");
      days.push(`${y}-${m}-${dt}`);
    }
    return days;
  }, [weekDate]);

  const weekLabel = useMemo(() => {
    if (!weekDays.length) return "";
    const s = new Date(weekDays[0] + "T00:00:00");
    const e = new Date(weekDays[6] + "T00:00:00");
    return (
      s.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) +
      " - " +
      e.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    );
  }, [weekDays]);

  // Nhắc nhở Chủ nhật — update mỗi phút
  const [sundayReminder, setSundayReminder] = useState(null);
  useEffect(() => {
    const check = () => {
      const d = new Date();
      const dayOfWeek = d.getDay();
      const hour = d.getHours();
      if (dayOfWeek !== 0) return setSundayReminder(null);
      if (hour >= 15) return setSundayReminder("urgent");
      if (hour >= 9) return setSundayReminder("warn");
      return setSundayReminder(null);
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Filter shifts theo tuần (this/next/all) + search
  const filteredShifts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const daysUntilMon = day === 0 ? -6 : 1 - day;
    const thisMon = new Date(today);
    thisMon.setDate(today.getDate() + daysUntilMon);
    const thisSun = new Date(thisMon);
    thisSun.setDate(thisMon.getDate() + 6);
    thisSun.setHours(23, 59, 59, 999);
    const nextMon = new Date(thisMon);
    nextMon.setDate(thisMon.getDate() + 7);
    const nextSun = new Date(nextMon);
    nextSun.setDate(nextMon.getDate() + 6);
    nextSun.setHours(23, 59, 59, 999);

    let list = [...shifts];
    if (historyFilter === "week") {
      list = list.filter((s) => {
        const d = new Date(s.date + "T00:00:00");
        return d >= thisMon && d <= thisSun;
      });
    } else if (historyFilter === "nextWeek") {
      list = list.filter((s) => {
        const d = new Date(s.date + "T00:00:00");
        return d >= nextMon && d <= nextSun;
      });
    }
    if (search.trim()) {
      const q = normalizeShift(search);
      list = list.filter((s) => normalizeShift(s.employee_name).includes(q));
    }
    return list;
  }, [shifts, historyFilter, search]);

  // Group shifts theo ngày
  const groupedShifts = useMemo(() => {
    const map = {};
    for (const s of filteredShifts) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        const list = map[date];
        const shiftTypes = [...new Set(list.map((s) => s.shift))];
        const d = new Date(date + "T00:00:00");
        return {
          date,
          // 🔧 FIX #91: dùng DATE_LONG_FORMATTER
          label: DATE_LONG_FORMATTER.format(d),
          // 🔧 FIX #91: dùng WEEKDAY_SHORT_FORMATTER
          weekdayShort: WEEKDAY_SHORT_FORMATTER.format(d),
          dayNum: String(d.getDate()).padStart(2, "0"),
          shifts: list,
          shiftTypes,
        };
      });
  }, [filteredShifts]);

  const uniqueEmployees = useMemo(
    () => new Set(filteredShifts.map((s) => s.employee_id)).size,
    [filteredShifts]
  );

  // ---------- Actions ----------

  const changeWeek = (delta) => {
    const d = new Date(weekDate + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dt = String(d.getDate()).padStart(2, "0");
    setWeekDate(`${y}-${m}-${dt}`);
  };

  const goToThisWeek = () => setWeekDate(getToday());

  // Approve ca pending
  const approveShift = useCallback(
    async (shift) => {
      if (processingId !== null) return;

      setProcessingId(shift.id);
      try {
        await api.shifts.approve(shift.id);
        toast(
          `${t("Đã duyệt")} ${shift.shift} ${t("của")} ${shift.employee_name}`,
          "success"
        );
        await load(true);
      } catch (e) {
        toast(e.message || t("Không duyệt được"), "error");
      } finally {
        setProcessingId(null);
      }
    },
    [load, processingId, t]
  );

  // Reject ca pending (mở ConfirmDialog)
  const rejectShift = useCallback(
    (shift) => {
      if (processingId !== null) return;

      setConfirm({
        title: `${t("Từ chối")} ${shift.shift} ${t("của")} "${shift.employee_name}"?`,
        message:
          `${t("Ca ngày")} ${fmtShiftDate(shift.date)} ${t("sẽ bị xóa khỏi lịch của nhân viên.")} ` +
          t("Hành động này không thể hoàn tác."),
        confirmText: t("Từ chối"),
        cancelText: t("Giữ lại"),
        danger: true,
        onConfirm: async () => {
          setProcessingId(shift.id);
          try {
            await api.shifts.reject(shift.id);
            toast(t("Đã từ chối ca"), "success");
            setConfirm(null);
            await load(true);
          } catch (e) {
            toast(e.message || t("Không từ chối được"), "error");
          } finally {
            setProcessingId(null);
          }
        },
      });
    },
    [load, processingId, t]
  );

  const saveAssignment = async (formData, isEdit) => {
    try {
      if (isEdit) {
        await api.shifts.update(formData.id, {
          date: formData.date,
          shift: formData.shift,
          note: formData.note,
        });
        toast(t("Đã cập nhật ca làm việc"), "success");
      } else {
        const { employeeId, dateShifts, note } = formData;
        let totalCreated = 0;
        let totalSkipped = 0;

        for (const [date, shiftList] of Object.entries(dateShifts)) {
          if (!shiftList?.length) continue;
          const res = await api.shifts.bulk({
            employee_id: employeeId,
            dates: [date],
            shifts: shiftList,
            note,
          });
          totalCreated += res?.created || 0;
          totalSkipped += res?.skipped || 0;
        }

        toast(
          `${t("Đã phân")} ${totalCreated} ${t("ca")}` +
            (totalSkipped
              ? ` (${t("bỏ qua")} ${totalSkipped} ${t("ca trùng")})`
              : ""),
          "success"
        );
      }
      setAssignModal(null);
      load(false);
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    }
  };

  const removeAssignment = (id) => {
    setConfirm({
      title: t("Xóa phân ca này?"),
      message:
        t("Ca làm việc sẽ bị xoá khỏi lịch của nhân viên.") +
        " " +
        t("Bạn có thể phân ca lại bất cứ lúc nào."),
      confirmText: t("Xóa phân ca"),
      cancelText: t("Giữ lại"),
      danger: true,
      onConfirm: async () => {
        try {
          await api.shifts.remove(id);
          toast(t("Đã xóa"), "success");
          setConfirm(null);
          load(false);
        } catch (e) {
          toast(e.message || t("Không xóa được"), "error");
        }
      },
    });
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirm(null);
  };

  const runConfirm = async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmBusy(false);
    }
  };

  const openEdit = (s) => setAssignModal({ ...s, _isEdit: true });
  const openNew = () => setAssignModal({ _isNew: true });

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div>
      {/* ============================================================
          NHẮC NHỞ CHỦ NHẬT
          ============================================================ */}
      {sundayReminder && (
        <div
          style={{
            marginBottom: 16,
            padding: "14px 18px",
            background:
              sundayReminder === "urgent"
                ? "linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(245, 158, 11, 0.15))"
                : "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(38, 52, 213, 0.08))",
            border:
              "2px solid " +
              (sundayReminder === "urgent" ? "#ef4444" : "#f59e0b"),
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: sundayReminder === "urgent" ? "#ef4444" : "#f59e0b",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <CalendarDays size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <b
              style={{
                color: sundayReminder === "urgent" ? "#991b1b" : "#92400e",
                fontSize: 15,
                display: "block",
                marginBottom: 2,
              }}
            >
              {sundayReminder === "urgent"
                ? t("⚠️ Hạn chót xếp ca tuần sau: 15:00 hôm nay!")
                : t("📅 Nhắc nhở xếp ca tuần sau")}
            </b>
            <span
              style={{
                color: sundayReminder === "urgent" ? "#7f1d1d" : "#78350f",
                fontSize: 13,
              }}
            >
              {sundayReminder === "urgent"
                ? t("Vui lòng phân ca cho nhân viên TRƯỚC 15:00 Chủ nhật.")
                : t("Vui lòng xếp ca cho nhân viên trước 15:00 Chủ nhật hàng tuần.")}
            </span>
          </div>
          <button
            onClick={() => setTab("week")}
            style={{
              padding: "10px 16px",
              background: sundayReminder === "urgent" ? "#ef4444" : "#f59e0b",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            {t("Xếp ca ngay")}
          </button>
        </div>
      )}

      {/* ============================================================
          CẢNH BÁO CA PENDING HÔM NAY
          ============================================================ */}
      {pendingTodayCount > 0 && !loading && (
        <div
          style={{
            marginBottom: 16,
            padding: "14px 18px",
            background:
              "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(239, 68, 68, 0.08))",
            border: "2px solid #f59e0b",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "#f59e0b",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          >
            <Bell size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <b
              style={{
                color: "#92400e",
                fontSize: 15,
                display: "block",
                marginBottom: 2,
              }}
            >
              🔔 {t("Có {n} ca chờ duyệt hôm nay", { n: pendingTodayCount })}
            </b>
            <span style={{ color: "#78350f", fontSize: 13 }}>
              {t('Vào tab "Phân ca" để duyệt hoặc từ chối.')}
            </span>
          </div>
          <button
            onClick={() => setTab("assign")}
            style={{
              padding: "10px 16px",
              background: "#f59e0b",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            {t("Xử lý ngay")}
          </button>
        </div>
      )}

      {/* ============================================================
          STATS
          ============================================================ */}
      <div
        className="shifts-stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <ShiftStat
          icon={<Users size={18} />}
          label={t("Tổng nhân viên")}
          value={stats.total}
          color="#2634d5"
        />
        <ShiftStat
          icon={<CheckCircle2 size={18} />}
          label={t("Đang làm việc")}
          value={stats.working}
          color="#18a967"
        />
        <ShiftStat
          icon={<AlertTriangle size={18} />}
          label={t("Đi muộn")}
          value={stats.late}
          color="#f59e0b"
        />
        <ShiftStat
          icon={<UserX size={18} />}
          label={t("Vắng mặt")}
          value={stats.absent}
          color="#ef4444"
        />
      </div>

      {/* ============================================================
          SHIFT_TABS
          ============================================================ */}
      <div
        className="shifts-tabs"
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 20,
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12,
          padding: 8,
          flexWrap: "wrap",
        }}
      >
        {SHIFT_TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            style={{
              padding: "10px 18px",
              background: tab === tabItem.id ? "#2634d5" : "transparent",
              color: tab === tabItem.id ? "#fff" : "var(--text-muted, #475569)",
              border: 0,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === tabItem.id ? 700 : 500,
            }}
          >
            {t(tabItem.label)}
          </button>
        ))}
      </div>

      {/* ============================================================
          LOADING
          ============================================================ */}
      {loading && (
        <>
          <div style={{ marginBottom: 20 }}>
            <SkeletonStats
              count={4}
              columns="repeat(auto-fit, minmax(180px, 1fr))"
            />
          </div>
          <div
            aria-hidden="true"
            style={{
              background: "var(--card-bg, #fff)",
              border: "1px solid var(--border-color, #e7ebf0)",
              borderRadius: 12,
              padding: 8,
              marginBottom: 20,
              display: "flex",
              gap: 6,
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width={90} height={36} radius={8} />
            ))}
          </div>
          <div
            aria-hidden="true"
            style={{
              background: "var(--card-bg, #fff)",
              border: "1px solid var(--border-color, #e7ebf0)",
              borderRadius: 12,
              padding: 20,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: "var(--bg-tertiary, #f8fafc)",
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <Skeleton width="60%" height={16} />
                <Skeleton width="40%" height={11} />
                <Skeleton width="100%" height={40} radius={10} />
                <Skeleton width="100%" height={40} radius={10} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* ============================================================
          ERROR
          ============================================================ */}
      {!loading && error && (
        <div
          style={{
            padding: 30,
            textAlign: "center",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 12,
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
            onClick={() => load(false)}
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

      {/* ============================================================
          TAB: HÔM NAY (chỉ approved)
          ============================================================ */}
      {!loading && !error && tab === "today" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {todayShifts.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.id} style={shiftCardStyle}>
                {/* Header ca */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 14,
                    paddingBottom: 12,
                    borderBottom: "1px solid var(--border-color, #eef2f7)",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: s.color + "20",
                      color: s.color,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <b
                      style={{
                        color: "var(--text-primary, #172033)",
                        fontSize: 14,
                      }}
                    >
                      {t(s.label)}
                    </b>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-light, #8993a3)",
                      }}
                    >
                      {s.time}
                    </div>
                  </div>
                  <span
                    style={{
                      background: s.color + "20",
                      color: s.color,
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {s.employees.length}
                  </span>
                </div>

                {/* Danh sách nhân viên */}
                {s.employees.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: 30,
                      color: "var(--text-light, #8993a3)",
                      fontSize: 12,
                    }}
                  >
                    {t("Chưa phân ca")}
                  </div>
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {s.employees.map((emp) => {
                      const today = getToday();
                      const att = attendances.find(
                        (a) =>
                          String(a.employee_id) === String(emp.employee_id) &&
                          a.date === today
                      );
                      return (
                        <div
                          key={`${emp.id}-${emp.shift}-${emp.date}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: 10,
                            background: "var(--bg-tertiary, #f8fafc)",
                            borderRadius: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              background:
                                "linear-gradient(135deg, #2634d5, #20c779)",
                              color: "#fff",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {(emp.employee_name || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b
                              style={{
                                fontSize: 13,
                                color: "var(--text-primary, #172033)",
                                display: "block",
                              }}
                            >
                              {emp.employee_name}
                            </b>
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--text-light, #8993a3)",
                              }}
                            >
                              {att
                                ? `${t("Vào")} ` +
                                  fmtTime(att.checkIn) +
                                  (att.checkOut
                                    ? ` · ${t("Ra")} ` + fmtTime(att.checkOut)
                                    : "")
                                : t("Chưa chấm công")}
                            </span>
                          </div>
                          {att && <ShiftAttendanceBadge status={att.status} t={t} />}
                          <button
                            onClick={() => openEdit(emp)}
                            title={t("Sửa ca")}
                            aria-label={t("Sửa ca")}
                            style={shiftIconBtnSmall}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => removeAssignment(emp.id)}
                            title={t("Xóa ca")}
                            aria-label={t("Xóa ca")}
                            style={{ ...shiftIconBtnSmall, color: "#ef4444" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* ============================================================
          TAB: THEO TUẦN (chỉ approved)
          ============================================================ */}
      {!loading && !error && tab === "week" && (
        <div style={shiftCardStyle}>
          {/* Toolbar tuần */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <h3
                style={{
                  margin: "0 0 4px",
                  color: "var(--text-primary, #172033)",
                  fontSize: 15,
                }}
              >
                {t("Lịch phân ca tuần")}
              </h3>
              <span
                style={{ fontSize: 12, color: "var(--text-muted, #64748b)" }}
              >
                📅 {weekLabel}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => changeWeek(-1)}
                title={t("Tuần trước")}
                aria-label={t("Tuần trước")}
                style={shiftNavBtn}
              >
                <ChevronLeft size={18} />
              </button>
              <button onClick={goToThisWeek} style={shiftNavBtnWide}>
                <CalendarDays size={14} /> {t("Tuần này")}
              </button>
              <button
                onClick={() => changeWeek(1)}
                title={t("Tuần sau")}
                aria-label={t("Tuần sau")}
                style={shiftNavBtn}
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={openNew}
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  background: "#2634d5",
                  color: "#fff",
                  border: 0,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={14} /> {t("Phân ca")}
              </button>
            </div>
          </div>

          {/* Bảng tuần */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 700,
              }}
            >
              <thead>
                <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                  <th style={{ ...shiftThStyle, minWidth: 150 }}>
                    {t("Nhân viên")}
                  </th>
                  {weekDays.map((d) => {
                    const dayObj = new Date(d + "T00:00:00");
                    return (
                      <th
                        key={d}
                        style={{
                          ...shiftThStyle,
                          textAlign: "center",
                          fontSize: 11,
                          minWidth: 80,
                          padding: 8,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {/* 🔧 FIX #91: dùng WEEKDAY_SHORT_FORMATTER */}
                          {WEEKDAY_SHORT_FORMATTER.format(dayObj)}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
                          {d.slice(8)}/{d.slice(5, 7)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{
                      borderBottom: "1px solid var(--border-color, #eef2f7)",
                    }}
                  >
                    <td style={shiftTdStyle}>
                      <b>{emp.name}</b>
                    </td>
                    {weekDays.map((d) => {
                      // Chỉ hiển thị ca APPROVED
                      const empShifts = shifts.filter(
                        (s) =>
                          String(s.employee_id) === String(emp.id) &&
                          s.date === d &&
                          isApproved(s)
                      );
                      return (
                        <td key={d} style={{ padding: 6, textAlign: "center" }}>
                          {empShifts.length === 0 ? (
                            <span
                              style={{
                                color: "var(--text-light, #cbd5e1)",
                                fontSize: 12,
                              }}
                            >
                              —
                            </span>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                gap: 2,
                                justifyContent: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              {empShifts.map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => openEdit(s)}
                                  title={`${s.shift} — ${t("Bấm để sửa")}`}
                                  aria-label={`${t("Sửa ca")} ${s.shift}`}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 6,
                                    border: 0,
                                    background: shiftColor(s.shift),
                                    color: "#fff",
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  {shiftCode(s.shift)}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!employees.length && (
                  <tr>
                    <td
                      colSpan={weekDays.length + 1}
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "var(--text-light, #8993a3)",
                      }}
                    >
                      {t("Chưa có nhân viên nào")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 16,
              fontSize: 12,
              flexWrap: "wrap",
            }}
          >
            {SHIFT_DEFS.map((s) => (
              <div
                key={s.id}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    background: s.color,
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {shiftCode(s.id)}
                </span>
                <span style={{ color: "var(--text-muted, #64748b)" }}>
                  {t(s.label)}
                </span>
              </div>
            ))}
            <span
              style={{
                marginLeft: "auto",
                color: "var(--text-light, #8993a3)",
                fontStyle: "italic",
              }}
            >
              💡 {t("Bấm vào ô để sửa ca")}
            </span>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB: PHÂN CA (cả pending + approved + nút duyệt)
          ============================================================ */}
      {!loading && !error && tab === "assign" && (
        <div>
          {/* Toolbar */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--card-bg, #fff)",
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 8,
                padding: "9px 12px",
                flex: 1,
                minWidth: 200,
                maxWidth: 400,
              }}
            >
              <Search
                size={16}
                style={{ color: "var(--text-light, #8993a3)" }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Tìm nhân viên...")}
                style={{
                  flex: 1,
                  border: 0,
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary, #172033)",
                  fontSize: 13,
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
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

            {/* Filter tuần */}
            <div
              style={{
                display: "flex",
                gap: 4,
                background: "var(--bg-tertiary, #f5f7fb)",
                padding: 4,
                borderRadius: 8,
              }}
            >
              {[
                { id: "week", label: t("Tuần này") },
                { id: "nextWeek", label: t("Tuần sau") },
                { id: "all", label: t("Tất cả") },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setHistoryFilter(f.id)}
                  type="button"
                  style={{
                    padding: "6px 14px",
                    background:
                      historyFilter === f.id ? "#2634d5" : "transparent",
                    color:
                      historyFilter === f.id
                        ? "#fff"
                        : "var(--text-muted, #475569)",
                    border: 0,
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              onClick={openNew}
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#2634d5",
                color: "#fff",
                padding: "10px 16px",
                border: 0,
                borderRadius: 8,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <Plus size={16} /> {t("Phân ca")}
            </button>
          </div>

          {/* Summary */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <SummaryCard
              label={t("Tổng ca")}
              value={filteredShifts.length}
              color="#2634d5"
            />
            <SummaryCard
              label={t("Chờ duyệt")}
              value={filteredShifts.filter(isPending).length}
              color="#f59e0b"
            />
            <SummaryCard
              label={t("Số ngày")}
              value={groupedShifts.length}
              color="#18a967"
            />
            <SummaryCard
              label={t("Nhân viên")}
              value={uniqueEmployees}
              color="#8b5cf6"
            />
          </div>

          {/* Danh sách ca */}
          {groupedShifts.length === 0 ? (
            <div style={{ ...shiftCardStyle, textAlign: "center", padding: 40 }}>
              <CalendarDays
                size={36}
                style={{
                  opacity: 0.35,
                  marginBottom: 10,
                  color: "var(--text-light, #8993a3)",
                }}
              />
              <div style={{ color: "var(--text-light, #8993a3)", fontSize: 13 }}>
                {search || historyFilter !== "all"
                  ? t("Không có ca nào khớp bộ lọc")
                  : t("Chưa có phân ca nào")}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {groupedShifts.map((group) => (
                <div
                  key={group.date}
                  style={{ ...shiftCardStyle, padding: 0, overflow: "hidden" }}
                >
                  {/* Header ngày */}
                  <div
                    style={{
                      padding: "12px 18px",
                      background: "var(--bg-tertiary, #f5f7fb)",
                      borderBottom: "1px solid var(--border-color, #eef2f7)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          background:
                            "linear-gradient(135deg, #2634d5, #20c779)",
                          color: "#fff",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              opacity: 0.9,
                            }}
                          >
                            {/* 🔧 FIX #91: dùng WEEKDAY_SHORT_FORMATTER đã apply từ groupedShifts */}
                            {group.weekdayShort}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 800 }}>
                            {group.dayNum}
                          </span>
                        </div>
                      </div>
                      <div>
                        <b
                          style={{
                            fontSize: 14,
                            color: "var(--text-primary, #172033)",
                            display: "block",
                          }}
                        >
                          {group.label}
                        </b>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-light, #8993a3)",
                          }}
                        >
                          {group.shifts.length} {t("ca")}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {group.shiftTypes.map((s) => (
                        <span
                          key={s}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 20,
                            fontSize: 10,
                            fontWeight: 700,
                            background: shiftColor(s) + "20",
                            color: shiftColor(s),
                          }}
                        >
                          {t(s)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* List ca trong ngày */}
                  <div>
                    {group.shifts.map((s, i) => {
                      const isPendingShift = isPending(s);
                      const isProcessing = processingId === s.id;

                      return (
                        <div
                          key={s.id}
                          style={{
                            padding: "12px 18px",
                            borderBottom:
                              i < group.shifts.length - 1
                                ? "1px solid var(--border-color, #f5f7fb)"
                                : "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                            background: isPendingShift
                              ? "rgba(245, 158, 11, 0.04)"
                              : "transparent",
                            opacity: isProcessing ? 0.6 : 1,
                          }}
                        >
                          {/* Avatar + name */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              minWidth: 0,
                              flex: 1,
                            }}
                          >
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                background:
                                  "linear-gradient(135deg, #2634d5, #20c779)",
                                color: "#fff",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {(s.employee_name || "?")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                <b
                                  style={{
                                    fontSize: 13,
                                    color: "var(--text-primary, #172033)",
                                  }}
                                >
                                  {s.employee_name}
                                </b>

                                {/* Badge status */}
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 10,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: isPendingShift
                                      ? "#fef3c7"
                                      : "#d1fae5",
                                    color: isPendingShift
                                      ? "#92400e"
                                      : "#065f46",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {isPendingShift
                                    ? t("Chờ duyệt")
                                    : t("Đã duyệt")}
                                </span>

                                {/* Badge shift */}
                                <span
                                  style={{
                                    padding: "2px 10px",
                                    borderRadius: 20,
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    background: shiftColor(s.shift) + "20",
                                    color: shiftColor(s.shift),
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {t(s.shift)}
                                </span>
                              </div>

                              {s.note && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "var(--text-light, #8993a3)",
                                    display: "block",
                                    marginTop: 2,
                                  }}
                                >
                                  {s.note}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div
                            style={{ display: "flex", gap: 6, flexShrink: 0 }}
                          >
                            {/* Nút DUYỆT cho ca pending */}
                            {isPendingShift && (
                              <>
                                <button
                                  onClick={() => approveShift(s)}
                                  disabled={processingId !== null}
                                  title={t("Duyệt ca")}
                                  aria-label={t("Duyệt ca")}
                                  type="button"
                                  style={{
                                    padding: "7px 12px",
                                    background:
                                      processingId !== null
                                        ? "#94a3b8"
                                        : "#18a967",
                                    color: "#fff",
                                    border: 0,
                                    borderRadius: 7,
                                    cursor:
                                      processingId !== null
                                        ? "not-allowed"
                                        : "pointer",
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {isProcessing ? (
                                    <>
                                      <Loader2
                                        size={12}
                                        style={{
                                          animation:
                                            "spin 1s linear infinite",
                                        }}
                                      />
                                      {t("Đang xử lý...")}
                                    </>
                                  ) : (
                                    <>
                                      <Check size={12} /> {t("Duyệt")}
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={() => rejectShift(s)}
                                  disabled={processingId !== null}
                                  title={t("Từ chối")}
                                  aria-label={t("Từ chối")}
                                  type="button"
                                  style={{
                                    padding: "7px 12px",
                                    background: "var(--card-bg, #fff)",
                                    color: "#ef4444",
                                    border: "1px solid #ef4444",
                                    borderRadius: 7,
                                    cursor:
                                      processingId !== null
                                        ? "not-allowed"
                                        : "pointer",
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    opacity:
                                      processingId !== null ? 0.5 : 1,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <X size={12} /> {t("Từ chối")}
                                </button>
                              </>
                            )}

                            {/* Nút Sửa / Xóa */}
                            <button
                              onClick={() => openEdit(s)}
                              title={t("Sửa")}
                              aria-label={t("Sửa")}
                              type="button"
                              style={shiftIconBtnSmall}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => removeAssignment(s.id)}
                              title={t("Xóa")}
                              aria-label={t("Xóa")}
                              type="button"
                              style={{ ...shiftIconBtnSmall, color: "#ef4444" }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          TAB: LỊCH SỬ
          ============================================================ */}
      {!loading && !error && tab === "history" && (
        <div style={shiftCardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <h3
              style={{
                margin: 0,
                color: "var(--text-primary, #172033)",
                fontSize: 15,
              }}
            >
              {t("Lịch sử chấm công")}
            </h3>
            <input
              type="month"
              value={historyMonth}
              onChange={(e) => setHistoryMonth(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 8,
                outline: "none",
                background: "var(--bg-secondary, #fff)",
                color: "var(--text-primary, #172033)",
                fontSize: 13,
              }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                  <th style={shiftThStyle}>{t("Ngày")}</th>
                  <th style={shiftThStyle}>{t("Nhân viên")}</th>
                  <th style={shiftThStyle}>{t("Ca")}</th>
                  <th style={shiftThStyle}>{t("Check-in")}</th>
                  <th style={shiftThStyle}>{t("Check-out")}</th>
                  <th style={shiftThStyle}>{t("Giờ làm")}</th>
                  <th style={shiftThStyle}>{t("Trạng thái")}</th>
                </tr>
              </thead>
              <tbody>
                {attendances.length === 0 ? (
                  <tr>
                    <td
                      colSpan="7"
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "var(--text-light, #8993a3)",
                      }}
                    >
                      {t("Chưa có dữ liệu chấm công")}
                    </td>
                  </tr>
                ) : (
                  attendances.map((a) => (
                    <tr
                      key={a.id}
                      style={{
                        borderBottom: "1px solid var(--border-color, #eef2f7)",
                      }}
                    >
                      <td style={shiftTdStyle}>
                        <b>{fmtShiftDate(a.date)}</b>
                      </td>
                      <td style={shiftTdStyle}>{a.employee_name}</td>
                      <td style={shiftTdStyle}>
                        {a.shift ? (
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 700,
                              background: shiftColor(a.shift) + "20",
                              color: shiftColor(a.shift),
                            }}
                          >
                            {t(a.shift)}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "var(--text-light, #8993a3)",
                              fontSize: 12,
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td style={shiftTdStyle}>{fmtTime(a.checkIn)}</td>
                      <td
                        style={{
                          ...shiftTdStyle,
                          color: "var(--text-muted, #64748b)",
                        }}
                      >
                        {fmtTime(a.checkOut)}
                      </td>
                      <td style={shiftTdStyle}>
                        <b>{a.hours ? a.hours + "h" : "—"}</b>
                      </td>
                      <td style={shiftTdStyle}>
                        <ShiftAttendanceBadge status={a.status} t={t} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
          ASSIGN MODAL
          ============================================================ */}
      {assignModal && (
        <ShiftAssignModal
          modal={assignModal}
          employees={employees}
          weekDays={weekDays}
          shifts={shifts}
          onSave={saveAssignment}
          onClose={() => setAssignModal(null)}
          t={t}
        />
      )}

      {/* Confirm dialog */}
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

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: ShiftAssignModal
// ============================================================

function ShiftAssignModal({
  modal,
  employees,
  weekDays,
  shifts = [],
  onSave,
  onClose,
  t,
}) {
  const isEdit = modal._isEdit === true;

  const [saving, setSaving] = useState(false);

  // Tính ngày tuần sau — memo 1 lần
  const displayWeekDays = useMemo(() => {
    if (isEdit) return weekDays;
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
  }, [isEdit, weekDays]);

  const [dateShifts, setDateShifts] = useState(() => {
    if (isEdit) return { [modal.date]: [modal.shift] };
    return {};
  });
  const [activeDate, setActiveDate] = useState(isEdit ? modal.date : null);
  const [employeeId, setEmployeeId] = useState(modal.employee_id || "");
  const [note, setNote] = useState(modal.note || "");

  // Ngày đã có ca (để đánh dấu)
  const assignedDays = useMemo(() => {
    if (!employeeId || isEdit) return new Set();
    const empId = String(employeeId);
    return new Set(
      shifts
        .filter(
          (s) =>
            String(s.employee_id) === empId &&
            displayWeekDays.includes(s.date)
        )
        .map((s) => s.date)
    );
  }, [shifts, employeeId, displayWeekDays, isEdit]);

  const currentShifts = activeDate ? dateShifts[activeDate] || [] : [];

  const isDayAssigned = (d) =>
    (dateShifts[d] && dateShifts[d].length > 0) || assignedDays.has(d);

  // ESC đóng modal
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, saving]);

  const toggleShift = (shiftId) => {
    if (isEdit) {
      setDateShifts({ [activeDate]: [shiftId] });
      return;
    }
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
    displayWeekDays.forEach((d) => {
      next[d] = [...tpl];
    });
    setDateShifts(next);
  };

  const clearAll = () => {
    setDateShifts({});
    setActiveDate(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!employeeId) {
      return toast(t("Vui lòng chọn nhân viên"), "error");
    }
    const dates = Object.keys(dateShifts).filter(
      (d) => dateShifts[d]?.length > 0
    );
    if (!dates.length) {
      return toast(t("Vui lòng chọn ít nhất 1 ngày và 1 ca"), "error");
    }

    setSaving(true);
    try {
      if (isEdit) {
        await onSave(
          {
            id: modal.id,
            date: dates[0],
            shift: dateShifts[dates[0]][0],
            note,
          },
          true
        );
      } else {
        await onSave(
          { employeeId: Number(employeeId), dateShifts, note },
          false
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const totalAssignments = Object.values(dateShifts).reduce(
    (s, arr) => s + (arr?.length || 0),
    0
  );
  const totalDays = Object.keys(dateShifts).filter(
    (d) => dateShifts[d]?.length > 0
  ).length;

  const weekLabel = displayWeekDays.length
    ? new Date(displayWeekDays[0] + "T00:00:00").toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      }) +
      " - " +
      new Date(displayWeekDays[6] + "T00:00:00").toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      })
    : "";

  return (
    <div
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: SHIFT_MODAL_Z,
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
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
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
              color: "var(--text-primary, #172033)",
              fontSize: 16,
            }}
          >
            {isEdit ? t("Sửa ca làm việc") : t("Phân ca làm việc")}
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label={t("Đóng")}
            style={{
              background: "transparent",
              border: 0,
              cursor: saving ? "not-allowed" : "pointer",
              color: "var(--text-light, #8993a3)",
              padding: 4,
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {!isEdit && (
          <div
            style={{
              marginBottom: 14,
              padding: "8px 12px",
              background: "rgba(38, 52, 213, 0.08)",
              border: "1px solid rgba(38, 52, 213, 0.25)",
              borderRadius: 8,
              fontSize: 12,
              color: "#2634d5",
              fontWeight: 600,
            }}
          >
            {t("Đang phân ca cho tuần sau")} ({weekLabel})
          </div>
        )}

        {isEdit && (
          <div
            style={{
              marginBottom: 14,
              padding: "8px 12px",
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: 8,
              fontSize: 12,
              color: "#92400e",
              fontWeight: 600,
            }}
          >
            ✏️ {t("Đang sửa ca ngày")} {modal.date} — {t("chỉ đổi được ca, không đổi nhân viên")}
          </div>
        )}

        <form onSubmit={submit} autoComplete="off">
          {/* Nhân viên */}
          <label style={shiftLabelStyle}>{t("Nhân viên")} *</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required={!isEdit}
            disabled={isEdit || saving}
            style={shiftInputStyle}
          >
            <option value="">-- {t("Chọn nhân viên")} --</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          {/* Chọn ngày */}
          {!isEdit && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
                marginBottom: 8,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <label style={{ ...shiftLabelStyle, margin: 0 }}>{t("Ngày")} *</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={applyToWholeWeek}
                  disabled={saving}
                  style={{
                    padding: "4px 10px",
                    background: "rgba(38, 52, 213, 0.1)",
                    color: "#2634d5",
                    border: "1px solid rgba(38, 52, 213, 0.3)",
                    borderRadius: 6,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {t("Áp dụng cả tuần")}
                </button>
                {totalAssignments > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={saving}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: 6,
                      cursor: saving ? "not-allowed" : "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {t("Xóa hết")}
                  </button>
                )}
              </div>
            </div>
          )}
          {isEdit && <label style={shiftLabelStyle}>{t("Ngày")} *</label>}

          {/* Grid ngày */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 4,
              marginBottom: 16,
            }}
          >
            {displayWeekDays.map((d) => {
              const isActive = activeDate === d;
              const isAssigned = isDayAssigned(d);
              const dayObj = new Date(d + "T00:00:00");
              // 🔧 FIX #91: dùng WEEKDAY_SHORT_FORMATTER
              const dayLabel = WEEKDAY_SHORT_FORMATTER.format(dayObj);

              let bg = "var(--bg-tertiary, #f5f7fb)";
              let color = "var(--text-primary, #172033)";
              let border = "1px solid var(--border-color, #e5e9ef)";

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
                  onClick={() => !isEdit && setActiveDate(d)}
                  disabled={saving || isEdit}
                  title={
                    isAssigned
                      ? t("Đã có ca — bấm để chọn thêm ca")
                      : t("Bấm để chọn ngày")
                  }
                  style={{
                    padding: "8px 4px",
                    borderRadius: 8,
                    background: bg,
                    color: color,
                    border: border,
                    cursor: saving || isEdit ? "not-allowed" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    position: "relative",
                    transition: "all 0.15s",
                    opacity: isEdit && !isActive ? 0.5 : 1,
                  }}
                >
                  {isAssigned && (
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: isActive ? "#fff" : "#18a967",
                        color: isActive ? "#18a967" : "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 9,
                        fontWeight: 800,
                        lineHeight: 1,
                      }}
                    >
                      ✓
                    </span>
                  )}
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

          {/* Chọn ca */}
          <label style={shiftLabelStyle}>
            {t("Ca làm")} *{" "}
            {!isEdit && activeDate && (
              <span
                style={{ fontWeight: 400, color: "var(--text-light, #94a3b8)" }}
              >
                ({t("ngày")} {activeDate.slice(8)}/{activeDate.slice(5, 7)})
              </span>
            )}
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {SHIFT_DEFS.map((s) => {
              const Icon = s.icon;
              const sel = currentShifts.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleShift(s.id)}
                  disabled={saving}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 10,
                    background: sel
                      ? s.color + "20"
                      : "var(--card-bg, #fff)",
                    border: sel
                      ? "2px solid " + s.color
                      : "2px solid var(--border-color, #e5e9ef)",
                    cursor: saving ? "not-allowed" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon
                    size={18}
                    style={{
                      color: sel ? s.color : "var(--text-light, #94a3b8)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: sel ? s.color : "var(--text-muted, #475569)",
                    }}
                  >
                    {t(s.label)}
                  </span>
                  <span
                    style={{ fontSize: 9, color: "var(--text-light, #94a3b8)" }}
                  >
                    {s.time}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Ghi chú */}
          <label style={shiftLabelStyle}>{t("Ghi chú")}</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("VD: Bận việc riêng...")}
            disabled={saving}
            style={shiftInputStyle}
          />

          {/* Tổng kết */}
          {!isEdit && totalAssignments > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(24, 169, 103, 0.1)",
                border: "1px solid rgba(24, 169, 103, 0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "#18a967",
                fontWeight: 600,
              }}
            >
              {t("Đã chọn")} <b>{totalAssignments}</b> {t("ca trên")}{" "}
              <b>{totalDays}</b> {t("ngày")}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                flex: 1,
                padding: 12,
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 8,
                background: "var(--card-bg, #fff)",
                cursor: saving ? "not-allowed" : "pointer",
                color: "var(--text-primary, #172033)",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {t("Hủy")}
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: 12,
                background: saving ? "#94a3b8" : "#2634d5",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                fontSize: 13,
              }}
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
                  <Save size={14} />{" "}
                  {isEdit ? t("Lưu thay đổi") : t("Phân ca")}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// SMALL SUB-COMPONENTS
// ============================================================

function ShiftAttendanceBadge({ status, t }) {
  if (!status) return null;
  const map = {
    "Đúng giờ": { bg: "#d1fae5", fg: "#065f46" },
    "Đi muộn": { bg: "#fef3c7", fg: "#92400e" },
    "Về sớm": { bg: "#dbeafe", fg: "#1e40af" },
    "Đi muộn · Về sớm": { bg: "#fee2e2", fg: "#991b1b" },
  };
  const c = map[status] || { bg: "#e2e8f0", fg: "#475569" };
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 700,
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
      }}
    >
      {t(status)}
    </span>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--text-light, #8993a3)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function ShiftStat({ icon, label, value, color }) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        padding: 18,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: color + "18",
          color,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <span style={{ fontSize: 12, color: "var(--text-light, #8993a3)" }}>
          {label}
        </span>
        <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLE CONSTANTS
// ============================================================

const shiftCardStyle = {
  background: "var(--card-bg, #fff)",
  border: "1px solid var(--border-color, #e7ebf0)",
  borderRadius: 12,
  padding: 20,
};

const shiftThStyle = {
  padding: 11,
  textAlign: "left",
  fontSize: 12,
  color: "var(--text-muted, #64748b)",
  fontWeight: 600,
};

const shiftTdStyle = {
  padding: 11,
  fontSize: 13,
  color: "var(--text-primary, #172033)",
};

const shiftLabelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  marginTop: 12,
  color: "var(--text-muted, #475569)",
};

const shiftInputStyle = {
  width: "100%",
  padding: 10,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  boxSizing: "border-box",
};

const shiftIconBtnSmall = {
  padding: 6,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 6,
  background: "var(--card-bg, #fff)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  color: "var(--text-primary, #172033)",
  width: 30,
  height: 30,
  flexShrink: 0,
};

const shiftNavBtn = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: "1px solid var(--border-color, #e5e9ef)",
  background: "var(--card-bg, #fff)",
  color: "var(--text-primary, #172033)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};

const shiftNavBtnWide = {
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid var(--border-color, #e5e9ef)",
  background: "var(--card-bg, #fff)",
  color: "var(--text-primary, #172033)",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

// ============================================================
// WRAPPER: OwnerEmployees — gộp Nhân viên + Ca làm & chấm công
// ============================================================

export default function OwnerEmployees() {
  const { t } = useI18n();
  const [tab, setTab] = useState("employees");

  return (
    <div>
      <div
        style={{
          marginBottom: 20,
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12,
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <label
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-muted, #475569)",
          }}
        >
          {t("Mục:")}
        </label>
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          style={{
            flex: 1,
            maxWidth: 400,
            padding: "10px 14px",
            border: "1px solid var(--border-color, #e5e9ef)",
            borderRadius: 8,
            background: "var(--bg-secondary, #fff)",
            color: "var(--text-primary, #172033)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="employees">{t("Nhân viên")}</option>
          <option value="shifts">{t("Ca làm & chấm công")}</option>
        </select>
      </div>

      {tab === "employees" && <OwnerEmployeesInner />}
      {tab === "shifts" && <OwnerShiftsInner />}
    </div>
  );
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