// ============================================================
// CARDHOVEREFFECT.JSX — Hiệu ứng hover theo vị trí chuột
// ============================================================
// Không có text → KHÔNG cần i18n.
// ============================================================

import { useEffect } from "react";

const CARD_SELECTOR = ".food-card-clickable, .menu-item-card";

export default function CardHoverEffect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const hasHover = window.matchMedia("(hover: hover)").matches;
    if (!hasHover) return;

    let rafId = null;
    let lastEvent = null;
    let activeCard = null;

    const updateCard = () => {
      rafId = null;

      const e = lastEvent;
      if (!e) return;

      const target = e.target;
      if (!target || typeof target.closest !== "function") return;

      const card = target.closest(CARD_SELECTOR);

      if (activeCard && activeCard !== card) {
        activeCard.style.removeProperty("--mouse-x");
        activeCard.style.removeProperty("--mouse-y");
      }

      if (!card) {
        activeCard = null;
        return;
      }

      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      card.style.setProperty("--mouse-x", `${x}%`);
      card.style.setProperty("--mouse-y", `${y}%`);

      activeCard = card;
    };

    const onPointerMove = (e) => {
      lastEvent = e;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(updateCard);
    };

    const onPointerLeave = () => {
      if (activeCard) {
        activeCard.style.removeProperty("--mouse-x");
        activeCard.style.removeProperty("--mouse-y");
        activeCard = null;
      }
      lastEvent = null;
    };

    document.addEventListener("pointermove", onPointerMove, {
      passive: true,
    });
    document.addEventListener("pointerleave", onPointerLeave, {
      passive: true,
    });

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return null;
}