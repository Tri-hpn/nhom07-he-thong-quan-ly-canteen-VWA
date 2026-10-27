// ============================================================
// FOOTER.JSX — Footer toàn cục
// ============================================================

import { useEffect, useState, useMemo } from "react";
import { LogoVWACompact } from "./LogoVWA";
import {
  Phone, Mail, MapPin, Facebook, Youtube, Instagram, Send, Globe,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../hooks/useI18n";

const SOCIALS = [
  { Icon: Facebook,  href: "https://facebook.com/",  label: "Facebook", color: "#1877F2" },
  { Icon: Instagram, href: "https://instagram.com/", label: "Instagram", color: "#E4405F" },
  { Icon: Youtube,   href: "https://youtube.com/",   label: "YouTube",  color: "#FF0000" },
  { Icon: Send,      href: "https://t.me/",          label: "Telegram", color: "#0088CC" },
  { Icon: Globe,     href: "https://vwa.vn/",        label: "Website",  color: "#20c779" },
];

const EMPTY_CONTACT = {
  hotline: "1900 6868",
  email: "ADMIN@VWA.VN",
  address: "68 Nguyễn Chí Thanh, P. Láng, Hà Nội",
};

export default function Footer() {
  const { t } = useI18n();

  const openHelpPolicy = () =>
    window.dispatchEvent(new Event("canteen:open-help-policy"));

  const handlePolicyKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openHelpPolicy();
    }
  };
  const [contact, setContact] = useState(EMPTY_CONTACT);

  useEffect(() => {
    let cancelled = false;

    api.settings
      .get()
      .then((s) => {
        if (cancelled || !s) return;
        setContact({
          hotline: "1900 6868",
          email: s.email?.trim() || EMPTY_CONTACT.email,
          address: s.address?.trim() || EMPTY_CONTACT.address,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const hasHotline = !!contact.hotline;
  const hasEmail = !!contact.email;
  const hasAddress = !!contact.address;

  const mapsUrl = useMemo(() => {
    if (!contact.address) return "";
    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(contact.address)
    );
  }, [contact.address]);

  const mapsEmbedUrl = useMemo(() => {
    if (!contact.address) return "";
    return (
      "https://www.google.com/maps?q=" +
      encodeURIComponent(contact.address) +
      "&output=embed"
    );
  }, [contact.address]);

  const telHref = useMemo(() => {
    if (!contact.hotline) return "";
    const cleaned = contact.hotline.replace(/[^\d+]/g, "");
    return `tel:${cleaned}`;
  }, [contact.hotline]);

  const renderContact = (
    { has, href, icon, labelKey, value, external }
  ) => {
    if (has) {
      return (
        <a
          href={href}
          {...(external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className="footer-contact-item"
          title={t(labelKey) + ": " + value}
        >
          {icon}
          <div>
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: "var(--text-light, #8993a3)",
                marginBottom: 2,
              }}
            >
              {t(labelKey)}
            </span>
            <b>{value}</b>
          </div>
        </a>
      );
    }
    return (
      <div className="footer-contact-item" style={{ opacity: 0.6 }}>
        {icon}
        <div>
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: "var(--text-light, #8993a3)",
              marginBottom: 2,
            }}
          >
            {t(labelKey)}
          </span>
          <b style={{ fontStyle: "italic", fontWeight: 500 }}>
            {t("Đang cập nhật")}
          </b>
        </div>
      </div>
    );
  };

  return (
    <footer className="app-footer">
      <div className="footer-grid footer-grid--four-col">
  {/* COT 1: VE CHUNG TOI */}
  <div className="footer-col footer-about-col">
    <div className="footer-brand">
      <LogoVWACompact size={40} className="footer-logo" />
      <div>
        <b>CANTEEN VWA</b>
        <small className="footer-brand__subtitle">HỌC VIỆN PHỤ NỮ VIỆT NAM</small>
      </div>
    </div>

    <p className="footer-desc">
      {t("Hệ thống quản lý căng tin thông minh dành cho Học viện Phụ nữ Việt Nam: đặt món trước, nhận đúng ca, không phải xếp hàng.")}
    </p>

    {renderContact({
      has: hasAddress,
      href: mapsUrl,
      icon: <MapPin size={14} />,
      labelKey: "Địa chỉ cửa hàng",
      value: contact.address,
      external: true,
    })}

    <div className="footer-hours">
  <div className="footer-hours__label">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
    <span>{t("Giờ mở cửa")}</span>
  </div>
  <b>06:00 - 18:30</b>
</div>
  </div>

  {/* COT 2: DANH MUC MON */}
  <div className="footer-col">
    <h4 className="footer-heading">{t("Danh mục món")}</h4>
    <nav className="footer-menu-links" aria-label={t("Danh mục món")}>
      <Link to="/customer/menu">{t("Món bán chạy")}</Link>
      <Link to="/customer/menu">{t("Khai vị & Salad")}</Link>
      <Link to="/customer/menu">{t("Món chính")}</Link>
      <Link to="/customer/menu">{t("Đồ uống & Tráng miệng")}</Link>
      <Link to="/customer/menu">{t("Combo ưu đãi")}</Link>
    </nav>
  </div>

  {/* COT 3: CHINH SACH */}
  <div className="footer-col">
    <h4 className="footer-heading">{t("Chính sách")}</h4>
    <div className="footer-menu-links">
      <span role="button" tabIndex={0} onClick={openHelpPolicy} onKeyDown={handlePolicyKeyDown} style={{ cursor: "pointer" }}>{t("Quy định nhận món")}</span>
      <span role="button" tabIndex={0} onClick={openHelpPolicy} onKeyDown={handlePolicyKeyDown} style={{ cursor: "pointer" }}>{t("Hủy đơn & hoàn tiền")}</span>
      <span role="button" tabIndex={0} onClick={openHelpPolicy} onKeyDown={handlePolicyKeyDown} style={{ cursor: "pointer" }}>{t("Quy chế sử dụng dịch vụ")}</span>
      <span role="button" tabIndex={0} onClick={openHelpPolicy} onKeyDown={handlePolicyKeyDown} style={{ cursor: "pointer" }}>{t("Bảo mật tài khoản & thông tin")}</span>
    </div>
  </div>

  {/* COT 4: LIEN HE + SOCIAL */}
  <div className="footer-col footer-contact-social-col">
    <h4 className="footer-heading">{t("Liên hệ & Đặt hàng")}</h4>

    {renderContact({
      has: hasHotline,
      href: telHref,
      icon: <Phone size={14} />,
      labelKey: "Hotline",
      value: contact.hotline,
    })}

    {renderContact({
      has: hasEmail,
      href: `mailto:${contact.email}`,
      icon: <Mail size={14} />,
      labelKey: "Email",
      value: contact.email,
    })}

    <div className="footer-socials">
      {SOCIALS.map(({ Icon, href, label, color }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={label}
          aria-label={label}
          className="footer-social"
          style={{ "--social-color": color }}
        >
          <Icon size={15} />
        </a>
      ))}
    </div>

  </div>
</div>

      <div className="footer-copyright">
        © {new Date().getFullYear()} Canteen VWA ·{" "}
        {t("Hệ thống quản lý căng tin thông minh.")}
      </div>
    </footer>
  );
}