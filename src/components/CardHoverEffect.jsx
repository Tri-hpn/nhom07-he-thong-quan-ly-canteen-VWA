// ============================================================
// CARDHOVEREFFECT.JSX — Hiệu ứng hover theo vị trí chuột (V3 - FIXED)
// ============================================================
// V3 (2026-10):
//   - 🔧 FIX #57: Bỏ listener "pointerleave" trên document
//                 (event này không bubble và không tồn tại trên document).
//                 Thay bằng:
//                   - "pointerout" với check relatedTarget === null
//                   - "mouseleave" trên window
//                   - "blur" trên window
//   - Giữ nguyên logic m4 selector
// ============================================================

import { useEffect } from "react";

const CARD_SELECTOR = [
  ".home-flash-card",
  ".menu-food-card",
  ".menu-food-card--list",
  ".grab-food-card",
].join(", ");

const EXCLUDE_ATTR = "data-no-hover";

export default function CardHoverEffect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const hasHover = window.matchMedia("(hover: hover)").matches;
    if (!hasHover) return;

    let rafId = null;
    let lastEvent = null;
    let activeCard = null;

    const resetCard = (card) => {
      if (!card) return;
      card.style.removeProperty("--mouse-x");
      card.style.removeProperty("--mouse-y");
    };

    const updateCard = () => {
      rafId = null;

      const e = lastEvent;
      if (!e) return;

      const target = e.target;
      if (!target || typeof target.closest !== "function") return;

      const card = target.closest(CARD_SELECTOR);

      if (card && card.hasAttribute(EXCLUDE_ATTR)) {
        if (activeCard && activeCard !== card) resetCard(activeCard);
        activeCard = null;
        return;
      }

      if (activeCard && activeCard !== card) {
        resetCard(activeCard);
      }

      if (!card) {
        activeCard = null;
        return;
      }

      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));

      card.style.setProperty("--mouse-x", `${clampedX}%`);
      card.style.setProperty("--mouse-y", `${clampedY}%`);

      activeCard = card;
    };

    const onPointerMove = (e) => {
      lastEvent = e;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(updateCard);
    };

    // 🔧 FIX #57: Dùng pointerout + check relatedTarget
    // (pointerleave trên document không hoạt động vì event không bubble tới document)
    const onPointerOut = (e) => {
      // Nếu relatedTarget === null → chuột rời window
      if (e.relatedTarget === null) {
        if (activeCard) {
          resetCard(activeCard);
          activeCard = null;
        }
        lastEvent = null;
      }
    };

    // 🔧 FIX #57: Bổ sung mouseleave trên window (safety net)
    const onMouseLeave = () => {
      if (activeCard) {
        resetCard(activeCard);
        activeCard = null;
      }
      lastEvent = null;
    };

    const onBlur = () => {
      if (activeCard) {
        resetCard(activeCard);
        activeCard = null;
      }
      lastEvent = null;
    };

    const onScroll = () => {
      if (activeCard) {
        resetCard(activeCard);
        activeCard = null;
      }
    };

    document.addEventListener("pointermove", onPointerMove, {
      passive: true,
    });
    document.addEventListener("pointerout", onPointerOut, {
      passive: true,
    });
    window.addEventListener("mouseleave", onMouseLeave, { passive: true });
    window.addEventListener("blur", onBlur, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll);

      if (rafId !== null) cancelAnimationFrame(rafId);
      if (activeCard) resetCard(activeCard);
    };
  }, []);

  return null;
}