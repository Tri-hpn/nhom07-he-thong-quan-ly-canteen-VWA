// ============================================================
// OWNEREMPLOYEES.JSX — Quản lý nhân viên (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// 🔧 FIX #89: t() truyền vars thay vì .replace("{password}", ...) thủ công
// ============================================================

import { SkeletonTable } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus, Search, Pencil, Trash2, KeyRound, Eye, EyeOff, X, Save, User as UserIcon, Mail, Phone, Lock, Shield, Loader2, AlertCircle, Users,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useI18n } from "../../hooks/useI18n";

// ============================================================
// CONSTANTS
// ============================================================

const EMPLOYEE_GRADIENT = "linear-gradient(135deg, #2634d5, #20c779)";
const DEFAULT_PASSWORD = "123456";
const MODAL_Z = 2147483600;

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

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerEmployees() {
  const { t } = useI18n();

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const [detailModal, setDetailModal] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const [addModal, setAddModal] = useState(false);
  const [adding, setAdding] = useState(false);

  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // allUsers chỉ load 1 lần, không phụ thuộc `list`
  const [allUsers, setAllUsers] = useState([]);

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

  // loadAllUsers không phụ thuộc vào `list` → chỉ gọi 1 lần khi mount
  const loadAllUsers = useCallback(async () => {
    try {
      const data = await api.users.list(); // không filter → lấy hết
      setAllUsers(Array.isArray(data) ? data : []);
    } catch {
      // Fallback: dùng list employee
      setAllUsers([]);
    }
  }, []);

  useEffect(() => {
    load();
    loadAllUsers();
  }, [load, loadAllUsers]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (addModal && !adding) setAddModal(false);
      else if (detailModal && !saving) closeDetail();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addModal, detailModal, adding, saving]);

  const existingEmails = useMemo(() => {
    const set = new Set();
    for (const u of allUsers) {
      if (u.email) set.add(u.email.toLowerCase().trim());
    }
    return set;
  }, [allUsers]);

  const filtered = useMemo(() => {
    if (!q.trim()) return list;
    const s = normalize(q);
    return list.filter(
      (e) =>
        normalize(e.name).includes(s) ||
        normalize(e.email).includes(s)
    );
  }, [list, q]);

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
      loadAllUsers(); // Refresh email set
    } catch (e) {
      toast(e.message || t("Không thêm được"), "error");
    } finally {
      setAdding(false);
    }
  };

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
        // Giai đoạn 2 — backend tự bật cờ must_change_password khi
        // admin đặt lại mật khẩu (xem PUT /api/users/:id)
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

  const getInitials = (name) => (name || "?").slice(0, 2).toUpperCase();

  return (
    <>
      <div>
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
            }}
          >
            <Plus size={16} /> {t("Thêm nhân viên")}
          </button>
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
              columns={6}
              rows={5}
              headers={[
                t("ID"),
                t("Họ tên"),
                t("Email"),
                t("SĐT"),
                t("Trạng thái"),
                t("Thao tác"),
              ]}
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

          {!loading && !error && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                    <th style={thStyle}>{t("ID")}</th>
                    <th style={thStyle}>{t("Họ tên")}</th>
                    <th style={thStyle}>{t("Email")}</th>
                    <th style={thStyle}>{t("SĐT")}</th>
                    <th style={thStyle}>{t("Trạng thái")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      {t("Thao tác")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp) => (
                    <tr
                      key={emp.id}
                      style={{
                        borderBottom: "1px solid var(--border-color, #eef2f7)",
                      }}
                    >
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "var(--text-muted, #64748b)",
                          }}
                        >
                          NV{emp.id}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
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
                            {getInitials(emp.name)}
                          </div>
                          <b>{emp.name}</b>
                        </div>
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          color: "var(--text-muted, #64748b)",
                        }}
                      >
                        {emp.email}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          color: "var(--text-muted, #64748b)",
                        }}
                      >
                        {emp.phone || "—"}
                      </td>

                      <td style={tdStyle}>
                        <StatusBadge
                          status={emp.status || "Hoạt động"}
                          t={t}
                        />
                      </td>

                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            justifyContent: "flex-end",
                          }}
                        >
                          <IconButton
                            onClick={() => openDetail(emp, "view")}
                            title={t("Xem chi tiết")}
                          >
                            <Eye size={15} />
                          </IconButton>
                          <IconButton
                            onClick={() => openDetail(emp, "edit")}
                            title={t("Sửa")}
                          >
                            <Pencil size={15} />
                          </IconButton>
                          <IconButton
                            onClick={() => resetPassword(emp)}
                            title={t("Reset mật khẩu")}
                            color="#f59e0b"
                          >
                            <KeyRound size={15} />
                          </IconButton>
                          <IconButton
                            onClick={() => remove(emp)}
                            title={t("Xóa")}
                            color="#ef4444"
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!filtered.length && (
                    <tr>
                      <td
                        colSpan="6"
                        style={{
                          textAlign: "center",
                          padding: 40,
                          color: "var(--text-light, #8993a3)",
                        }}
                      >
                        <Users
                          size={36}
                          style={{ opacity: 0.35, marginBottom: 10 }}
                        />
                        <div>
                          {q
                            ? `${t("Không có nhân viên nào khớp")} "${q}"`
                            : t("Chưa có nhân viên nào")}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
                {/* 🔧 FIX #89: truyền vars vào t() thay vì .replace("{password}", ...) thủ công */}
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

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
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

function IconButton({
  children,
  onClick,
  title,
  color = "var(--text-primary, #172033)",
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        padding: 6,
        border: "1px solid var(--border-color, #e5e9ef)",
        borderRadius: 6,
        background: "var(--card-bg, #fff)",
        cursor: "pointer",
        color,
        display: "grid",
        placeItems: "center",
        width: 30,
        height: 30,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
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
// STYLE CONSTANTS
// ============================================================

const thStyle = {
  padding: 11,
  textAlign: "left",
  fontSize: 12,
  color: "var(--text-muted, #64748b)",
  fontWeight: 600,
};

const tdStyle = {
  padding: 11,
  fontSize: 13,
  color: "var(--text-primary, #172033)",
};

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