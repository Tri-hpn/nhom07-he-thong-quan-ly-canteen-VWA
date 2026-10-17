// ============================================================
// ORDER-EVENTS.JS — Phát & nghe tín hiệu "đơn vừa cập nhật"
// ============================================================
// V2 (2026-10):
//   - ✅ Thêm BroadcastChannel để đồng bộ tức thời giữa các tab
//     (không có độ trễ như localStorage).
//   - Giữ lại localStorage làm fallback.
// ============================================================

const EVENT_NAME = "canteen:order-updated";
const STORAGE_KEY = "canteen:order-updated-at";
const CHANNEL_NAME = "canteen:order-channel";

// Khởi tạo BroadcastChannel (nếu trình duyệt hỗ trợ)
const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

export function emitOrderUpdated(order) {
  if (!order) return;
  const detail = {
    id: order._id || order.id,
    code: order.code,
    status: order.status,
    total: Number(order.total) || 0,
    at: Date.now(),
  };

  // 1. Phát qua BroadcastChannel (nhanh nhất)
  if (bc) {
    try { bc.postMessage(detail); } catch {}
  }

  // 2. Phát qua window event (cùng tab)
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  } catch {}

  // 3. Lưu localStorage (fallback cho trình duyệt cũ)
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

  const bcHandler = (e) => {
    if (e.data) {
      try { callback(e.data); } catch {}
    }
  };

  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", storageHandler);
  if (bc) bc.addEventListener("message", bcHandler);

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
    if (bc) bc.removeEventListener("message", bcHandler);
  };
}