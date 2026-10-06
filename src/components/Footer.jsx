// ============================================================
// FOOTER.JSX — Footer toàn cục
// ============================================================

import { useEffect, useState, useMemo } from "react";
import { LogoVWACompact } from "./LogoVWA";
import {
  Phone, Mail, MapPin, Facebook, Youtube, Instagram, Send, Globe,
} from "lucide-react";
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
  hotline: "",
  email: "",
  address: "",
};

export default function Footer() {
  const { t } = useI18n();
  const [contact, setContact] = useState(EMPTY_CONTACT);

  useEffect(() => {
    let cancelled = false;

    api.settings
      .get()
      .then((s) => {
        if (cancelled || !s) return;
        setContact({
          hotline: s.hotline?.trim() || "",
          email: s.email?.trim() || "",
          address: s.address?.trim() || "",
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
      <div className="footer-grid">
        {/* CỘT 1: BRAND */}
        <div className="footer-col">
          <div className="footer-brand">
            <LogoVWACompact size={40} className="footer-logo" />
            <div>
              <b>CANTEEN VWA</b>
              <small>SMART MANAGEMENT</small>
            </div>
          </div>
          <p className="footer-desc">
            {t(
              "Hệ thống quản lý căng tin thông minh dành cho Học viện Phụ nữ Việt Nam: đặt món trước, nhận đúng ca, không phải xếp hàng."
            )}
          </p>
        </div>

        {/* CỘT 2: LIÊN HỆ */}
        <div className="footer-col">
          <h4 className="footer-heading">{t("Liên hệ Canteen VWA")}</h4>

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

          {renderContact({
            has: hasAddress,
            href: mapsUrl,
            icon: <MapPin size={14} />,
            labelKey: "Địa chỉ",
            value: contact.address,
            external: true,
          })}
        </div>

        {/* CỘT 3: SOCIAL + MAP */}
        <div className="footer-col footer-col-social-map">
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

          {hasAddress ? (
            <div className="footer-map" style={{ position: "relative" }}>
              <iframe
                title={t("Bản đồ tới Canteen VWA — {address}", {
                  address: contact.address,
                })}
                src={mapsEmbedUrl}
                width="100%"
                height="100%"
                style={{
                  border: 0,
                  display: "block",
                  pointerEvents: "none",
                }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                tabIndex={-1}
              />

              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("Mở trong Google Maps")}
                style={{
                  position: "absolute",
                  inset: 0,
                  cursor: "pointer",
                  textDecoration: "none",
                }}
              />
            </div>
          ) : (
            <div
              className="footer-map"
              style={{
                display: "grid",
                placeItems: "center",
                color: "var(--text-light, #8993a3)",
                fontSize: 12,
                fontStyle: "italic",
              }}
            >
              {t("Đang cập nhật địa chỉ")}
            </div>
          )}
        </div>
      </div>

      <div className="footer-copyright">
        © {new Date().getFullYear()} Canteen VWA ·{" "}
        {t("Hệ thống quản lý căng tin thông minh.")}
      </div>
    </footer>
  );
}