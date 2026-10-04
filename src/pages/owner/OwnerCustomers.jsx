// ============================================================
// OWNERCUSTOMERS.JSX — Quản lý khách hàng (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ============================================================
import { SkeletonTable } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Search, Lock, Unlock, Trash2, Eye, Pencil, Mail, Phone, Ticket, Gift, Ban, X, Copy, Check, Users, Globe, User as UserIcon, Loader2, AlertCircle, Edit,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";

// ============================================================
// HELPERS
// ============================================================

/**
 * ✅ #12.1: Bỏ dấu tiếng Việt + lowercase để search chính xác.
 */
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

/**
 * ✅ #12.2: Validate SĐT Việt Nam (10-11 số, bắt đầu bằng 0).
 * Return: null nếu hợp lệ/rỗng, string lỗi nếu không hợp lệ.
 */
function validatePhone(phone, t) {
  const p = String(phone || "").trim();
  if (!p) return null; // cho phép rỗng
  if (!/^0\d{9,10}$/.test(p)) {
    return t("SĐT phải bắt đầu bằng 0 và có 10-11 chữ số");
  }
  return null;
}

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

  // ✅ #12.3: Filter status options
  const STATUS_FILTERS = useMemo(
    () => [
      { id: "all",    label: t("Tất cả") },
      { id: "active", label: t("Hoạt động") },
      { id: "locked", label: t("Bị khóa") },
    ],
    [t]
  );

  // ---------- List state ----------
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

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

  // ---------- Confirm dialog ----------
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ---------- Load ----------

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

  useEffect(() => {
    load();
  }, [load]);

  // ESC đóng tất cả modals
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (editModal && !saving) setEditModal(null);
      else if (voucherModal) setVoucherModal(null);
      else if (detail) setDetail(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editModal, voucherModal, detail, saving]);

  // ---------- ✅ #12.3 + #12.4: Stats theo status ----------
  const statusCounts = useMemo(() => {
    const active = list.filter(
      (c) => (c.status || "Hoạt động") === "Hoạt động"
    ).length;
    const locked = list.length - active;
    return {
      all: list.length,
      active,
      locked,
    };
  }, [list]);

  // ---------- Filter + Search (memo) ✅ #12.1 ----------

  const filtered = useMemo(() => {
    let result = list;

    // Filter status
    if (filterStatus === "active") {
      result = result.filter(
        (c) => (c.status || "Hoạt động") === "Hoạt động"
      );
    } else if (filterStatus === "locked") {
      result = result.filter((c) => c.status === "Bị khóa");
    }

    // Search không dấu
    if (q.trim()) {
      const s = normalize(q);
      result = result.filter(
        (c) =>
          normalize(c.name).includes(s) ||
          normalize(c.email).includes(s) ||
          (c.phone || "").includes(q.trim())
      );
    }

    return result;
  }, [list, q, filterStatus]);

  const hasFilter = q.trim() !== "" || filterStatus !== "all";

  const clearFilters = () => {
    setQ("");
    setFilterStatus("all");
  };

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

  // ---------- Handlers ----------

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
    if (saving) return;

    const f = new FormData(e.currentTarget);
    const name = f.get("name")?.trim();
    const phone = f.get("phone")?.trim();
    const status = f.get("status");

    // Validate name
    if (!name) {
      return setEditError(t("Vui lòng nhập họ tên"));
    }

    // ✅ #12.2: Validate SĐT VN
    const phoneErr = validatePhone(phone, t);
    if (phoneErr) {
      return setEditError(phoneErr);
    }

    setEditError("");
    setSaving(true);
    try {
      await api.users.update(editModal.id, { name, phone, status });
      toast(t("Đã cập nhật thông tin khách hàng"), "success");
      setEditModal(null);
      load();
    } catch (e) {
      setEditError(e.message || t("Không lưu được"));
    } finally {
      setSaving(false);
    }
  };

  // ---------- Voucher handlers ----------

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

  // ---------- Utils ----------

  const getInitials = (name) =>
    (name || "?").slice(0, 2).toUpperCase();

  const fmtNumber = (n) =>
    typeof n === "number" ? n.toLocaleString("vi-VN") : n ?? "—";

  const fmtMoney = (n) => fmtNumber(n) + "đ";

  const getVoucherSource = (v) => {
    if (v.claimed_from)
      return { label: t("Nhận từ ƯĐ"), color: "#8b5cf6", bg: "#ede9fe", icon: Globe };
    if (v.points_used > 0)
      return { label: t("Đổi điểm"), color: "#f59e0b", bg: "#fef3c7", icon: Gift };
    return { label: t("Admin tặng"), color: "#2634d5", bg: "#eef2ff", icon: UserIcon };
  };

  const visibleVouchers = useMemo(
    () =>
      vouchers.filter((v) => (voucherTab === "active" ? !v.used : v.used)),
    [vouchers, voucherTab]
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <>
      <div>
        {/* ============================================================
            TOOLBAR — Search + Filter status
            ============================================================ */}
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
              maxWidth: 400,
            }}
          >
            <Search size={18} style={{ color: "var(--text-light, #8993a3)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Tìm theo tên, email, SĐT...")}
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

          {/* ✅ #12.3: Status filter chips */}
          <div
            style={{
              display: "inline-flex",
              gap: 3,
              background: "var(--bg-tertiary, #f5f7fb)",
              padding: 4,
              borderRadius: 10,
            }}
          >
            {STATUS_FILTERS.map((f) => {
              const active = filterStatus === f.id;
              const count = statusCounts[f.id] || 0;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilterStatus(f.id)}
                  style={{
                    padding: "7px 12px",
                    background: active ? "#2634d5" : "transparent",
                    color: active ? "#fff" : "var(--text-muted, #475569)",
                    border: 0,
                    borderRadius: 7,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.label}
                  <span
                    style={{
                      background: active
                        ? "rgba(255,255,255,0.3)"
                        : "var(--card-bg, #e2e8f0)",
                      color: active ? "#fff" : "var(--text-muted, #64748b)",
                      minWidth: 18,
                      height: 16,
                      padding: "0 5px",
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 800,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Clear filter */}
          {hasFilter && (
            <button
              onClick={clearFilters}
              style={{
                padding: "9px 14px",
                background: "transparent",
                border: "1px solid #ef4444",
                color: "#ef4444",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <X size={13} /> {t("Xoá lọc")}
            </button>
          )}

          {/* Counter */}
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted, #64748b)",
              marginLeft: "auto",
            }}
          >
            <b style={{ color: "var(--text-primary, #172033)" }}>
              {filtered.length}
            </b>{" "}
            {t("khách hàng")}
          </div>
        </div>

        {/* ============================================================
            TABLE
            ============================================================ */}
        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          {/* Loading — skeleton table */}
          {loading && (
            <SkeletonTable
              columns={6}
              rows={5}
              headers={[
                t("ID"),
                t("Khách hàng"),
                t("Liên hệ"),
                t("Điểm"),
                t("Trạng thái"),
                t("Thao tác"),
              ]}
            />
          )}

          {/* Error */}
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

          {/* Table */}
          {!loading && !error && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                    <th style={thStyle}>{t("ID")}</th>
                    <th style={thStyle}>{t("Khách hàng")}</th>
                    <th style={thStyle}>{t("Liên hệ")}</th>
                    <th style={thStyle}>{t("Điểm")}</th>
                    <th style={thStyle}>{t("Trạng thái")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tác")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
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
                          KH{c.id}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: CUSTOMER_GRADIENT,
                              color: "#fff",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 700,
                              fontSize: 12,
                              flexShrink: 0,
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
                        <b style={{ color: "#f59e0b" }}>
                          {fmtNumber(c.points || 0)} {t("điểm")}
                        </b>
                      </td>

                      <td style={tdStyle}>
                        <StatusBadge status={c.status || "Hoạt động"} t={t} />
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
                            onClick={() => loadVouchers(c)}
                            title={t("Ví voucher")}
                            color="#8b5cf6"
                            bg="#f5f3ff"
                          >
                            <Ticket size={15} />
                          </IconButton>
                          <IconButton onClick={() => setDetail(c)} title={t("Xem chi tiết")}>
                            <Eye size={15} />
                          </IconButton>
                          <IconButton onClick={() => openEdit(c)} title={t("Sửa")}>
                            <Edit size={15} />
                          </IconButton>
                          <IconButton
                            onClick={() => toggleLock(c)}
                            title={
                              c.status === "Hoạt động"
                                ? t("Khóa tài khoản")
                                : t("Mở khóa")
                            }
                            color={c.status === "Hoạt động" ? "#ef4444" : "#18a967"}
                          >
                            {c.status === "Hoạt động" ? (
                              <Lock size={15} />
                            ) : (
                              <Unlock size={15} />
                            )}
                          </IconButton>
                          <IconButton
                            onClick={() => remove(c)}
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

        {/* ============================================================
            MODAL: CHI TIẾT KHÁCH HÀNG
            ============================================================ */}
        {detail && (
          <Modal onClose={() => setDetail(null)} maxWidth={480}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: "50%",
                  background: CUSTOMER_GRADIENT,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  fontSize: 24,
                  margin: "0 auto 12px",
                }}
              >
                {getInitials(detail.name)}
              </div>
              <h3 style={{ margin: "0 0 6px", color: "var(--text-primary, #172033)" }}>
                {detail.name}
              </h3>
              <p style={{ color: "var(--text-muted, #64748b)", margin: 0, fontSize: 13 }}>
                {detail.email}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginTop: 20,
                  textAlign: "left",
                }}
              >
                <InfoBlock label={t("Mã KH")} value={`KH${detail.id}`} />
                <InfoBlock label={t("SĐT")} value={detail.phone || "—"} />
                <InfoBlock
                  label={t("Điểm tích lũy")}
                  value={fmtNumber(detail.points || 0)}
                  highlight="#f59e0b"
                />
                <InfoBlock label={t("Trạng thái")} value={detail.status || t("Hoạt động")} />
              </div>

              <button
                onClick={() => setDetail(null)}
                style={btnPrimaryStyle}
              >
                {t("Đóng")}
              </button>
            </div>
          </Modal>
        )}

        {/* ============================================================
            MODAL: SỬA KHÁCH HÀNG
            ============================================================ */}
        {editModal && (
          <Modal onClose={() => !saving && setEditModal(null)} maxWidth={480}>
            <h3
              style={{
                marginTop: 0,
                marginBottom: 20,
                color: "var(--text-primary, #172033)",
              }}
            >
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
                style={{
                  ...modalInputStyle,
                  borderColor: editError ? "#ef4444" : undefined,
                }}
                onChange={() => editError && setEditError("")}
              />
              {editError && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: 12,
                    marginTop: -10,
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <AlertCircle size={12} /> {editError}
                </div>
              )}

              <label style={modalLabelStyle}>{t("Trạng thái")}</label>
              <select
                name="status"
                defaultValue={editModal.status || "Hoạt động"}
                style={modalInputStyle}
              >
                <option>{t("Hoạt động")}</option>
                <option>{t("Bị khóa")}</option>
              </select>

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setEditModal(null)}
                  disabled={saving}
                  style={btnCancelStyle}
                >
                  {t("Hủy")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={btnPrimaryStyleLoading(saving)}
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
                    t("Lưu thay đổi")
                  )}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* ============================================================
            MODAL: VÍ VOUCHER
            ============================================================ */}
        {voucherModal && (
          <Modal onClose={() => setVoucherModal(null)} maxWidth={620}>
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: "50%",
                    background: CUSTOMER_GRADIENT,
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(voucherModal.name)}
                </div>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      color: "var(--text-primary, #172033)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 16,
                    }}
                  >
                    <Ticket size={18} style={{ color: "#8b5cf6" }} /> {t("Ví voucher")}
                  </h3>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-light, #8993a3)",
                      marginTop: 2,
                    }}
                  >
                    <b style={{ color: "var(--text-primary, #172033)" }}>
                      {voucherModal.name}
                    </b>{" "}
                    · {voucherModal.email}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setVoucherModal(null)}
                style={modalCloseStyle}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <MiniStat label={t("TỔNG")} value={voucherStats.total} color="#2634d5" bg="#eef2ff" />
              <MiniStat label={t("KHẢ DỤNG")} value={voucherStats.available} color="#18a967" bg="#e8f9f1" />
              <MiniStat label={t("ĐÃ DÙNG")} value={voucherStats.used} color="#ef4444" bg="#fee2e2" />
              <MiniStat
                label={t("TỔNG GIÁ TRỊ")}
                value={fmtMoney(voucherStats.totalValue || 0)}
                color="#f59e0b"
                bg="#fff4d8"
                smallValue
              />
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 14,
                background: "var(--bg-tertiary, #f5f7fb)",
                padding: 4,
                borderRadius: 10,
              }}
            >
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
                      flex: 1,
                      padding: "10px 12px",
                      background: isActive ? tab.color : "transparent",
                      color: isActive ? "#fff" : "var(--text-muted, #475569)",
                      border: 0,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {tab.label}
                    <span
                      style={{
                        background: isActive ? "rgba(255,255,255,0.3)" : "var(--bg-secondary, #e2e8f0)",
                        color: isActive ? "#fff" : "var(--text-muted, #475569)",
                        minWidth: 22,
                        height: 20,
                        padding: "0 7px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Voucher list */}
            {loadingVouchers ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
                <Loader2
                  size={24}
                  style={{ animation: "spin 1s linear infinite", marginBottom: 8 }}
                />
                <div style={{ fontSize: 13 }}>{t("Đang tải ví voucher...")}</div>
              </div>
            ) : visibleVouchers.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: 40,
                  color: "var(--text-light, #8993a3)",
                  background: "var(--bg-tertiary, #f8fafc)",
                  borderRadius: 10,
                }}
              >
                <Ticket size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 13 }}>
                  {voucherTab === "active"
                    ? t("Khách chưa có voucher khả dụng")
                    : t("Khách chưa dùng voucher nào")}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleVouchers.map((v) => {
                  const src = getVoucherSource(v);
                  const SrcIcon = src.icon;
                  const isCopied = copiedId === v.id;
                  return (
                    <div
                      key={v.id}
                      style={{
                        background: v.used ? "var(--bg-tertiary, #f8fafc)" : "var(--card-bg, #fff)",
                        border: "1px solid " + (v.used ? "var(--border-color, #e5e9ef)" : "#8b5cf6"),
                        borderRadius: 12,
                        padding: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        opacity: v.used ? 0.75 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          background: v.used ? USED_GRADIENT : VOUCHER_GRADIENT,
                          color: "#fff",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Ticket size={22} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 3,
                          }}
                        >
                          <b
                            style={{
                              fontSize: 12,
                              fontFamily: "monospace",
                              color: "#8b5cf6",
                            }}
                          >
                            {v.code}
                          </b>
                          <button
                            onClick={() => copyCode(v)}
                            style={{
                              background: "transparent",
                              border: 0,
                              cursor: "pointer",
                              color: isCopied ? "#18a967" : "var(--text-light, #94a3b8)",
                              padding: 2,
                            }}
                            aria-label={t("Sao chép mã")}
                          >
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 10,
                              background: src.bg,
                              color: src.color,
                              padding: "2px 8px",
                              borderRadius: 10,
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
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
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color: v.used ? "var(--text-muted, #64748b)" : "#18a967",
                          }}
                        >
                          {fmtMoney(v.value)}
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            color: v.used ? "#ef4444" : "#18a967",
                            fontWeight: 700,
                          }}
                        >
                          {v.used ? t("Đã dùng") : t("Khả dụng")}
                        </span>
                      </div>

                      {!v.used && (
                        <button
                          onClick={() => revokeVoucher(v)}
                          title={t("Thu hồi")}
                          style={{
                            padding: 6,
                            border: "1px solid #ef4444",
                            borderRadius: 6,
                            background: "var(--card-bg, #fff)",
                            cursor: "pointer",
                            color: "#ef4444",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setVoucherModal(null)}
              style={{ ...btnPrimaryStyle, marginTop: 16 }}
            >
              {t("Đóng")}
            </button>
          </Modal>
        )}

        {/* Spinner animation */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* ConfirmDialog */}
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

function IconButton({ children, onClick, title, color = "var(--text-primary, #172033)", bg = "var(--card-bg, #fff)" }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        padding: 6,
        border: "1px solid var(--border-color, #e5e9ef)",
        borderRadius: 6,
        background: bg,
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

function InfoBlock({ label, value, highlight }) {
  return (
    <div
      style={{
        background: "var(--bg-tertiary, #f8fafc)",
        padding: "10px 14px",
        borderRadius: 10,
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-light, #8993a3)" }}>
        {label}
      </span>
      <div>
        <b style={{ color: highlight || "var(--text-primary, #172033)" }}>
          {value}
        </b>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, bg, smallValue }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: 12 }}>
      <div
        style={{
          fontSize: 10,
          color,
          fontWeight: 600,
          marginBottom: 4,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <b style={{ fontSize: smallValue ? 14 : 20, color }}>{value}</b>
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
  color: "var(--text-primary, #172033)",
  fontSize: 13,
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

const modalInputStyle = {
  width: "100%",
  padding: 10,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  marginBottom: 14,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  boxSizing: "border-box",
};

const modalLabelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--text-muted, #475569)",
};

const btnPrimaryStyle = {
  width: "100%",
  padding: 12,
  background: "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

const btnPrimaryStyleLoading = (loading) => ({
  flex: 1,
  padding: 12,
  background: loading ? "#94a3b8" : "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 700,
  cursor: loading ? "not-allowed" : "pointer",
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
});

const btnCancelStyle = {
  flex: 1,
  padding: 12,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  background: "var(--card-bg, #fff)",
  cursor: "pointer",
  color: "var(--text-primary, #172033)",
  fontWeight: 600,
  fontSize: 13,
};