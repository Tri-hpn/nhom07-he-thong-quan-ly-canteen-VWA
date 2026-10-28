// ============================================================
// CUSTOMERPROFILE.JSX — Hồ sơ cá nhân (V8)
// ============================================================
// V8 (B9.2):
//   - Xoá dead code: DIETARY_OPTIONS, DEFAULT_DIETARY, dietary state,
//     showThemeModal/showLangModal/showNotiModal + 3 ProfileModal blocks,
//     linkParsed state
//   - Fix t(...).replace() → object interpolation

import {
  useState, useEffect, useMemo, useCallback, useRef,
} from "react";
import {
  User, Mail, Phone, Save, Camera, Pencil, X, Check, KeyRound,
  Lock, Eye, EyeOff, Loader2, BadgeCheck, Palette, Globe, Type,
  RefreshCw, Trash2, Upload, GraduationCap, CheckCircle2,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import StudentCodeInput from "../../components/StudentCodeInput";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/webp",
];

function buildFormFromUser(u) {
  return {
    name: u?.name || "",
    email: u?.email || "",
    phone: u?.phone || "",
    address: u?.address || "",
    avatar: u?.avatar || "",
    faculty: u?.faculty || "",
    className: u?.class_name || u?.class || u?.className || "",
    birthDate: u?.birth_date || u?.date_of_birth || u?.dob || "",
    gender: u?.gender || "nam",
    studentId: u?.student_code || "",
    teacherCode: u?.teacher_code || "",
  };
}

function escapeForCssUrl(url) {
  if (!url) return "";
  return String(url)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, "")
    .replace(/\r/g, "");
}

