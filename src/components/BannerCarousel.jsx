// ============================================================
// BANNERCAROUSEL.JSX — Carousel banner khuyến mãi (Customer)
// ============================================================
// V2 (2026-10):
//   - ✅ FIX #10: Fallback cho slide.buttonText khi undefined
//     → nút không còn trống nếu ai đó truyền slide thiếu field
//   - Giữ nguyên: FIX #55 (reset index khi slides đổi),
//     auto-play 4s, pause on hover/tab-hidden, i18n, anchor scroll
// ============================================================

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Utensils,
  Gift,
  Sparkles,
  Zap,
} from "lucide-react";
import { bannerSlides, DEFAULT_BANNER_OVERLAY } from "../bannerSlides";
import { useI18n } from "../hooks/useI18n";

const AUTO_INTERVAL = 4000;
const TRANSITION_MS = 500;
const DEFAULT_BUTTON_TEXT = "Xem thêm";

function renderChipIcon(name, size = 13) {
  switch (name) {
    case "clock":
      return <Clock size={size} />;
    case "utensils":
      return <Utensils size={size} />;
    case "gift":
      return <Gift size={size} />;
    case "sparkles":
      return <Sparkles size={size} />;
    default:
      return <Zap size={size} />;
  }
}

export default function BannerCarousel({ slides = bannerSlides }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" || !document.hidden
  );

  const timerRef = useRef(null);
  const total = slides?.length || 0;

  const slidesSignature = useMemo(
    () =>
      Array.isArray(slides)
        ? slides.map((s) => s?.id ?? "").join("|")
        : "",
    [slides]
  );

  useEffect(() => {
    setIndex(0);
  }, [slidesSignature]);

  const restartTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (paused || !tabVisible || total <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % total);
    }, AUTO_INTERVAL);
  }, [paused, tabVisible, total]);

  useEffect(() => {
    restartTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [restartTimer]);

  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const goTo = (i) => {
    if (total === 0) return;
    setIndex(((i % total) + total) % total);
    restartTimer();
  };
  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1);

  if (total === 0) {
    return (
      <div
        className="banner-carousel"
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: 180,
          marginBottom: 22,
          color: "var(--text-light, #8993a3)",
          fontSize: 13,
          background: "var(--bg-tertiary, #f5f7fa)",
          borderRadius: 16,
        }}
      >
        {t("Không có banner")}
      </div>
    );
  }

  return (
    <div
      className="banner-carousel"
      role="region"
      aria-label={t("Banner khuyến mãi")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 4.5",
        minHeight: 180,
        maxHeight: 280,
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 22,
        background: "#0f172a",
      }}
    >
      <div
        style={{
          display: "flex",
          width: `${total * 100}%`,
          height: "100%",
          maxWidth: "none",
          transform: `translateX(-${index * (100 / total)}%)`,
          transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
      >
        {slides.map((s, i) => (
          <Slide key={s.id || i} slide={s} isActive={i === index} />
        ))}
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label={t("Slide trước")}
            className="banner-nav banner-nav-left"
            style={{
              position: "absolute",
              top: "50%",
              left: 16,
              transform: "translateY(-50%)",
              zIndex: 10,
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: 0,
              background: "rgba(255,255,255,0.9)",
              color: "#0f172a",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              opacity: 0.85,
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={t("Slide tiếp theo")}
            className="banner-nav banner-nav-right"
            style={{
              position: "absolute",
              top: "50%",
              right: 16,
              transform: "translateY(-50%)",
              zIndex: 10,
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: 0,
              background: "rgba(255,255,255,0.9)",
              color: "#0f172a",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              opacity: 0.85,
            }}
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      {total > 1 && (
        <div
          role="tablist"
          aria-label={t("Chọn slide")}
          className="banner-dots"
          style={{
            position: "absolute",
            bottom: 16,
            left: 0,
            right: 0,
            zIndex: 10,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {slides.map((s, i) => {
            const active = i === index;
            return (
              <button
                key={s.id || i}
                type="button"
                onClick={() => goTo(i)}
                role="tab"
                aria-selected={active}
                aria-label={t("Đi đến slide {n}", { n: i + 1 })}
                style={{
                  width: active ? 28 : 10,
                  height: 10,
                  borderRadius: 20,
                  border: "2px solid rgba(255,255,255,0.6)",
                  background: active ? "#ffffff" : "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                  padding: 0,
                  pointerEvents: "auto",
                  transition: "all 0.3s ease",
                  boxShadow: active
                    ? "0 2px 12px rgba(255,255,255,0.6)"
                    : "0 2px 6px rgba(0,0,0,0.3)",
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SLIDE
// ============================================================

function Slide({ slide, isActive }) {
  const { t } = useI18n();
  const [linkHover, setLinkHover] = useState(false);

  const overlay = slide.overlay || DEFAULT_BANNER_OVERLAY;
  const isAnchor =
    typeof slide.buttonLink === "string" && slide.buttonLink.startsWith("#");

  const handleCtaClick = (e) => {
    if (!isAnchor) return;
    e.preventDefault();
    const el = document.getElementById(slide.buttonLink.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ✅ FIX #10: Fallback cho buttonText và buttonLink
  const safeButtonText = slide.buttonText || DEFAULT_BUTTON_TEXT;
  const safeButtonLink = slide.buttonLink || "#";

  return (
    <div
      role="group"
      aria-hidden={!isActive}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        flexShrink: 0,
        backgroundImage: `url(${slide.image})`,
        backgroundColor: "#0f172a",
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        padding: "0 70px",
        boxSizing: "border-box",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: overlay,
          zIndex: 1,
        }}
      />

      <div
        className="banner-content"
        style={{ maxWidth: 680, position: "relative", zIndex: 2 }}
      >
        {slide.badge && (
          <span
            className="banner-badge"
            style={{
              display: "inline-block",
              background: "rgba(245, 158, 11, 0.3)",
              border: "1px solid rgba(245, 158, 11, 0.6)",
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: 12,
              color: "#fff",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            {t(slide.badge)}
          </span>
        )}

        <h2
          className="banner-title"
          style={{
            fontSize: 30,
            fontWeight: 800,
            margin: "6px 0 10px",
            color: "#fff",
            lineHeight: 1.2,
            letterSpacing: "-0.5px",
            textShadow: "0 2px 10px rgba(0,0,0,0.5)",
          }}
        >
          {t(slide.title)}
        </h2>

        <p
          className="banner-desc"
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            opacity: 0.95,
            margin: "0 0 16px",
            color: "#e5e7eb",
            maxWidth: 620,
            textShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }}
        >
          {t(slide.description)}
        </p>

        {slide.chips && slide.chips.length > 0 && (
          <div
            className="banner-chips"
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 18,
              alignItems: "center",
            }}
          >
            {slide.chips.map((c, i) => (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  color: "#fff",
                }}
              >
                {renderChipIcon(c.icon)}
                {t(c.text)}
              </span>
            ))}
          </div>
        )}

        <Link
          to={safeButtonLink}
          className="banner-btn"
          tabIndex={isActive ? 0 : -1}
          onClick={handleCtaClick}
          onMouseEnter={() => setLinkHover(true)}
          onMouseLeave={() => setLinkHover(false)}
          style={{
            display: "inline-block",
            background: "#fff",
            color: "#2634d5",
            padding: "12px 28px",
            borderRadius: 24,
            fontWeight: 700,
            fontSize: 13.5,
            textDecoration: "none",
            transition: "all 0.25s ease",
            boxShadow: linkHover
              ? "0 12px 32px rgba(0,0,0,0.4)"
              : "0 6px 24px rgba(0,0,0,0.3)",
            transform: linkHover ? "translateY(-3px)" : "translateY(0)",
          }}
        >
          {t(safeButtonText)}
        </Link>
      </div>
    </div>
  );
}