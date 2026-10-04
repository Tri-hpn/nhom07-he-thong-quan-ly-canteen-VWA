// ============================================================
// EFFECTS.JSX — Hiệu ứng toàn cục + Toast system (V2)
// ============================================================
// ✅ TOAST DUY NHẤT 1 KIỂU: CARD (giống ConfirmDialog, không nút)
//    - Mọi toast(msg, type) đều render dạng card trắng
//    - Icon tròn màu theo type, tiêu đề + mô tả tuỳ chọn
//    - Auto-dismiss sau 3s, có thể truyền options.duration
// ============================================================

import { useEffect } from "react";

export function CursorGlow() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;

    const hasHover = window.matchMedia("(hover: hover)").matches;
    if (!hasHover) return;

    const el = document.createElement("div");
    el.className = "cursor-glow";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);

    let rafId = null;
    let lastX = 0;
    let lastY = 0;

    const applyPosition = () => {
      rafId = null;
      el.style.transform = `translate3d(${lastX}px, ${lastY}px, 0)`;
    };

    const move = (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(applyPosition);
    };

    window.addEventListener("mousemove", move, { passive: true });

    return () => {
      window.removeEventListener("mousemove", move);
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.remove();
    };
  }, []);

  return null;
}

export function BgParticles() {
  return <div className="bg-particles" aria-hidden="true" />;
}

// ============================================================
// CONSTANTS
// ============================================================

const TOAST_CONTAINER_ID = "toast-container";
const TOAST_MAX = 5;
const DEFAULT_DURATION = 3000;
const ANIMATION_OUT_MS = 200;

const ICONS = {
  success:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

const CARD_ACCENT = {
  success: { color: "#18a967", soft: "rgba(24, 169, 103, 0.12)" },
  error:   { color: "#ef4444", soft: "rgba(239, 68, 68, 0.12)" },
  warning: { color: "#f59e0b", soft: "rgba(245, 158, 11, 0.14)" },
  info:    { color: "#2634d5", soft: "rgba(38, 52, 213, 0.10)" },
};

// ============================================================
// HELPERS
// ============================================================

function getContainer() {
  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = TOAST_CONTAINER_ID;
    container.className = "toast-container";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

function dismissToast(el) {
  if (!el || el.dataset.dismissed === "1") return;
  el.dataset.dismissed = "1";

  el.classList.add("toast-exit");
  setTimeout(() => {
    el.remove();
  }, ANIMATION_OUT_MS);
}

// ============================================================
// TOAST — CHỈ 1 KIỂU: CARD
// ============================================================
// Cách dùng:
//   toast("Đã lưu!", "success")
//   toast("Đã lưu!", "success", { title: "Thành công", description: "..." })
//   toast("Sai mật khẩu", "error", { duration: 4000 })
// ============================================================

export function toast(message, type = "info", options = {}) {
  if (typeof document === "undefined") return;
  if (!message) return;

  const safeType = ["success", "error", "info", "warning"].includes(type)
    ? type
    : "info";

  const accent = CARD_ACCENT[safeType];
  const duration = Math.max(1000, options.duration || DEFAULT_DURATION);

  const container = getContainer();

  // Xoá toast cùng id nếu có
  if (options.id) {
    const existing = container.querySelector(
      `[data-toast-id="${options.id}"]`
    );
    if (existing) existing.remove();
  }

  // Giới hạn số lượng
  const current = container.children;
  if (current.length >= TOAST_MAX) {
    dismissToast(current[0]);
  }

  // ---------- BUILD ELEMENT ----------
  const el = document.createElement("div");
  el.className = `toast-card toast-card--${safeType}`;
  if (options.id) el.dataset.toastId = options.id;
  el.setAttribute("role", "alert");

  // Icon tròn
  const iconWrap = document.createElement("div");
  iconWrap.className = "toast-card__icon";
  iconWrap.style.background = accent.soft;
  iconWrap.style.color = accent.color;
  iconWrap.innerHTML = ICONS[safeType];

  // Body
  const body = document.createElement("div");
  body.className = "toast-card__body";

  const titleEl = document.createElement("div");
  titleEl.className = "toast-card__title";
  titleEl.textContent = options.title || message;
  body.appendChild(titleEl);

  if (options.description) {
    const descEl = document.createElement("div");
    descEl.className = "toast-card__desc";
    descEl.textContent = options.description;
    body.appendChild(descEl);
  }

  el.appendChild(iconWrap);
  el.appendChild(body);
  container.appendChild(el);

  // Auto dismiss
  const timer = setTimeout(() => dismissToast(el), duration);

  // Cleanup nếu element bị xoá khỏi DOM bằng cách khác
  const observer = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      clearTimeout(timer);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}