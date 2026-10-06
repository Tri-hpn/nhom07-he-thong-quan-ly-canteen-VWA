// ============================================================
// CUSTOMERPROFILE.JSX — Tài khoản & Cài đặt (V5 - FINAL + i18n)
// ============================================================
// V5 (2026-10):
//   - 🔧 FIX #31: font-size KHÔNG dùng `html { font-size: calc(...) }`
//                 inline vì conflict với CSS toàn cục.
//                 → Dùng CSS variable --app-font-scale trên :root
//                 và để CSS toàn cục tự apply.
//   - Giữ nguyên logic i18n, localStorage, theme, modals
// ============================================================

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  User, Mail, Phone, Save, Shield, Camera, Pencil, X, Check, KeyRound,
  Lock, Eye, EyeOff, Loader2, ChevronRight, BadgeCheck, Wallet, Bell,
  Palette, Globe, Sun, Moon, Monitor, Type, RefreshCw,
  Trash2, Upload, CreditCard, HelpCircle, CheckCircle2,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";

// ============================================================
// CONSTANTS
// ============================================================

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const LS_KEYS = {
  THEME: "vwa_theme",
  LANG: "vwa_lang",
  DIETARY: "vwa_dietary",
  NOTI_PREFS: "vwa_noti_prefs",
  MEAL_SLOTS: "vwa_meal_slots",
  FONT_SIZE: "vwa_font_size",
};

const LANGUAGES = [
  { code: "vi", flag: "🇻🇳", name: "Tiếng Việt", sub: "Vietnamese (Mặc định)" },
  { code: "en", flag: "🇺🇸", name: "English", sub: "United States • Global" },
  { code: "ko", flag: "🇰🇷", name: "한국어", sub: "Korean Exchange" },
  { code: "zh", flag: "🇨🇳", name: "中文 (简体)", sub: "Simplified Chinese" },
];

const THEMES = [
  {
    id: "light",
    icon: Sun,
    label: "Giao diện Sáng",
    desc: "Khung cửa sổ trắng sáng, chữ tối tương phản cao, lý tưởng cho phòng học sáng và ban ngày.",
  },
  {
    id: "dark",
    icon: Moon,
    label: "Giao diện Tối",
    desc: "Tông than chì đen dịu mắt, chống mỏi mắt khi đặt đồ ăn khuya hoặc ca học tối tại ký túc xá.",
  },
  {
    id: "auto",
    icon: Monitor,
    label: "Tự động hệ điều hành",
    desc: "Tự động đồng bộ theo cài đặt Dark/Light của Windows, macOS, iOS hoặc Android của bạn.",
  },
];

const DIETARY_OPTIONS = [
  {
    key: "vegetarian",
    title: "Ăn chay mùng 1 & ngày Rằm",
    desc: "Tự động đề xuất thực đơn chay thanh đạm vào các ngày âm lịch đặc biệt.",
  },
  {
    key: "lessSpicy",
    title: "Ít cay / Không ớt",
    desc: "Bếp canteen tự động giảm ớt và gia vị cay nóng trong các món bún, phở, xào.",
  },
  {
    key: "seafoodAllergy",
    title: "Dị ứng hải sản vỏ cứng",
    desc: "Cảnh báo nhãn đỏ nếu món ăn chứa tôm, cua, sò, nghêu hoặc nước luộc hải sản.",
  },
  {
    key: "brownRice",
    title: "Ưu tiên cơm gạo lứt / Eat Clean",
    desc: "Tự động đổi suất cơm trắng sang gạo lứt dinh dưỡng nếu căn tin còn suất.",
  },
];

const DEFAULT_DIETARY = {
  vegetarian: true,
  lessSpicy: true,
  seafoodAllergy: false,
  brownRice: false,
};

const DEFAULT_NOTI_PREFS = {
  orderReady: true,
  orderStatus: true,
  promotion: true,
  wallet: true,
  sound: true,
  vibration: false,
};

const DEFAULT_MEAL_SLOTS = {
  breakfast: true,
  lunch: true,
  dinner: false,
  notifyBefore: 15,
};

// ============================================================
// HELPERS
// ============================================================

