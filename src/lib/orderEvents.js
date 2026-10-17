// ============================================================
// ORDER-EVENTS.JS — Phát & nghe tín hiệu "đơn vừa cập nhật"
// ============================================================

const EVENT_NAME = "canteen:order-updated";
const STORAGE_KEY = "canteen:order-updated-at";

export function emitOrderUpdated(order) {
  if (!order) return;
  const detail = {
    id: order._id || order.id,
    code: order.code,
    status: order.status,
    total: Number(order.total) || 0,
    at: Date.now(),
  };
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  } catch {}
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(detail));
  } catch {}
}

export function onOrderUpdated(callback) {
  if (typeof callback !== "function") return () => {};
  const handler = (e) => callback(e.detail);
  const storageHandler = (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try { callback(JSON.parse(e.newValue)); } catch {}
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