function getInitials(name) {
  const n = (name || "VWA").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "VWA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ProfileModal({ open, onClose, title, icon, children, maxWidth = 720 }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (document.body.style.overflow === "hidden") {
        document.body.style.overflow = prev;
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="profile-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="profile-modal profile-modal--wide"
        style={{ maxWidth }}
      >
        <div className="profile-modal__head">
          <h3>{icon}{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function CustomerProfile({ user, setUser }) {
  const { t } = useI18n();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => buildFormFromUser(user));
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [showPwdModal, setShowPwdModal] = useState(false);

  const [linkMssv, setLinkMssv] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);

  const [pwdForm, setPwdForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState("");

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!editing) setForm(buildFormFromUser(user));
  }, [user, editing]);

  const displayName = editing ? form.name : user?.name || "";
  const avatarSrc = editing ? form.avatar : user?.avatar;
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  const avatarStyle = useMemo(() => {
    if (avatarSrc) {
      return { background: `url("${escapeForCssUrl(avatarSrc)}") center/cover` };
    }
    return { background: "linear-gradient(135deg, #2563EB, #1D4ED8)" };
  }, [avatarSrc]);

  const resetForm = useCallback(() => {
    setForm(buildFormFromUser(user));
    setErrors({});
  }, [user]);

  const startEdit = () => { resetForm(); setEditing(true); };
  const cancelEdit = () => { resetForm(); setEditing(false); };

  const update = (k) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: "" }));
  };

  const handleAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.size > MAX_AVATAR_SIZE) {
      toast(t("Ảnh vượt quá 5MB"), "error");
      return;
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast(t("Chỉ chấp nhận ảnh JPEG, PNG, WebP"), "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setForm((f) => ({ ...f, avatar: reader.result }));
        if (!editing) setEditing(true);
        toast(t("Đã chọn ảnh mới"), "success");
      }
    };
    reader.onerror = () => toast(t("Không đọc được file"), "error");
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    setForm((f) => ({ ...f, avatar: "" }));
    if (!editing) setEditing(true);
    toast(t("Đã gỡ ảnh"), "success");
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = t("Vui lòng nhập họ tên");
    if (form.phone && !/^[0-9]{10,11}$/.test(form.phone.trim())) {
      errs.phone = t("SĐT phải 10-11 số");
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (loading) return;
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
        class_name: form.className.trim(),
        birth_date: form.birthDate,
        avatar: form.avatar,
        faculty: form.faculty,
        gender: form.gender,
      };

      const updated = await api.updateProfile(payload);
      if (!mountedRef.current) return;
      if (setUser) setUser((u) => ({ ...u, ...updated }));

      try { window.dispatchEvent(new CustomEvent("refresh-user")); } catch {}

      toast(t("Đã cập nhật thông tin"), "success");
      setEditing(false);
    } catch (err) {
      if (mountedRef.current) {
        toast(err.message || t("Không lưu được"), "error");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleLinkMssv = async () => {
    if (linkLoading) return;

    const code = linkMssv.trim();
    if (!code) { setLinkError(t("Vui lòng nhập MSSV")); return; }
    if (!/^\d{10}$/.test(code)) { setLinkError(t("MSSV phải là 10 chữ số")); return; }
    if (linkError) setLinkError("");

    setLinkLoading(true);
    try {
      const updated = await api.updateProfile({ student_code: code });
      if (!mountedRef.current) return;

      if (setUser) setUser((u) => ({ ...u, ...updated }));
      try { window.dispatchEvent(new CustomEvent("refresh-user")); } catch {}

      toast(
        updated.major_name
          ? t("Đã liên kết MSSV — {major}", { major: updated.major_name })
          : t("Đã liên kết MSSV thành công"),
        "success"
      );

      setLinkMssv("");
      setLinkError("");
    } catch (err) {
      const msg = err.message || t("Không liên kết được MSSV");
      if (
        err.body?.code === "MSSV_ALREADY_LINKED" ||
        msg.includes("MSSV này đã được liên kết")
      ) {
        setLinkError(
          t("MSSV này đã liên kết với tài khoản khác. Vui lòng liên hệ admin.")
        );
      } else {
        setLinkError(msg);
      }
    } finally {
      if (mountedRef.current) setLinkLoading(false);
    }
  };

  const openPwdModal = () => {
    setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPwdError("");
    setShowPwd(false);
    setShowPwdModal(true);
  };

  const closePwdModal = () => {
    if (pwdLoading) return;
    setShowPwdModal(false);
  };

  const changePassword = async () => {
    if (pwdLoading) return;
    setPwdError("");

    if (!pwdForm.currentPassword || !pwdForm.newPassword) {
      setPwdError(t("Nhập đầy đủ thông tin"));
      return;
    }
    if (pwdForm.newPassword.length < 6) {
      setPwdError(t("Mật khẩu mới phải từ 6 ký tự"));
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdError(t("Xác nhận mật khẩu không khớp"));
      return;
    }

    setPwdLoading(true);
    try {
      await api.changePassword({
        currentPassword: pwdForm.currentPassword,
        newPassword: pwdForm.newPassword,
      });
      if (!mountedRef.current) return;
      toast(t("Đổi mật khẩu thành công!"), "success");
      setShowPwdModal(false);
      setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e) {
      if (mountedRef.current) {
        setPwdError(e.message || t("Lỗi đổi mật khẩu"));
      }
    } finally {
      if (mountedRef.current) setPwdLoading(false);
    }
  };

  const hasMssv = !!user?.student_code;
  const isMssvLocked = hasMssv;

  return (
    <div className="customer-profile-v2">
      <section className="profile-main-card">
        <div className="profile-main-card__top">
          <div className="profile-main-card__avatar-wrap">
            <div className="profile-main-card__avatar" style={avatarStyle}>
              {!avatarSrc && initials}
            </div>
            {avatarSrc && (
              <span className="profile-main-card__avatar-check">
                <Check size={13} />
              </span>
            )}
          </div>

          <div className="profile-main-card__info">
            <div className="profile-main-card__name">
              <b>{user?.name || t("Người dùng")}</b>
              <BadgeCheck size={18} className="profile-main-card__verified" />
            </div>
            <p className="profile-main-card__email">{user?.email || ""}</p>

            <div className="profile-main-card__tags">
              {hasMssv && user?.major_name ? (
                <>
                  <span className="profile-main-card__tag profile-main-card__tag--major">
                    🎓 {user.major_name}
                  </span>
                  {user?.faculty && (
                    <span className="profile-main-card__tag">
                      🏫 {user.faculty}
                    </span>
                  )}
                  {user?.year_in && (
                    <span className="profile-main-card__tag profile-main-card__tag--year">
                      📅 {user.year_in}
                    </span>
                  )}
                </>
              ) : user?.faculty ? (
                <span className="profile-main-card__tag">🏫 {user.faculty}</span>
              ) : null}
            </div>

            <div className="profile-main-card__sync">
              <RefreshCw size={11} />
              <span>{t("Đồng bộ SSO VWA · Cập nhật 10 phút trước")}</span>
            </div>
          </div>
        </div>

        <div className="profile-main-card__actions">
          {!editing ? (
            <button
              type="button"
              className="profile-btn profile-btn--primary profile-btn--lg"
              onClick={startEdit}
            >
              <Pencil size={16} />
              {t("Chỉnh sửa hồ sơ")}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="profile-btn profile-btn--ghost profile-btn--lg"
                onClick={cancelEdit}
                disabled={loading}
              >
                <X size={16} />
                {t("Huỷ")}
              </button>
              <button
                type="button"
                className="profile-btn profile-btn--primary profile-btn--lg"
                onClick={save}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="profile-spin" />
                    {t("Đang lưu...")}
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {t("Lưu thay đổi")}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </section>

      {!editing && (
        <section className="profile-info-card">
          <h3 className="profile-info-card__title">
            <User size={18} /> {t("Thông tin chi tiết")}
          </h3>

          <div className="profile-info-grid">
            <InfoRow
              icon={<BadgeCheck size={16} />}
              label={t("Mã số sinh viên")}
              value={user?.student_code || t("Chưa liên kết")}
              mono
              locked={isMssvLocked}
            />
            <InfoRow icon={<GraduationCap size={16} />} label={t("Ngành học")} value={user?.major_name || "—"} />
            <InfoRow icon={<User size={16} />} label={t("Khoa")} value={user?.faculty || "—"} />
            <InfoRow icon={<Phone size={16} />} label={t("Số điện thoại")} value={user?.phone || t("Chưa cập nhật")} />
            <InfoRow icon={<Mail size={16} />} label={t("Email")} value={user?.email || "—"} />
            <InfoRow icon={<Type size={16} />} label={t("Năm nhập học")} value={user?.year_in ? String(user.year_in) : "—"} />
            <InfoRow
              icon={<GraduationCap size={16} />}
              label={t("L\u1edbp")}
              value={user?.class_name || user?.class || user?.className || "\u2014"}
            />
            <InfoRow
              icon={<User size={16} />}
              label={t("Gi\u1edbi t\u00ednh")}
              value={
                user?.gender === "nu" || user?.gender === "female"
                  ? t("N\u1eef")
                  : user?.gender === "khac" || user?.gender === "other"
                    ? t("Kh\u00e1c")
                    : user?.gender
                      ? t("Nam")
                      : "\u2014"
              }
            />
            <InfoRow
              icon={<Type size={16} />}
              label={t("Ng\u00e0y sinh")}
              value={user?.birth_date || user?.date_of_birth || user?.dob || "\u2014"}
            />
            <InfoRow
              icon={<Globe size={16} />}
              label={t("\u0110\u1ecba ch\u1ec9")}
              value={user?.address || "\u2014"}
            />
          </div>
        </section>
      )}

      {!editing && !hasMssv && (
        <section className="profile-link-card">
          <div className="profile-link-card__head">
            <GraduationCap size={22} />
            <div>
              <h3>{t("Liên kết MSSV để xác thực sinh viên")}</h3>
              <p>
                {t("Nhập MSSV (10 số) để tự động lấy ngành học, khoa và nhận ưu đãi dành riêng cho sinh viên VWA.")}
              </p>
            </div>
          </div>

          <div className="profile-link-card__body">
            <StudentCodeInput
              value={linkMssv}
              onChange={(code) => {
                setLinkMssv(code);
                if (linkError) setLinkError("");
              }}
              disabled={linkLoading}
              required={false}
              showPreview={true}
              label={t("Mã số sinh viên (MSSV)")}
            />

            {linkError && (
              <div className="profile-link-card__error">
                <Lock size={14} /> {linkError}
              </div>
            )}

            <button
              type="button"
              className="profile-btn profile-btn--primary profile-btn--lg profile-link-card__btn"
              onClick={handleLinkMssv}
              disabled={linkLoading || !linkMssv.trim()}
            >
              {linkLoading ? (
                <>
                  <Loader2 size={16} className="profile-spin" />
                  {t("Đang liên kết...")}
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  {t("Liên kết ngay")}
                </>
              )}
            </button>
          </div>

          <ul className="profile-link-card__benefits">
            <li><Check size={14} /> {t("Nhận ưu đãi dành riêng cho sinh viên VWA")}</li>
            <li><Check size={14} /> {t("Hiển thị ngành/khoa trên hồ sơ cá nhân")}</li>
            <li><Check size={14} /> {t("Đồng bộ điểm tích lũy và voucher sinh viên")}</li>
          </ul>
        </section>
      )}

      {editing && (
        <section className="profile-edit-card">
          <div className="profile-avatar-block">
            <div className="profile-avatar-block__img-wrap">
              <div className="profile-avatar-block__img" style={avatarStyle}>
                {!avatarSrc && initials}
              </div>
              {avatarSrc && (
                <span className="profile-avatar-block__check">
                  <Check size={13} />
                </span>
              )}
            </div>

            <div className="profile-avatar-block__body">
              <h4>{t("Ảnh đại diện thẻ Canteen")}</h4>
              <p>
                {t("Ảnh đại diện giúp nhân viên căng tin đối chiếu khi nhận suất ăn đặt trước tại quầy thông minh. Định dạng cho phép: JPG, PNG tối đa 5MB.")}
              </p>
              <div className="profile-avatar-block__actions">
                <label className="profile-btn profile-btn--primary">
                  <Upload size={16} />
                  {t("Tải ảnh mới")}
                  <input
                    type="file"
                    accept={ALLOWED_AVATAR_TYPES.join(",")}
                    onChange={handleAvatar}
                    style={{ display: "none" }}
                  />
                </label>
                {avatarSrc && (
                  <button
                    type="button"
                    className="profile-btn profile-btn--ghost"
                    onClick={removeAvatar}
                  >
                    <Trash2 size={16} />
                    {t("Gỡ ảnh")}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="profile-form-grid">
            <div className="profile-form-field">
              <label className="profile-form-label" htmlFor="profile-name">
                <span>{t("Họ và tên đầy đủ")}</span>
                <small className="profile-form-label--required">{t("Bắt buộc")}</small>
              </label>
              <div className="profile-form-input-wrap">
                <User size={18} className="profile-form-input-icon" />
                <input
                  id="profile-name"
                  name="name"
                  value={form.name}
                  onChange={update("name")}
                  disabled={!editing}
                  className="profile-form-input"
                />
              </div>
              {errors.name && <span className="profile-form-error">{errors.name}</span>}
            </div>

            <div className="profile-form-field">
              <label className="profile-form-label">
                <span>{t("Mã số sinh viên (MSSV)")}</span>
                <small className="profile-form-label--locked">
                  <Lock size={10} />
                  {t("Khóa theo SSO")}
                </small>
              </label>
              <div className="profile-form-input-wrap profile-form-input-wrap--locked">
                <BadgeCheck size={18} className="profile-form-input-icon" />
                <input
                  value={form.studentId || ""}
                  readOnly
                  placeholder={t("Chưa liên kết")}
                  className="profile-form-input profile-form-input--mono"
                />
              </div>
            </div>

            <div className="profile-form-field">
              <label className="profile-form-label">
                <span>{t("Khoa / Ngành học")}</span>
              </label>
              <div className="profile-form-input-wrap">
                <span className="profile-form-input-icon">🎓</span>
                <input
                  value={form.faculty || ""}
                  onChange={update("faculty")}
                  placeholder={t("Chưa xác định")}
                  className="profile-form-input"
                />
              </div>
            </div>

            <div className="profile-form-field">
              <label className="profile-form-label" htmlFor="profile-phone">
                <span>{t("Số điện thoại nhận thông báo món")}</span>
              </label>
              <div className="profile-form-input-wrap">
                <Phone size={18} className="profile-form-input-icon" />
                <input
                  id="profile-phone"
                  name="phone"
                  value={form.phone}
                  onChange={update("phone")}
                  placeholder="0988 123 456"
                  className="profile-form-input"
                />
              </div>
              {errors.phone && <span className="profile-form-error">{errors.phone}</span>}
            </div>

            <div className="profile-form-field">
              <label className="profile-form-label">
                <span>{t("Email")}</span>
                <small className="profile-form-label--locked">
                  <Lock size={10} />
                  {t("Không thể sửa")}
                </small>
              </label>
              <div className="profile-form-input-wrap profile-form-input-wrap--locked">
                <Mail size={18} className="profile-form-input-icon" />
                <input value={form.email} readOnly className="profile-form-input" />
              </div>
            </div>

            <div className="profile-form-field">
              <label className="profile-form-label">
                <span>{t("Địa chỉ")}</span>
              </label>
              <div className="profile-form-input-wrap">
                <span className="profile-form-input-icon">📍</span>
                <input
                  value={form.address}
                  onChange={update("address")}
                  placeholder={t("Ký túc xá VWA")}
                  className="profile-form-input"
                />
              </div>
            </div>

            <div className="profile-form-field profile-form-field--trio">
              <label className="profile-form-label">
                <span>{t("Giới tính")}</span>
              </label>
              <div className="profile-form-radio-group">
                {[
                  { v: "nam", label: t("Nam") },
                  { v: "nu", label: t("Nữ") },
                  { v: "khac", label: t("Khác") },
                ].map((g) => (
                  <label key={g.v} className="profile-form-radio">
                    <input
                      type="radio"
                      name="gender"
                      value={g.v}
                      checked={form.gender === g.v}
                      onChange={update("gender")}
                    />
                    <span>{g.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="profile-form-field profile-form-field--trio">
              <label className="profile-form-label" htmlFor="profile-class-edit">
                <span>{t("L\u1edbp")}</span>
              </label>
              <div className="profile-form-input-wrap">
                <input
                  id="profile-class-edit"
                  name="className"
                  value={form.className}
                  onChange={update("className")}
                  placeholder={t("Nh\u1eadp l\u1edbp")}
                  className="profile-form-input"
                />
              </div>
            </div>

            <div className="profile-form-field profile-form-field--trio">
              <label className="profile-form-label" htmlFor="profile-birth-edit">
                <span>{t("Ng\u00e0y sinh")}</span>
              </label>
              <div className="profile-form-input-wrap">
                <input
                  id="profile-birth-edit"
                  name="birthDate"
                  type="date"
                  value={form.birthDate}
                  onChange={update("birthDate")}
                  className="profile-form-input"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <ProfileModal
        open={showPwdModal}
        onClose={closePwdModal}
        title={t("Đổi mật khẩu")}
        icon={<Lock size={20} />}
        maxWidth={440}
      >
        {pwdError && <div className="profile-modal__error">{pwdError}</div>}

        <label className="profile-modal__label">{t("Mật khẩu hiện tại")}</label>
        <div className="profile-modal__input-wrap">
          <Lock size={16} />
          <input
            type={showPwd ? "text" : "password"}
            value={pwdForm.currentPassword}
            onChange={(e) => setPwdForm((f) => ({ ...f, currentPassword: e.target.value }))}
            placeholder={t("Nhập mật khẩu hiện tại")}
            disabled={pwdLoading}
          />
        </div>

        <label className="profile-modal__label">{t("Mật khẩu mới")}</label>
        <div className="profile-modal__input-wrap">
          <KeyRound size={16} />
          <input
            type={showPwd ? "text" : "password"}
            value={pwdForm.newPassword}
            onChange={(e) => setPwdForm((f) => ({ ...f, newPassword: e.target.value }))}
            placeholder={t("Tối thiểu 6 ký tự")}
            disabled={pwdLoading}
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            className="profile-modal__eye"
          >
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <label className="profile-modal__label">{t("Xác nhận mật khẩu mới")}</label>
        <div className="profile-modal__input-wrap">
          <Check size={16} />
          <input
            type={showPwd ? "text" : "password"}
            value={pwdForm.confirmPassword}
            onChange={(e) => setPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            placeholder={t("Nhập lại mật khẩu mới")}
            disabled={pwdLoading}
            onKeyDown={(e) => { if (e.key === "Enter") changePassword(); }}
          />
        </div>

        <div className="profile-modal__actions">
          <button
            type="button"
            className="profile-btn profile-btn--ghost"
            onClick={closePwdModal}
            disabled={pwdLoading}
          >
            {t("Hủy")}
          </button>
          <button
            type="button"
            className="profile-btn profile-btn--primary"
            onClick={changePassword}
            disabled={pwdLoading}
          >
            {pwdLoading ? (
              <>
                <Loader2 size={14} className="profile-spin" />
                {t("Đang xử lý...")}
              </>
            ) : t("Đổi mật khẩu")}
          </button>
        </div>
      </ProfileModal>

      <style>{`
        @keyframes profile-spin-anim {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .profile-spin { animation: profile-spin-anim 1s linear infinite; }
      `}</style>
    </div>
  );
}

function InfoRow({ icon, label, value, mono = false, locked = false }) {
  return (
    <div className="profile-info-row">
      <div className="profile-info-row__icon">{icon}</div>
      <div className="profile-info-row__body">
        <span className="profile-info-row__label">
          {label}
          {locked && (
            <span className="profile-info-row__locked">
              <Lock size={9} />
            </span>
          )}
        </span>
        <span className={`profile-info-row__value ${mono ? "profile-info-row__value--mono" : ""}`}>
          {value}
        </span>
      </div>
    </div>
  );
}