function buildFormFromUser(u) {
  return {
    name: u?.name || "",
    email: u?.email || "",
    phone: u?.phone || "",
    address: u?.address || "",
    avatar: u?.avatar || "",
    faculty: u?.faculty || "",
    gender: u?.gender || "nam",
    studentId: u?.studentId || "2151010088",
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

function readLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...fallback, ...parsed };
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ============================================================
// SUB: ProfileModal
// ============================================================

function ProfileModal({
  open,
  onClose,
  title,
  icon,
  children,
  maxWidth = 720,
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
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
          <h3>
            {icon}
            {title}
          </h3>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerProfile({ user, setUser }) {
  const { t } = useI18n();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => buildFormFromUser(user));
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [showNotiModal, setShowNotiModal] = useState(false);

  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    try {
      return localStorage.getItem(LS_KEYS.THEME) || "light";
    } catch {
      return "light";
    }
  });

  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "vi";
    try {
      return localStorage.getItem(LS_KEYS.LANG) || "vi";
    } catch {
      return "vi";
    }
  });

  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const saved = parseInt(
        localStorage.getItem(LS_KEYS.FONT_SIZE) || "1",
        10
      );
      return isNaN(saved) ? 1 : Math.max(1, Math.min(3, saved));
    } catch {
      return 1;
    }
  });

  const [dietary, setDietary] = useState(() =>
    readLocalJson(LS_KEYS.DIETARY, DEFAULT_DIETARY)
  );

  const [notiPrefs, setNotiPrefs] = useState(() =>
    readLocalJson(LS_KEYS.NOTI_PREFS, DEFAULT_NOTI_PREFS)
  );

  const [mealSlots, setMealSlots] = useState(() =>
    readLocalJson(LS_KEYS.MEAL_SLOTS, DEFAULT_MEAL_SLOTS)
  );

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
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!editing) setForm(buildFormFromUser(user));
  }, [user]);

  // 🔧 FIX #31: Áp theme + listen prefers-color-scheme
  useEffect(() => {
    if (typeof document === "undefined") return;

    const applyTheme = () => {
      try {
        localStorage.setItem(LS_KEYS.THEME, theme);
        document.documentElement.classList.remove("dark-mode");
        if (theme === "dark") {
          document.documentElement.classList.add("dark-mode");
        } else if (theme === "auto") {
          const prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)"
          ).matches;
          if (prefersDark) {
            document.documentElement.classList.add("dark-mode");
          }
        }
      } catch {}
    };

    applyTheme();

    if (theme === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme();
      if (mq.addEventListener) {
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
      } else if (mq.addListener) {
        mq.addListener(handler);
        return () => mq.removeListener(handler);
      }
    }
  }, [theme]);

  // 🔧 FIX #31: Apply font-size CHỈ qua CSS variable --app-font-scale.
  // CSS toàn cục (styles.css) sẽ dùng: html { font-size: calc(16px * var(--app-font-scale, 1)); }
  // Nếu CSS không có rule đó → ta fallback nhẹ bằng cách set biến trên :root.
  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      localStorage.setItem(LS_KEYS.FONT_SIZE, String(fontSize));
      // Scale: 1 → 1.0, 2 → 1.12, 3 → 1.24
      const scale = 1 + (fontSize - 1) * 0.12;
      document.documentElement.style.setProperty(
        "--app-font-scale",
        String(scale)
      );
    } catch {}
  }, [fontSize]);

  useEffect(() => {
    writeLocalJson(LS_KEYS.DIETARY, dietary);
  }, [dietary]);

  useEffect(() => {
    writeLocalJson(LS_KEYS.NOTI_PREFS, notiPrefs);
  }, [notiPrefs]);

  useEffect(() => {
    writeLocalJson(LS_KEYS.MEAL_SLOTS, mealSlots);
  }, [mealSlots]);

  const displayName = editing ? form.name : user?.name || "";
  const avatarSrc = editing ? form.avatar : user?.avatar;
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  const avatarStyle = useMemo(() => {
    if (avatarSrc) {
      return {
        background: `url("${escapeForCssUrl(avatarSrc)}") center/cover`,
      };
    }
    return {
      background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
    };
  }, [avatarSrc]);

  const resetForm = useCallback(() => {
    setForm(buildFormFromUser(user));
    setErrors({});
  }, [user]);

  const startEdit = () => {
    resetForm();
    setEditing(true);
  };

  const cancelEdit = () => {
    resetForm();
    setEditing(false);
  };

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
    if (!form.email.trim()) {
      errs.email = t("Vui lòng nhập email");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = t("Email không hợp lệ");
    }
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
      const updated = await api.updateProfile({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        avatar: form.avatar,
        faculty: form.faculty,
        gender: form.gender,
      });

      if (!mountedRef.current) return;

      if (setUser) setUser((u) => ({ ...u, ...updated }));

      try {
        window.dispatchEvent(new CustomEvent("refresh-user"));
        localStorage.setItem("canteen_user", JSON.stringify(updated));
      } catch {}

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

  const changeLanguage = (code) => {
    setLanguage(code);
    try {
      localStorage.setItem(LS_KEYS.LANG, code);
      window.dispatchEvent(
        new CustomEvent("language-change", { detail: { lang: code } })
      );
    } catch {}
    toast(t("Đã đổi ngôn ngữ"), "success");
  };

  const changeTheme = (id) => {
    setTheme(id);
    try {
      window.dispatchEvent(
        new CustomEvent("theme-change", { detail: { theme: id } })
      );
    } catch {}
    toast(t("Đã đổi giao diện"), "success");
  };

  const openPwdModal = () => {
    setPwdForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
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
      setPwdForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (e) {
      if (mountedRef.current) {
        setPwdError(e.message || t("Lỗi đổi mật khẩu"));
      }
    } finally {
      if (mountedRef.current) setPwdLoading(false);
    }
  };

  return (
    <div className="customer-profile-v2">
      <section className="profile-header">
        <div className="profile-header__row">
          <div className="profile-header__left">
            <div className="profile-header__eyebrow">
              <span className="profile-header__eyebrow-dot" />
              {t("Cổng tự phục vụ học sinh - sinh viên")}
            </div>
            <h1 className="profile-title">
              {t("Tài khoản & Thiết lập hệ thống")}
            </h1>
            <p className="profile-subtitle">
              {t("Quản lý thông tin định danh sinh viên SSO, tùy biến giao diện sáng/tối, ngôn ngữ hiển thị và bảo mật tài khoản Canteen VWA.")}
            </p>
          </div>

          <div className="profile-sync-card">
            <div className="profile-sync-card__icon">
              <RefreshCw size={20} />
            </div>
            <div className="profile-sync-card__info">
              <span>{t("ĐỒNG BỘ SSO VWA")}</span>
              <b>{t("Cập nhật 10 phút trước")}</b>
            </div>
          </div>
        </div>
      </section>

      <div className="profile-layout">
        <aside className="profile-sidebar">
          <div className="profile-user-card profile-user-card--compact">
            <div className="profile-user-card__info">
              <div className="profile-user-card__name-row">
                <b>{user?.name || t("Người dùng")}</b>
                <BadgeCheck
                  size={16}
                  className="profile-user-card__verified"
                />
              </div>
              <p className="profile-user-card__email">
                {user?.email || "sinhvien@vwa.vn"}
              </p>
              <span className="profile-user-card__faculty">
                {t("Khoa CNTT")} • {t("Khóa K21")}
              </span>
            </div>

            <div className="profile-user-card__wallet">
              <span>
                <Wallet size={14} />
                {t("Số dư ví ăn:")}
              </span>
              <b>185.000 ₫</b>
            </div>
          </div>

          <nav className="profile-nav">
            <button
              type="button"
              className="profile-nav__item active"
              onClick={() => {
                const el = document.getElementById("section-profile");
                if (el)
                  el.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
              }}
            >
              <div className="profile-nav__left">
                <BadgeCheck size={18} />
                <span>{t("Hồ sơ cá nhân")}</span>
              </div>
              <ChevronRight size={14} />
            </button>

            <button
              type="button"
              className="profile-nav__item"
              onClick={() => setShowThemeModal(true)}
            >
              <div className="profile-nav__left">
                <Palette size={18} />
                <span>{t("Giao diện & Trải nghiệm")}</span>
              </div>
              <span className="profile-nav__dot" />
            </button>

            <button
              type="button"
              className="profile-nav__item"
              onClick={() => setShowLangModal(true)}
            >
              <div className="profile-nav__left">
                <Globe size={18} />
                <span>{t("Ngôn ngữ & Khu vực")}</span>
              </div>
            </button>

            <button
              type="button"
              className="profile-nav__item"
              onClick={() => (window.location.href = "/customer/wallet")}
            >
              <div className="profile-nav__left">
                <CreditCard size={18} />
                <span>{t("Ví VWA & Thẻ sinh viên")}</span>
              </div>
              <span className="profile-nav__badge">PIN</span>
            </button>

            <button
              type="button"
              className="profile-nav__item"
              onClick={() => setShowNotiModal(true)}
            >
              <div className="profile-nav__left">
                <Bell size={18} />
                <span>{t("Thông báo & Giờ ca ăn")}</span>
              </div>
            </button>

            <button
              type="button"
              className="profile-nav__item"
              onClick={openPwdModal}
            >
              <div className="profile-nav__left">
                <Shield size={18} />
                <span>{t("Bảo mật 2 lớp & Mật khẩu")}</span>
              </div>
            </button>

            <div className="profile-nav__sep" />

            <button
              type="button"
              className="profile-nav__item profile-nav__item--muted"
            >
              <div className="profile-nav__left">
                <HelpCircle size={16} />
                <span>{t("Quy chế Căn tin VWA & Trợ giúp")}</span>
              </div>
            </button>
          </nav>

          <div className="profile-kitchen-status">
            <div className="profile-kitchen-status__head">
              <b>{t("Trạng thái bếp Trưa hôm nay")}</b>
              <span className="profile-kitchen-status__live">
                <span className="profile-kitchen-status__dot" />
                {t("Đang mở")}
              </span>
            </div>
            <p>
              {t("Ca ăn trưa kết thúc lúc 14:00. Bạn nên đặt món trước 15 phút để lấy số nhanh.")}
            </p>
          </div>
        </aside>

        <main className="profile-content">
          <section className="profile-section" id="section-profile">
            <div className="profile-section__head">
              <div>
                <div className="profile-section__title-row">
                  <User size={22} />
                  <h2>{t("Hồ sơ cá nhân & Nhận diện học đường")}</h2>
                </div>
                <p className="profile-section__sub">
                  {t("Dữ liệu định danh được kết nối bảo mật trực tiếp từ Cổng thông tin đào tạo Học viện Phụ nữ Việt Nam.")}
                </p>
              </div>
              <div className="profile-section__head-actions">
                <span className="profile-section__badge">
                  {t("SSO Đồng bộ")}
                </span>

                {!editing ? (
                  <button
                    type="button"
                    className="profile-btn profile-btn--primary"
                    onClick={startEdit}
                  >
                    <Pencil size={14} />
                    {t("Chỉnh sửa")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="profile-btn profile-btn--ghost"
                      onClick={cancelEdit}
                      disabled={loading}
                    >
                      <X size={14} />
                      {t("Hủy")}
                    </button>
                    <button
                      type="button"
                      className="profile-btn profile-btn--primary"
                      onClick={save}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 size={14} className="profile-spin" />
                          {t("Đang lưu...")}
                        </>
                      ) : (
                        <>
                          <Save size={14} />
                          {t("Lưu thay đổi")}
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="profile-avatar-block">
              <div className="profile-avatar-block__img-wrap">
                <div
                  className="profile-avatar-block__img"
                  style={avatarStyle}
                >
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
                <label className="profile-form-label">
                  <span>{t("Họ và tên đầy đủ")}</span>
                  <small className="profile-form-label--required">
                    {t("Bắt buộc")}
                  </small>
                </label>
                <div className="profile-form-input-wrap">
                  <User size={18} className="profile-form-input-icon" />
                  <input
                    value={form.name}
                    onChange={update("name")}
                    disabled={!editing}
                    className="profile-form-input"
                  />
                </div>
                {errors.name && (
                  <span className="profile-form-error">{errors.name}</span>
                )}
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
                  <BadgeCheck
                    size={18}
                    className="profile-form-input-icon"
                  />
                  <input
                    value={form.studentId}
                    readOnly
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
                  <select
                    value={form.faculty}
                    onChange={update("faculty")}
                    disabled={!editing}
                    className="profile-form-input profile-form-input--select"
                  >
                    <option value="">
                      {t("Công nghệ Thông tin & Truyền thông K21")}
                    </option>
                    <option value="business">
                      {t("Quản trị Kinh doanh & TMĐT K21")}
                    </option>
                    <option value="social">
                      {t("Công tác Xã hội & PT Cộng đồng K21")}
                    </option>
                    <option value="law">
                      {t("Luật Kinh tế & Dân sự K21")}
                    </option>
                    <option value="psychology">
                      {t("Tâm lý học & Giới tính K21")}
                    </option>
                  </select>
                </div>
              </div>

              <div className="profile-form-field">
                <label className="profile-form-label">
                  <span>{t("Số điện thoại nhận thông báo món")}</span>
                  <small className="profile-form-label--verified">
                    ✓ {t("Đã xác thực OTP")}
                  </small>
                </label>
                <div className="profile-form-input-wrap">
                  <Phone size={18} className="profile-form-input-icon" />
                  <input
                    value={form.phone}
                    onChange={update("phone")}
                    disabled={!editing}
                    placeholder="0988 123 456"
                    className="profile-form-input"
                  />
                </div>
                {errors.phone && (
                  <span className="profile-form-error">{errors.phone}</span>
                )}
              </div>

              <div className="profile-form-field">
                <label className="profile-form-label">
                  <span>{t("Email học viện (@vwa.edu.vn)")}</span>
                  <small className="profile-form-label--verified">
                    {t("Đã xác minh")}
                  </small>
                </label>
                <div className="profile-form-input-wrap profile-form-input-wrap--locked">
                  <Mail size={18} className="profile-form-input-icon" />
                  <input
                    value={form.email}
                    readOnly
                    className="profile-form-input"
                  />
                </div>
                {errors.email && (
                  <span className="profile-form-error">{errors.email}</span>
                )}
              </div>

              <div className="profile-form-field">
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
                        disabled={!editing}
                      />
                      <span>{g.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="profile-dietary">
              <div className="profile-dietary__head">
                <div className="profile-dietary__title">
                  <span>🍽️</span>
                  <h4>{t("Khẩu vị & Ghi chú dinh dưỡng cá nhân hóa")}</h4>
                </div>
                <span className="profile-dietary__auto">
                  {t("Tự động gắn vào đơn hàng KDS bếp")}
                </span>
              </div>
              <div className="profile-dietary__grid">
                {DIETARY_OPTIONS.map((opt) => (
                  <label key={opt.key} className="profile-dietary-card">
                    <input
                      type="checkbox"
                      checked={!!dietary[opt.key]}
                      onChange={() =>
                        setDietary((d) => ({
                          ...d,
                          [opt.key]: !d[opt.key],
                        }))
                      }
                    />
                    <div>
                      <b>{t(opt.title)}</b>
                      <p>{t(opt.desc)}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <div className="profile-save-bar">
            <div className="profile-save-bar__left">
              <div className="profile-save-bar__icon">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <b>
                  {t("Tất cả thay đổi giao diện và ngôn ngữ sẽ được lưu tự động")}
                </b>
                <p>
                  {t("Tài khoản sinh viên")} {user?.name || t("bạn")} (
                  {t("MSSV")} {form.studentId || "2151010088"}){" "}
                  {t("đồng bộ ngay lập tức trên app di động và web.")}
                </p>
              </div>
            </div>
            <div className="profile-save-bar__right">
              <button
                type="button"
                className="profile-btn profile-btn--ghost"
                onClick={() => {
                  setTheme("light");
                  setLanguage("vi");
                  setFontSize(1);
                  setDietary(DEFAULT_DIETARY);
                  setNotiPrefs(DEFAULT_NOTI_PREFS);
                  setMealSlots(DEFAULT_MEAL_SLOTS);
                  toast(t("Đã khôi phục mặc định"), "success");
                }}
              >
                {t("Khôi phục mặc định")}
              </button>
              <button
                type="button"
                className="profile-btn profile-btn--primary"
                onClick={() =>
                  toast(t("Đã áp dụng tất cả thay đổi"), "success")
                }
              >
                <Check size={16} />
                {t("Áp dụng tất cả thay đổi")}
              </button>
            </div>
          </div>
        </main>
      </div>

      <ProfileModal
        open={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        title={t("Giao diện & Trải nghiệm")}
        icon={<Palette size={20} />}
        maxWidth={760}
      >
        <div className="profile-modal-section">
          <h4 className="profile-modal-section__title">
            {t("Chế độ hiển thị (Theme Mode)")}
          </h4>
          <p className="profile-modal-section__desc">
            {t("Tùy chọn tông màu giao diện phù hợp với môi trường sử dụng hoặc tự động theo thiết bị của bạn.")}
          </p>

          <div className="profile-theme-grid">
            {THEMES.map((th) => {
              const Icon = th.icon;
              const active = theme === th.id;
              return (
                <button
                  key={th.id}
                  type="button"
                  className={`profile-theme-card ${
                    active ? "active" : ""
                  }`}
                  onClick={() => changeTheme(th.id)}
                >
                  <div
                    className={`profile-theme-preview profile-theme-preview--${th.id}`}
                  >
                    <div className="profile-theme-preview__bar" />
                    <div className="profile-theme-preview__row" />
                    <div className="profile-theme-preview__grid">
                      <div />
                      <div />
                    </div>
                  </div>
                  <div className="profile-theme-card__head">
                    <div className="profile-theme-card__title">
                      <Icon size={18} />
                      <b>{t(th.label)}</b>
                    </div>
                    {active && (
                      <span className="profile-theme-card__check">
                        <Check size={13} />
                      </span>
                    )}
                  </div>
                  <p className="profile-theme-card__desc">{t(th.desc)}</p>
                  <span
                    className={`profile-theme-card__tag ${
                      active ? "active" : ""
                    }`}
                  >
                    {active
                      ? t("Đang áp dụng")
                      : t("Chuyển sang chế độ này")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="profile-modal-section">
          <div className="profile-font-size">
            <div className="profile-font-size__head">
              <div className="profile-font-size__title">
                <Type size={18} />
                <b>{t("Kích thước phông chữ hiển thị món ăn")}</b>
              </div>
              <span className="profile-font-size__value">
                {
                  [
                    t("Tiêu chuẩn (100% - Khuyến nghị)"),
                    t("Vừa (Dễ nhìn)"),
                    t("Lớn (Đọc nhanh)"),
                  ][fontSize - 1]
                }
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={3}
              value={fontSize}
              onChange={(e) =>
                setFontSize(parseInt(e.target.value, 10))
              }
              className="profile-font-size__slider"
            />
            <div className="profile-font-size__labels">
              <span className={fontSize === 1 ? "active" : ""}>
                {t("Tiêu chuẩn (Gọn gàng)")}
              </span>
              <span className={fontSize === 2 ? "active" : ""}>
                {t("Vừa (Dễ nhìn)")}
              </span>
              <span className={fontSize === 3 ? "active" : ""}>
                {t("Lớn (Đọc nhanh)")}
              </span>
            </div>
            <p className="profile-font-size__note">
              {t("Tăng cỡ chữ giúp bạn dễ dàng đọc tên món, thành phần dị ứng và mức giá khi xếp hàng đặt món tại căng tin.")}
            </p>
          </div>
        </div>

        <div className="profile-modal__actions">
          <button
            type="button"
            className="profile-btn profile-btn--ghost"
            onClick={() => setShowThemeModal(false)}
          >
            {t("Đóng")}
          </button>
          <button
            type="button"
            className="profile-btn profile-btn--primary"
            onClick={() => {
              setShowThemeModal(false);
              toast(t("Đã áp dụng giao diện"), "success");
            }}
          >
            <Check size={16} />
            {t("Áp dụng")}
          </button>
        </div>
      </ProfileModal>

      <ProfileModal
        open={showLangModal}
        onClose={() => setShowLangModal(false)}
        title={t("Ngôn ngữ giao diện & Khu vực")}
        icon={<Globe size={20} />}
        maxWidth={720}
      >
        <div className="profile-modal-section">
          <h4 className="profile-modal-section__title">
            {t("Chọn ngôn ngữ hiển thị")}
          </h4>
          <p className="profile-modal-section__desc">
            {t("Áp dụng cho toàn bộ cổng thông tin Canteen VWA, hóa đơn điện tử và thông báo đẩy.")}
          </p>

          <div className="profile-lang-grid">
            {LANGUAGES.map((l) => {
              const active = language === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  className={`profile-lang-card ${
                    active ? "active" : ""
                  }`}
                  onClick={() => changeLanguage(l.code)}
                >
                  <div className="profile-lang-card__top">
                    <span className="profile-lang-card__flag">
                      {l.flag}
                    </span>
                    {active && (
                      <span className="profile-lang-card__check">
                        <Check size={13} />
                      </span>
                    )}
                  </div>
                  <div className="profile-lang-card__body">
                    <b>{l.name}</b>
                    <span>{l.sub}</span>
                  </div>
                  <span
                    className={`profile-lang-card__tag ${
                      active ? "active" : ""
                    }`}
                  >
                    {active ? t("Đang chọn") : t("Chuyển đổi")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="profile-modal-section">
          <div className="profile-region-grid">
            <div className="profile-form-field">
              <label className="profile-form-label">
                <span>{t("Định dạng tiền tệ")}</span>
              </label>
              <div className="profile-form-input-wrap">
                <span className="profile-form-input-icon">💰</span>
                <select className="profile-form-input profile-form-input--select">
                  <option>VNĐ (₫) - {t("Đồng Việt Nam")}</option>
                  <option>USD ($) - {t("Đô la Mỹ")}</option>
                </select>
              </div>
            </div>

            <div className="profile-form-field">
              <label className="profile-form-label">
                <span>{t("Định dạng ngày & giờ")}</span>
              </label>
              <div className="profile-form-input-wrap">
                <span className="profile-form-input-icon">📅</span>
                <select className="profile-form-input profile-form-input--select">
                  <option>DD/MM/YYYY (24h) - {t("Chuẩn VN")}</option>
                  <option>MM/DD/YYYY (12h AM/PM)</option>
                  <option>YYYY-MM-DD (ISO 8601)</option>
                </select>
              </div>
            </div>

            <div className="profile-form-field">
              <label className="profile-form-label">
                <span>{t("Múi giờ hệ thống")}</span>
              </label>
              <div className="profile-form-input-wrap">
                <span className="profile-form-input-icon">🕐</span>
                <select className="profile-form-input profile-form-input--select">
                  <option>
                    (GMT+07:00) {t("Giờ Hà Nội / Băng Cốc")}
                  </option>
                  <option>(GMT+08:00) Singapore / Đài Bắc</option>
                  <option>(GMT+09:00) Seoul / Tokyo</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="profile-modal__actions">
          <button
            type="button"
            className="profile-btn profile-btn--ghost"
            onClick={() => setShowLangModal(false)}
          >
            {t("Đóng")}
          </button>
          <button
            type="button"
            className="profile-btn profile-btn--primary"
            onClick={() => {
              setShowLangModal(false);
              toast(t("Đã áp dụng ngôn ngữ"), "success");
            }}
          >
            <Check size={16} />
            {t("Áp dụng")}
          </button>
        </div>
      </ProfileModal>

      <ProfileModal
        open={showNotiModal}
        onClose={() => setShowNotiModal(false)}
        title={t("Thông báo & Giờ ca ăn")}
        icon={<Bell size={20} />}
        maxWidth={640}
      >
        <div className="profile-modal-section">
          <h4 className="profile-modal-section__title">
            {t("Loại thông báo bạn muốn nhận")}
          </h4>
          <p className="profile-modal-section__desc">
            {t("Chọn những loại thông báo bạn quan tâm — hệ thống sẽ không làm phiền bạn với các thông báo khác.")}
          </p>

          <div className="profile-noti-list">
            {[
              {
                key: "orderReady",
                title: t("Món đã sẵn sàng"),
                desc: t(
                  "Nhận ngay khi đầu bếp hoàn thành món và bạn có thể đến quầy nhận."
                ),
              },
              {
                key: "orderStatus",
                title: t("Trạng thái đơn hàng"),
                desc: t(
                  "Thông báo khi đơn chuyển sang: Đã xác nhận → Đang chuẩn bị → Hoàn thành."
                ),
              },
              {
                key: "promotion",
                title: t("Khuyến mãi & Ưu đãi"),
                desc: t(
                  "Nhận voucher mới, Flash Sale ca trưa, combo trợ giá sinh viên."
                ),
              },
              {
                key: "wallet",
                title: t("Biến động Ví Canteen"),
                desc: t(
                  "Thông báo khi ví được nạp, trừ tiền, hoàn tiền hoặc trợ giá."
                ),
              },
            ].map((item) => (
              <label key={item.key} className="profile-noti-item">
                <input
                  type="checkbox"
                  checked={!!notiPrefs[item.key]}
                  onChange={() =>
                    setNotiPrefs((p) => ({
                      ...p,
                      [item.key]: !p[item.key],
                    }))
                  }
                />
                <div className="profile-noti-item__body">
                  <b>{item.title}</b>
                  <p>{item.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="profile-modal-section">
          <h4 className="profile-modal-section__title">
            {t("Kiểu nhắc nhở")}
          </h4>
          <div className="profile-noti-inline">
            <label className="profile-noti-item profile-noti-item--inline">
              <input
                type="checkbox"
                checked={!!notiPrefs.sound}
                onChange={() =>
                  setNotiPrefs((p) => ({ ...p, sound: !p.sound }))
                }
              />
              <div className="profile-noti-item__body">
                <b>{t("Âm thanh thông báo")}</b>
                <p>
                  {t(
                    "Phát tiếng 'ting' khi có tin nhắn hoặc đơn mới."
                  )}
                </p>
              </div>
            </label>

            <label className="profile-noti-item profile-noti-item--inline">
              <input
                type="checkbox"
                checked={!!notiPrefs.vibration}
                onChange={() =>
                  setNotiPrefs((p) => ({
                    ...p,
                    vibration: !p.vibration,
                  }))
                }
              />
              <div className="profile-noti-item__body">
                <b>{t("Rung thiết bị")}</b>
                <p>
                  {t(
                    "Rung nhẹ khi có thông báo (chỉ hoạt động trên app di động)."
                  )}
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="profile-modal-section">
          <h4 className="profile-modal-section__title">
            {t("Giờ ca ăn ưa thích")}
          </h4>
          <p className="profile-modal-section__desc">
            {t("Chọn khung giờ bạn thường đặt món — hệ thống sẽ gợi ý thực đơn và nhắc bạn trước giờ ăn.")}
          </p>

          <div className="profile-mealslot-grid">
            {[
              {
                key: "breakfast",
                label: t("Ca sáng"),
                time: "06:30 - 10:30",
                icon: "🌅",
              },
              {
                key: "lunch",
                label: t("Ca trưa"),
                time: "11:00 - 14:00",
                icon: "🍚",
              },
              {
                key: "dinner",
                label: t("Ca tối"),
                time: "16:30 - 19:30",
                icon: "🌙",
              },
            ].map((meal) => {
              const active = !!mealSlots[meal.key];
              return (
                <button
                  key={meal.key}
                  type="button"
                  className={`profile-mealslot-card ${
                    active ? "active" : ""
                  }`}
                  onClick={() =>
                    setMealSlots((s) => ({
                      ...s,
                      [meal.key]: !s[meal.key],
                    }))
                  }
                >
                  <span className="profile-mealslot-card__icon">
                    {meal.icon}
                  </span>
                  <div className="profile-mealslot-card__body">
                    <b>{meal.label}</b>
                    <span>{meal.time}</span>
                  </div>
                  {active && (
                    <span className="profile-mealslot-card__check">
                      <Check size={13} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="profile-noti-time">
            <label className="profile-noti-time__label">
              {t("Nhắc tôi trước giờ ăn:")}
            </label>
            <select
              value={mealSlots.notifyBefore}
              onChange={(e) =>
                setMealSlots((s) => ({
                  ...s,
                  notifyBefore: parseInt(e.target.value, 10),
                }))
              }
              className="profile-noti-time__select"
            >
              <option value={5}>{t("5 phút trước")}</option>
              <option value={10}>{t("10 phút trước")}</option>
              <option value={15}>{t("15 phút trước")}</option>
              <option value={30}>{t("30 phút trước")}</option>
              <option value={60}>{t("1 giờ trước")}</option>
            </select>
          </div>
        </div>

        <div className="profile-modal__actions">
          <button
            type="button"
            className="profile-btn profile-btn--ghost"
            onClick={() => setShowNotiModal(false)}
          >
            {t("Đóng")}
          </button>
          <button
            type="button"
            className="profile-btn profile-btn--primary"
            onClick={() => {
              setShowNotiModal(false);
              toast(t("Đã lưu cài đặt thông báo"), "success");
            }}
          >
            <Check size={16} />
            {t("Lưu cài đặt")}
          </button>
        </div>
      </ProfileModal>

      <ProfileModal
        open={showPwdModal}
        onClose={closePwdModal}
        title={t("Đổi mật khẩu")}
        icon={<Lock size={20} />}
        maxWidth={440}
      >
        {pwdError && (
          <div className="profile-modal__error">{pwdError}</div>
        )}

        <label className="profile-modal__label">
          {t("Mật khẩu hiện tại")}
        </label>
        <div className="profile-modal__input-wrap">
          <Lock size={16} />
          <input
            type={showPwd ? "text" : "password"}
            value={pwdForm.currentPassword}
            onChange={(e) =>
              setPwdForm((f) => ({
                ...f,
                currentPassword: e.target.value,
              }))
            }
            placeholder={t("Nhập mật khẩu hiện tại")}
            disabled={pwdLoading}
          />
        </div>

        <label className="profile-modal__label">
          {t("Mật khẩu mới")}
        </label>
        <div className="profile-modal__input-wrap">
          <KeyRound size={16} />
          <input
            type={showPwd ? "text" : "password"}
            value={pwdForm.newPassword}
            onChange={(e) =>
              setPwdForm((f) => ({
                ...f,
                newPassword: e.target.value,
              }))
            }
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

        <label className="profile-modal__label">
          {t("Xác nhận mật khẩu mới")}
        </label>
        <div className="profile-modal__input-wrap">
          <Check size={16} />
          <input
            type={showPwd ? "text" : "password"}
            value={pwdForm.confirmPassword}
            onChange={(e) =>
              setPwdForm((f) => ({
                ...f,
                confirmPassword: e.target.value,
              }))
            }
            placeholder={t("Nhập lại mật khẩu mới")}
            disabled={pwdLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter") changePassword();
            }}
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
            ) : (
              t("Đổi mật khẩu")
            )}
          </button>
        </div>
      </ProfileModal>

      <style>{`
        @keyframes profile-spin-anim {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .profile-spin { animation: profile-spin-anim 1s linear infinite; }

        /* 🔧 FIX #31: KHÔNG set html { font-size } ở đây — CSS toàn cục
           (styles.css hoặc styles-customer.css) chịu trách nhiệm apply
           biến --app-font-scale. Chỉ set biến, KHÔNG override font-size. */
      `}</style>
    </div>
  );
}