// ============================================================
// STAFFPROFILE.JSX — Hồ sơ Nhân viên / Admin (V4 — B9.8)
// ============================================================
// V4:
//   - Bug 1: PasswordModal thêm body scroll lock
//   - Bug 2: PasswordModal thêm submittingRef chống double-submit
//   - Bug 3: overlay/X không đóng khi đang loading
// ============================================================

import { useState, useEffect, useRef } from "react";
import {
  User, Mail, Phone, MapPin, Save, Shield, Camera, Pencil, X, Check,
  Lock, KeyRound, Eye, EyeOff, BadgeCheck, GraduationCap, Building2,
} from "lucide-react";
import { api } from "../api";
import { toast } from "../components/Effects";
import { useI18n } from "../hooks/useI18n";

const MAX_AVATAR_DIM = 512;
const AVATAR_QUALITY = 0.85;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("read-error"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode-error"));
    img.src = src;
  });
}

async function compressAvatar(file) {
  const original = await readFileAsDataUrl(file);
  if (typeof original !== "string") return original;

  try {
    const img = await loadImageElement(original);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return original;

    const scale = Math.min(1, MAX_AVATAR_DIM / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const out = canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
    return out.length < original.length ? out : original;
  } catch {
    return original;
  }
}

function buildFormFromUser(u) {
  return {
    name: u?.name || "",
    email: u?.email || "",
    phone: u?.phone || "",
    address: u?.address || "",
    avatar: u?.avatar || "",
  };
}

export default function StaffProfile({
  user,
  setUser,
  canEditEmail = false,
}) {
  const { t } = useI18n();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => buildFormFromUser(user));
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);

  useEffect(() => {
    if (!editing) {
      setForm(buildFormFromUser(user));
    }
  }, [user, editing]);

  const startEdit = () => {
    setForm(buildFormFromUser(user));
    setErrors({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setForm(buildFormFromUser(user));
    setErrors({});
    setEditing(false);
  };

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: "" }));
  };

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.size > 2 * 1024 * 1024) {
      toast(t("Ảnh vượt quá 2MB"), "error");
      return;
    }

    try {
      const dataUrl = await compressAvatar(file);
      setForm((f) => ({ ...f, avatar: dataUrl }));
      toast(t("Đã chọn ảnh mới"), "success");
    } catch {
      toast(t("Không đọc được file"), "error");
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = t("Vui lòng nhập họ tên");

    if (canEditEmail) {
      if (!form.email.trim()) {
        errs.email = t("Vui lòng nhập email");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        errs.email = t("Email không hợp lệ");
      }
    }

    if (form.phone && !/^[0-9]{10,11}$/.test(form.phone.trim())) {
      errs.phone = t("SĐT phải 10-11 số");
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      toast(t("Kiểm tra lại thông tin"), "error");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        avatar: form.avatar,
      };
      if (canEditEmail) payload.email = form.email.trim().toLowerCase();

      const updated = await api.updateProfile(payload);

      if (setUser) setUser((u) => ({ ...u, ...updated }));

      window.dispatchEvent(new CustomEvent("refresh-user"));

      toast(t("Đã lưu thay đổi!"), "success");
      setEditing(false);
    } catch (err) {
      toast(err.message || t("Không lưu được"), "error");
    } finally {
      setLoading(false);
    }
  };

  const roleLabel =
    user?.role === "ADMIN" ? t("Quản trị viên") : t("Nhân viên");

  const displayName = editing ? form.name : user?.name || "";
  const initials = (displayName || "VWA")
    .trim()
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarSrc = editing ? form.avatar : user?.avatar;

  const hasTeacherCode = !!user?.teacher_code;

  return (
    <div
      className="profile-grid"
      style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}
    >
      <div className="profile-card-left" style={cardStyle}>
        <div
          className="profile-avatar-wrap"
          style={{
            position: "relative",
            width: 100,
            height: 100,
            margin: "0 auto 14px",
          }}
        >
          <div
            className="profile-avatar"
            style={{
              width: 100,
              height: 100,
              borderRadius: "50%",
              background: avatarSrc
                ? `url(${avatarSrc}) center/cover`
                : "linear-gradient(135deg, #2634d5, #20c779)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 36,
              border: "3px solid var(--border-color, #e5e9ef)",
              overflow: "hidden",
            }}
          >
            {!avatarSrc && initials}
          </div>

          {editing && (
            <label
              title={t("Đổi ảnh")}
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "#2634d5",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                border: "2px solid #fff",
              }}
            >
              <Camera size={16} />
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatar}
                style={{ display: "none" }}
              />
            </label>
          )}
        </div>

        <h3
          style={{
            margin: "0 0 4px",
            color: "var(--text-primary, #172033)",
            textAlign: "center",
          }}
        >
          {user?.name}
        </h3>
        <p
          style={{
            margin: 0,
            color: "var(--text-light, #8993a3)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {user?.email}
        </p>

        <div
          style={{ display: "flex", justifyContent: "center", marginTop: 12 }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 20,
              background: user?.role === "ADMIN" ? "#fef3c7" : "#eef2ff",
              color: user?.role === "ADMIN" ? "#92400e" : "#2634d5",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <Shield size={12} /> {roleLabel}
          </div>
        </div>

        {hasTeacherCode && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 10,
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: "#0369a1",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 4,
                fontWeight: 700,
              }}
            >
              {t("Mã giảng viên")}
            </div>
            <div
              style={{
                fontSize: 15,
                fontFamily: "ui-monospace, monospace",
                fontWeight: 800,
                color: "#0c4a6e",
                letterSpacing: 0.5,
              }}
            >
              {user.teacher_code}
            </div>
            {user.year_in && (
              <div style={{ fontSize: 11, color: "#0369a1", marginTop: 4 }}>
                {t("Vào năm")} {user.year_in}
                {user.unit_code ? ` · ${t("Đơn vị")} ${user.unit_code}` : ""}
              </div>
            )}
          </div>
        )}

        {!hasTeacherCode && user?.email?.includes("@vwa.edu.vn") && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              fontSize: 12,
              color: "#92400e",
              lineHeight: 1.5,
            }}
          >
            ⚠️{" "}
            {t("Tài khoản của bạn chưa có mã giảng viên. Vui lòng liên hệ phòng Tổ chức để được cấp.")}
          </div>
        )}

        <button
          onClick={() => setShowPwdModal(true)}
          className="btn-change-pwd"
          style={{
            width: "100%",
            marginTop: 20,
            padding: 12,
            background: "var(--bg-tertiary, #f5f7fb)",
            color: "var(--text-primary, #172033)",
            border: "1px solid var(--border-color, #e5e9ef)",
            borderRadius: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <KeyRound size={15} /> {t("Đổi mật khẩu")}
        </button>
      </div>

      <div className="profile-card-right" style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: "var(--text-primary, #172033)" }}>
              {t("Hồ sơ cá nhân")}
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-light, #8993a3)",
                fontSize: 13,
              }}
            >
              {editing
                ? t("Chỉnh sửa thông tin bên dưới")
                : t("Thông tin tài khoản của bạn")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!editing ? (
              <button onClick={startEdit} style={btnEdit}>
                <Pencil size={14} /> {t("Sửa")}
              </button>
            ) : (
              <>
                <button
                  onClick={cancelEdit}
                  disabled={loading}
                  className="btn-cancel"
                  style={btnCancel}
                >
                  <X size={14} /> {t("Hủy")}
                </button>
                <button
                  onClick={save}
                  disabled={loading}
                  className="btn-save"
                  style={btnSave}
                >
                  <Save size={14} /> {loading ? t("Đang lưu...") : t("Lưu")}
                </button>
              </>
            )}
          </div>
        </div>

        {!editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <InfoRow
              icon={<User size={16} />}
              label={t("Họ và tên")}
              value={user?.name}
            />

            {hasTeacherCode && (
              <InfoRow
                icon={<BadgeCheck size={16} />}
                label={t("Mã giảng viên")}
                value={user.teacher_code}
                note={t("Do phòng Tổ chức cấp")}
                mono
              />
            )}

            {hasTeacherCode && user?.year_in && (
              <InfoRow
                icon={<GraduationCap size={16} />}
                label={t("Năm vào trường")}
                value={String(user.year_in)}
              />
            )}

            {hasTeacherCode && user?.unit_code && (
              <InfoRow
                icon={<Building2 size={16} />}
                label={t("Đơn vị")}
                value={user.unit_code}
              />
            )}

            <InfoRow
              icon={<Mail size={16} />}
              label={t("Email")}
              value={user?.email}
              note={!canEditEmail ? t("Do admin quản lý") : null}
            />
            <InfoRow
              icon={<Phone size={16} />}
              label={t("Số điện thoại")}
              value={user?.phone || "—"}
            />
            <InfoRow
              icon={<MapPin size={16} />}
              label={t("Địa chỉ")}
              value={user?.address || "—"}
            />
          </div>
        )}

        {editing && (
          <div>
            <label style={labelStyle}>{t("Họ và tên")} *</label>
            <div style={inputWrapStyle(errors.name)}>
              <User size={16} style={iconStyle} />
              <input
                value={form.name}
                onChange={update("name")}
                style={inputInnerStyle}
                placeholder={t("Nguyễn Văn A")}
              />
            </div>
            {errors.name && <div style={errStyle}>{errors.name}</div>}

            <label style={labelStyle}>
              {t("Email")}{" "}
              {canEditEmail ? "*" : `(${t("không được sửa")})`}
            </label>
            <div
              style={{
                ...inputWrapStyle(errors.email),
                opacity: canEditEmail ? 1 : 0.6,
              }}
            >
              <Mail size={16} style={iconStyle} />
              <input
                type="email"
                value={form.email}
                onChange={update("email")}
                style={inputInnerStyle}
                disabled={!canEditEmail}
              />
            </div>
            {errors.email && <div style={errStyle}>{errors.email}</div>}

            <label style={labelStyle}>{t("Số điện thoại")}</label>
            <div style={inputWrapStyle(errors.phone)}>
              <Phone size={16} style={iconStyle} />
              <input
                value={form.phone}
                onChange={update("phone")}
                style={inputInnerStyle}
                placeholder={t("0901234567")}
              />
            </div>
            {errors.phone && <div style={errStyle}>{errors.phone}</div>}

            <label style={labelStyle}>{t("Địa chỉ")}</label>
            <div style={inputWrapStyle()}>
              <MapPin size={16} style={iconStyle} />
              <input
                value={form.address}
                onChange={update("address")}
                style={inputInnerStyle}
                placeholder={t("Ký túc xá VWA")}
              />
            </div>
          </div>
        )}
      </div>

      {showPwdModal && (
        <PasswordModal onClose={() => setShowPwdModal(false)} />
      )}
    </div>
  );
}

// ============================================================
// Password Modal
// ============================================================
function PasswordModal({ onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 🔧 B9.8 — chống double-submit
  const submittingRef = useRef(false);

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // 🔧 B9.8 — body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && !submittingRef.current) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const submit = async () => {
    if (submittingRef.current) return;
    setError("");
    if (!form.currentPassword || !form.newPassword) {
      setError(t("Nhập đầy đủ thông tin"));
      return;
    }
    if (form.newPassword.length < 6) {
      setError(t("Mật khẩu mới phải từ 6 ký tự"));
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError(t("Xác nhận mật khẩu không khớp"));
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      await api.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast(t("Đổi mật khẩu thành công!"), "success");
      window.dispatchEvent(new CustomEvent("refresh-user"));
      onClose();
    } catch (e) {
      setError(e.message || t("Lỗi đổi mật khẩu"));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      onClick={() => !loading && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={t("Đổi mật khẩu")}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth: 460,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h3
            style={{
              margin: 0,
              color: "var(--text-primary, #172033)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Lock size={20} /> {t("Đổi mật khẩu")}
          </h3>
          <button
            onClick={() => !loading && onClose()}
            disabled={loading}
            style={{
              background: "transparent",
              border: 0,
              fontSize: 24,
              color: "var(--text-light, #8993a3)",
              cursor: loading ? "not-allowed" : "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "#fde8e8",
              color: "#ef4444",
              padding: 10,
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <label style={labelStyle}>{t("Mật khẩu hiện tại")}</label>
        <div style={inputWrapStyle()}>
          <Lock size={16} style={iconStyle} />
          <input
            type={showPwd ? "text" : "password"}
            value={form.currentPassword}
            onChange={update("currentPassword")}
            style={inputInnerStyle}
            placeholder={t("Nhập mật khẩu hiện tại")}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--text-light, #8993a3)",
            }}
          >
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <label style={labelStyle}>{t("Mật khẩu mới")}</label>
        <div style={inputWrapStyle()}>
          <KeyRound size={16} style={iconStyle} />
          <input
            type={showPwd ? "text" : "password"}
            value={form.newPassword}
            onChange={update("newPassword")}
            style={inputInnerStyle}
            placeholder={t("Tối thiểu 6 ký tự")}
          />
        </div>

        <label style={labelStyle}>{t("Xác nhận mật khẩu mới")}</label>
        <div style={inputWrapStyle()}>
          <Check size={16} style={iconStyle} />
          <input
            type={showPwd ? "text" : "password"}
            value={form.confirmPassword}
            onChange={update("confirmPassword")}
            style={inputInnerStyle}
            placeholder={t("Nhập lại mật khẩu mới")}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={() => !loading && onClose()}
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 8,
              background: "var(--card-bg, #fff)",
              cursor: loading ? "not-allowed" : "pointer",
              color: "var(--text-primary, #172033)",
              fontWeight: 600,
            }}
          >
            {t("Hủy")}
          </button>
          <button
            onClick={submit}
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              background: loading ? "#94a3b8" : "#2634d5",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? t("Đang xử lý...") : t("Đổi mật khẩu")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// InfoRow
// ============================================================
function InfoRow({ icon, label, value, note, mono = false }) {
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
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {label}
          {note && (
            <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
              ({note})
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--text-primary, #172033)",
            fontWeight: 600,
            wordBreak: "break-word",
            fontFamily: mono ? "ui-monospace, monospace" : "inherit",
            letterSpacing: mono ? 0.5 : "normal",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================
const cardStyle = {
  background: "var(--card-bg, #fff)",
  border: "1px solid var(--border-color, #e7ebf0)",
  borderRadius: 12,
  padding: 24,
};

const btnEdit = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  background: "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const btnCancel = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  background: "var(--card-bg, #fff)",
  color: "var(--text-primary, #475569)",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const btnSave = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  background: "#18a967",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--text-muted, #475569)",
  marginTop: 14,
};

const iconStyle = { color: "var(--text-light, #8993a3)" };

const inputInnerStyle = {
  flex: 1,
  border: 0,
  outline: "none",
  background: "transparent",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
};

const inputWrapStyle = (err) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: err ? "2px solid #ef4444" : "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  padding: "8px 12px",
  background: "var(--bg-secondary, #fff)",
});

const errStyle = { color: "#ef4444", fontSize: 12, marginTop: 4 };