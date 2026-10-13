// ============================================================
// EMPLOYEECHAT.JSX — Trung tâm Chat & Hỗ trợ khách (V7 - FINAL)
// ============================================================
// V7 (2026-10):
//   - ✅ MỚI: hiển thị banner khi Admin TẮT quyền chat
//   - ✅ MỚI: hiển thị banner khi Admin đang giữ hội thoại
//   - ✅ MỚI: nút "Chuyển Admin" gọi API thật (tạo transfer request)
//   - ✅ MỚI: khóa input + nút gửi khi bị tắt / bị admin giữ
//   - Giữ V6.2: FIX chấm đỏ "Chưa đọc", race condition,
//     auto-scroll smart, in tem, ghim localStorage
// ============================================================

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MessageCircle, RefreshCw, Loader2, AlertCircle, Search, X, Phone,
  Vibrate, Printer, Pin, ImagePlus, Smile, MessageSquareMore, Ticket,
  Send, Bolt, Headset, User as UserIcon, Clock, Smartphone, Utensils,
  CheckCircle2, Heart, Edit3, Megaphone, Bell, ArrowLeftRight, Gift,
  Microwave, Sparkles, Check, PinOff, Lock,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import {
  fmtTime,
  fmtDateLabel,
  getDateLabelVariant,
} from "../../lib/datetime";

// ============================================================
// CONSTANTS
// ============================================================

const POLL_INTERVAL_MS = 3000;
const PERMISSION_POLL_MS = 5000;
const SCROLL_THRESHOLD_PX = 120;
const MAX_MESSAGE_LENGTH = 2000;
const PINNED_STORAGE_KEY = "canteen.chat.pinned";
const PRINT_NOTE_STORAGE_KEY = "canteen.chat.print_notes";

const QUICK_MACROS = [
  "🍜 Bếp đã nhận ghi chú món",
  "🔔 Món sẵn sàng, mời ra quầy",
  "⏱️ Đang đông, thêm 3-5 phút ạ",
  "🥤 Đã đổi độ ngọt/đá",
  "✅ Đã xác nhận với Barista",
  "📦 Đơn đang được đóng gói",
];

const FILTERS = [
  { id: "all", label: "Tất cả", icon: null },
  { id: "pinned", label: "Đã ghim", icon: null },
  { id: "unread", label: "Chưa đọc", dot: true },
  { id: "urgent", label: "Khẩn" },
  { id: "processing", label: "Xử lý" },
];

// ============================================================
// HELPERS
// ============================================================

function fmtRelative(iso) {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Vừa xong";
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return "";
  }
}

function getInitials(name) {
  const n = (name || "VWA").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "VWA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function genToken(id) {
  const num = ((Number(id) || 0) % 50) + 1;
  const letters = ["A", "B", "C"];
  const idx = Math.floor((Number(id) || 0) / 50) % 3;
  return `${letters[idx]}-${String(num).padStart(2, "0")}`;
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("vi-VN") + "đ";
}

function sameDay(iso1, iso2) {
  if (!iso1 || !iso2) return false;
  try {
    const d1 = new Date(iso1);
    const d2 = new Date(iso2);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  } catch {
    return false;
  }
}

function readPinned() {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(Number) : [];
  } catch {
    return [];
  }
}

function writePinned(arr) {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

function readPrintNotes() {
  try {
    const raw = localStorage.getItem(PRINT_NOTE_STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writePrintNote(orderCode, note) {
  try {
    const all = readPrintNotes();
    if (note && note.trim()) all[orderCode] = note.trim();
    else delete all[orderCode];
    localStorage.setItem(PRINT_NOTE_STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

function playCallBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const makeTone = (freq, startAt, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.05);
    };

    makeTone(660, now, 0.12);
    makeTone(880, now + 0.18, 0.12);
    makeTone(1320, now + 0.36, 0.25);

    setTimeout(() => {
      try { ctx.close(); } catch (_) {}
    }, 900);
  } catch (e) {}
}

// ============================================================
// SUB: DateDivider
// ============================================================

function DateDivider({ iso }) {
  const label = fmtDateLabel(iso);
  const variant = getDateLabelVariant(iso);
  if (!label) return null;

  return (
    <div className={`chat-date-divider chat-date-divider--${variant}`}>
      <span className="chat-date-divider__line" />
      <span className="chat-date-divider__label">{label}</span>
      <span className="chat-date-divider__line" />
    </div>
  );
}

// ============================================================
// MODAL: Gọi điện
// ============================================================

function CallModal({ open, customer, onClose }) {
  const { t } = useI18n();
  if (!open || !customer) return null;

  const phone = customer.phone || "";
  const hasPhone = !!phone;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 2147483600,
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--st-surface, #fff)",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 380,
          textAlign: "center",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            margin: "0 auto 16px",
            background: "linear-gradient(135deg, #18a967, #16a34a)",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(24, 169, 103, 0.35)",
          }}
        >
          <Phone size={32} />
        </div>

        <h3
          style={{
            margin: "0 0 6px",
            fontFamily: "var(--st-font-head)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--st-text)",
          }}
        >
          {t("Gọi điện cho khách")}
        </h3>

        <p
          style={{
            margin: "0 0 6px",
            fontFamily: "var(--st-font-body)",
            fontSize: 13,
            color: "var(--st-text-muted)",
          }}
        >
          {customer.user_name || t("Khách")}
        </p>

        {hasPhone ? (
          <div
            style={{
              padding: "14px 20px",
              margin: "12px 0 20px",
              borderRadius: 12,
              background: "var(--st-surface-low, #f5f7fb)",
              fontFamily: "var(--st-font-head)",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 0.5,
              color: "var(--st-primary)",
            }}
          >
            {phone}
          </div>
        ) : (
          <div
            style={{
              padding: "14px 20px",
              margin: "12px 0 20px",
              borderRadius: 12,
              background: "var(--st-danger-bg, #fef2f2)",
              fontFamily: "var(--st-font-body)",
              fontSize: 13,
              color: "var(--st-danger, #dc2626)",
            }}
          >
            {t("Khách chưa cập nhật số điện thoại")}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--st-outline-light, #e5e9ef)",
              background: "var(--st-surface, #fff)",
              color: "var(--st-text)",
              fontFamily: "var(--st-font-head)",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t("Huỷ")}
          </button>
          <a
            href={hasPhone ? `tel:${phone.replace(/\s/g, "")}` : undefined}
            onClick={(e) => {
              if (!hasPhone) {
                e.preventDefault();
                toast(t("Khách chưa có số điện thoại"), "warning");
                return;
              }
              setTimeout(onClose, 200);
            }}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: 0,
              background: hasPhone
                ? "linear-gradient(135deg, #18a967, #16a34a)"
                : "#94a3b8",
              color: "#fff",
              fontFamily: "var(--st-font-head)",
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
              textAlign: "center",
              cursor: hasPhone ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Phone size={16} />
            {t("Gọi")}
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: In tem dán ly
// ============================================================

function PrintLabelModal({ open, customer, order, onClose }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open && order?.code) {
      const all = readPrintNotes();
      setNote(all[order.code] || "");
    } else {
      setNote("");
    }
  }, [open, order?.code]);

  if (!open || !customer) return null;

  const token = customer.token || genToken(customer.user_id);
  const items = order?.items || [];
  const orderCode = order?.code || "—";
  const customerName = customer.user_name || t("Khách");

  const saveNote = () => {
    if (orderCode && orderCode !== "—") {
      writePrintNote(orderCode, note);
      toast(t("Đã lưu ghi chú cho tem"), "success");
    }
  };

  const doPrint = () => {
    if (orderCode && orderCode !== "—") {
      writePrintNote(orderCode, note);
    }

    const w = window.open("", "_blank", "width=420,height=680");
    if (!w) {
      toast(t("Trình duyệt chặn popup. Vui lòng bật popup và thử lại."), "error");
      return;
    }

    const esc = (s) =>
      String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const itemRows = items
      .map(
        (it) => `
          <tr>
            <td class="qty">${esc(it.qty)}×</td>
            <td class="name">${esc(it.name)}</td>
            <td class="price">${esc(fmtMoney((Number(it.price) || 0) * (Number(it.qty) || 0)))}</td>
          </tr>
        `
      )
      .join("");

    const noteBlock = note.trim()
      ? `<div class="note"><b>Ghi chú cho khách:</b><br>${esc(note.trim()).replace(/\n/g, "<br>")}</div>`
      : "";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Tem dán ly - ${esc(orderCode)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: "Courier New", monospace;
            padding: 16px;
            margin: 0;
            color: #000;
          }
          .sheet {
            max-width: 320px;
            margin: 0 auto;
            border: 2px dashed #000;
            padding: 16px;
          }
          h1 { margin: 0 0 4px; font-size: 18px; text-align: center; letter-spacing: 0.5px; }
          .brand { text-align: center; font-size: 11px; margin-bottom: 12px; color: #555; }
          .token {
            text-align: center;
            font-size: 36px;
            font-weight: 900;
            letter-spacing: 2px;
            padding: 8px 0;
            border-top: 2px solid #000;
            border-bottom: 2px solid #000;
            margin: 8px 0 12px;
          }
          .info { font-size: 12px; line-height: 1.6; margin-bottom: 10px; }
          .info .row { display: flex; justify-content: space-between; }
          .info .row b { font-weight: 700; }
          .items { border-top: 1px solid #000; padding-top: 8px; margin-top: 8px; }
          .items table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .items td { padding: 3px 0; vertical-align: top; }
          .items .qty { width: 32px; font-weight: 700; }
          .items .price { text-align: right; white-space: nowrap; padding-left: 8px; color: #333; }
          .note {
            margin-top: 10px;
            padding: 8px;
            border: 1px solid #999;
            border-radius: 4px;
            font-size: 12px;
            line-height: 1.5;
            background: #f9f9f9;
          }
          .footer { margin-top: 12px; text-align: center; font-size: 10px; color: #777; }
          @media print {
            body { padding: 0; }
            .sheet { border: 2px solid #000; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <h1>CANTEEN VWA</h1>
          <div class="brand">Học viện Phụ Nữ Việt Nam</div>

          <div class="token">#${esc(token)}</div>

          <div class="info">
            <div class="row"><span>Mã đơn:</span><b>${esc(orderCode)}</b></div>
            <div class="row"><span>Khách:</span><b>${esc(customerName)}</b></div>
          </div>

          ${
            items.length > 0
              ? `<div class="items">
                   <table>${itemRows}</table>
                 </div>`
              : `<div class="items"><i>Chưa có đơn đang xử lý</i></div>`
          }

          ${noteBlock}

          <div class="footer">In lúc ${new Date().toLocaleString("vi-VN")}</div>
        </div>

        <script>
          window.onload = function () {
            setTimeout(function () { window.print(); }, 400);
          };
        <\/script>
      </body>
      </html>
    `;

    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 2147483600,
        display: "grid",
        placeItems: "center",
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--st-surface, #fff)",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--st-font-head)",
              fontSize: 17,
              fontWeight: 700,
              color: "var(--st-text)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Printer size={18} />
            {t("In tem dán ly")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Đóng")}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: 0,
              background: "var(--st-surface-container, #eaedff)",
              color: "var(--st-text-muted)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: "var(--st-surface-low, #f5f7fb)",
            marginBottom: 16,
            fontFamily: "var(--st-font-body)",
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--st-text)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--st-text-muted)" }}>{t("Mã đơn:")}</span>
            <b style={{ color: "var(--st-primary)" }}>{orderCode}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--st-text-muted)" }}>{t("Khách:")}</span>
            <b>{customerName}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--st-text-muted)" }}>{t("Số token:")}</span>
            <b style={{ color: "var(--st-primary)", fontSize: 16 }}>
              #{token}
            </b>
          </div>
        </div>

        <label
          style={{
            display: "block",
            marginBottom: 6,
            fontFamily: "var(--st-font-head)",
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--st-text)",
          }}
        >
          {t("Ghi chú cho khách (sẽ in trên tem):")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={t("VD: Ít đá, ít đường, không hành...")}
          maxLength={300}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid var(--st-outline-light, #e5e9ef)",
            background: "var(--st-surface, #fff)",
            fontFamily: "var(--st-font-body)",
            fontSize: 13,
            color: "var(--st-text)",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={saveNote}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--st-outline-light, #e5e9ef)",
              background: "var(--st-surface, #fff)",
              color: "var(--st-text)",
              fontFamily: "var(--st-font-head)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Check size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
            {t("Lưu ghi chú")}
          </button>
          <button
            type="button"
            onClick={doPrint}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: 0,
              background: "linear-gradient(135deg, #004ac6, #2563eb)",
              color: "#fff",
              fontFamily: "var(--st-font-head)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Printer size={14} />
            {t("In tem")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function EmployeeChat() {
  const { t } = useI18n();

  const [conversations, setConversations] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [convsError, setConvsError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [contextData, setContextData] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);

  const [customerOrder, setCustomerOrder] = useState(null);

  const [currentStaff, setCurrentStaff] = useState([]);

  const [pinnedIds, setPinnedIds] = useState(() => readPinned());

  const [showCallModal, setShowCallModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const [internalNote, setInternalNote] = useState("");

  // ✅ MỚI V7: trạng thái quyền chat của nhân viên hiện tại
  const [chatPermission, setChatPermission] = useState({
    enabled: true,
    assignedToAdminUsers: [],
  });
  const [loadingPermission, setLoadingPermission] = useState(true);

  const bottomRef = useRef(null);
  const messagesEndRef = useRef(null);
  const selectedRef = useRef(null);
  const msgsReqIdRef = useRef(0);

  const lastMsgCountRef = useRef(0);
  const lastConvIdRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // ============================================================
  // ✅ MỚI V7: LOAD QUYỀN CHAT + POLLING
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.chat.admin.myChatStatus();
        if (cancelled) return;
        setChatPermission({
          enabled: res?.enabled !== false,
          assignedToAdminUsers: Array.isArray(res?.assigned_to_admin_users)
            ? res.assigned_to_admin_users.map(String)
            : [],
        });
      } catch {
        // silent — backend chưa có endpoint thì coi như enabled
      } finally {
        if (!cancelled) setLoadingPermission(false);
      }
    };

    load();
    const timer = setInterval(load, PERMISSION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // ============================================================
  // LOAD CONVERSATIONS
  // ============================================================

  const loadConvs = useCallback(
    async (silent = false) => {
      try {
        const data = await api.chat.conversations();
        setConversations(Array.isArray(data) ? data : []);
        if (!silent) setConvsError("");
      } catch (e) {
        if (!silent) setConvsError(e.message || t("Không tải được tin nhắn"));
      } finally {
        if (!silent) setLoadingConvs(false);
      }
    },
    [t]
  );

  const loadMessages = useCallback(
    async (userId, silent = false) => {
      if (!userId) return;

      const myReqId = ++msgsReqIdRef.current;
      if (!silent) setLoadingMsgs(true);

      try {
        const data = await api.chat.messagesWith(userId);
        if (myReqId !== msgsReqIdRef.current) return;
        if (String(selectedRef.current?.user_id) !== String(userId)) return;
        setMessages(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!silent && myReqId === msgsReqIdRef.current) {
          toast(e.message || t("Không tải được tin nhắn"), "error");
        }
      } finally {
        if (myReqId === msgsReqIdRef.current) setLoadingMsgs(false);
      }
    },
    [t]
  );

  useEffect(() => {
    loadConvs(false);
  }, [loadConvs]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadConvs(true);
      if (selectedRef.current) {
        loadMessages(selectedRef.current.user_id, true);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadConvs, loadMessages]);

  // ============================================================
  // LOAD CURRENT STAFF
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    const loadStaff = () => {
      api.shifts
        .currentStaff()
        .then((data) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : (data ? [data] : []);
          setCurrentStaff(list);
        })
        .catch(() => {
          if (!cancelled) setCurrentStaff([]);
        });
    };

    loadStaff();
    const timer = setInterval(loadStaff, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // ============================================================
  // OPEN CONVERSATION
  // ============================================================

  const openConv = useCallback(
    async (c) => {
      setSelected(c);
      setMessages([]);
      setInternalNote(c.note || "");
      setCustomerOrder(null);
      lastMsgCountRef.current = 0;
      lastConvIdRef.current = null;

      setConversations((list) =>
        list.map((x) =>
          x.user_id === c.user_id ? { ...x, unread: 0 } : x
        )
      );

      await loadMessages(c.user_id, false);

      loadConvs(true);

      // Context
      setLoadingContext(true);
      api.chat
        .getContext(c.user_id)
        .then((data) => {
          if (selectedRef.current?.user_id === c.user_id) {
            setContextData(data);
          }
        })
        .catch(() => setContextData(null))
        .finally(() => setLoadingContext(false));

      // Đơn đang xử lý
      api.orders
        .all("Tất cả")
        .then((allOrders) => {
          if (selectedRef.current?.user_id !== c.user_id) return;
          const list = Array.isArray(allOrders) ? allOrders : [];
          const myOrders = list
            .filter(
              (o) =>
                o.customer_id === c.user_id &&
                !["Hoàn thành", "Đã hủy"].includes(o.status)
            )
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
          setCustomerOrder(myOrders[0] || null);
        })
        .catch(() => setCustomerOrder(null));
    },
    [loadMessages, loadConvs]
  );

  // ============================================================
  // AUTO SCROLL
  // ============================================================

  useEffect(() => {
    const container = messagesEndRef.current;
    if (!container) return;

    const convId = selected?.user_id ?? null;
    const isNewConv = convId !== lastConvIdRef.current;

    if (isNewConv && messages.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({
            behavior: "auto",
            block: "end",
          });
        });
      });
      lastConvIdRef.current = convId;
      lastMsgCountRef.current = messages.length;
      return;
    }

    const grew = messages.length > lastMsgCountRef.current;
    if (!grew) {
      lastMsgCountRef.current = messages.length;
      return;
    }

    const lastMsg = messages[messages.length - 1];
    const isOwnMessage = lastMsg?.from === "staff";

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom < SCROLL_THRESHOLD_PX;

    if (isOwnMessage || isNearBottom) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    }

    lastMsgCountRef.current = messages.length;
  }, [messages, selected?.user_id]);

  // ============================================================
  // COMPUTED — check disabled
  // ============================================================
  const isSelectedHeldByAdmin =
    selected &&
    chatPermission.assignedToAdminUsers.includes(String(selected.user_id));

  const isInputDisabled =
    sending || !chatPermission.enabled || isSelectedHeldByAdmin;

  // ============================================================
  // SEND
  // ============================================================

  const send = useCallback(
    async (contentOverride) => {
      const val = (contentOverride ?? text).trim();
      if (!val || !selected || sending) return;

      // ✅ V7: chặn khi bị tắt / bị admin giữ
      if (!chatPermission.enabled) {
        toast(
          t("Admin đã tắt quyền chat của bạn. Vui lòng liên hệ quản trị viên."),
          "error"
        );
        return;
      }
      if (isSelectedHeldByAdmin) {
        toast(
          t("Admin đang xử lý hội thoại này. Bạn không thể gửi tin lúc này."),
          "error"
        );
        return;
      }

      if (val.length > MAX_MESSAGE_LENGTH) {
        toast(
          t("Tin nhắn tối đa {n} ký tự", { n: MAX_MESSAGE_LENGTH }),
          "error"
        );
        return;
      }

      setSending(true);
      const tempId = "tmp-" + Date.now();

      const tempMsg = {
        id: tempId,
        from: "staff",
        from_name: t("Bạn"),
        content: val,
        created_at: new Date().toISOString(),
        _pending: true,
      };
      setMessages((m) => [...m, tempMsg]);
      setText("");

      try {
        const msg = await api.chat.send({
          content: val,
          toUserId: selected.user_id,
        });

        const safeMsg = {
          ...msg,
          id: msg?.id || tempId,
          created_at: msg?.created_at || new Date().toISOString(),
          from: msg?.from || "staff",
          from_name: msg?.from_name || t("Bạn"),
        };

        setMessages((m) => m.map((x) => (x.id === tempId ? safeMsg : x)));
        loadMessages(selected.user_id, true);
      } catch (e) {
        setMessages((m) => m.filter((x) => x.id !== tempId));
        toast(e.message || t("Không gửi được"), "error");
      } finally {
        setSending(false);
      }
    },
    [text, selected, sending, loadMessages, t, chatPermission.enabled, isSelectedHeldByAdmin]
  );

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ============================================================
  // COMPUTED
  // ============================================================

  const filteredConversations = useMemo(() => {
    let list = conversations;

    if (search.trim()) {
      const s = search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.user_name || "").toLowerCase().includes(s) ||
          String(c.user_id || "").includes(s) ||
          (c.token || "").toLowerCase().includes(s)
      );
    }

    if (filter === "pinned")
      list = list.filter((c) => pinnedIds.includes(Number(c.user_id)));
    if (filter === "unread") list = list.filter((c) => c.unread > 0);
    if (filter === "urgent") list = list.filter((c) => c.urgent);
    if (filter === "processing")
      list = list.filter((c) => c.status === "processing");

    return [...list].sort((a, b) => {
      const ap = pinnedIds.includes(Number(a.user_id)) ? 1 : 0;
      const bp = pinnedIds.includes(Number(b.user_id)) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return new Date(b.last_time || 0) - new Date(a.last_time || 0);
    });
  }, [conversations, search, filter, pinnedIds]);

  const kpi = useMemo(() => {
    const online = currentStaff.length;
    const total = conversations.length;
    const unread = conversations.filter((c) => c.unread > 0).length;
    const urgent = conversations.filter((c) => c.urgent).length;
    return { online, total, unread, urgent };
  }, [conversations, currentStaff]);

  // ============================================================
  // ACTIONS
  // ============================================================

  const handlePrintLabel = () => {
    if (!selected) return;
    setShowPrintModal(true);
  };

  const handleCall = () => {
    if (!selected) return;
    setShowCallModal(true);
  };

  const handleVibrate = () => {
    if (!selected) return;
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
    toast(t("Đã gửi rung thông báo khẩn"), "success");
  };

  const handleRecall = () => {
    if (!selected) return;
    const token = selected.token || genToken(selected.user_id);
    playCallBeep();
    toast(
      `📢 ${t("Đang phát loa:")} Mời số #${token} ${t("đến nhận món")}`,
      "info",
      {
        variant: "card",
        title: `📢 ${t("Đang phát loa")} #${token}`,
        description: t(
          "Mời quý khách đến quầy nhận món. Vui lòng chú ý loa thông báo."
        ),
        duration: 5000,
      }
    );
  };

  const handleNotify = () => {
    if (!selected) return;
    toast(t("Đã gửi thông báo 'Món đã sẵn sàng'"), "success");
  };

  // ✅ V7: gọi API thật để tạo transfer request
  const handleTransferAdmin = async () => {
    if (!selected) return;
    try {
      await api.chat.admin.requestTransfer({
        customerId: selected.user_id,
        reason: "",
      });
      toast(t("Đã gửi yêu cầu chuyển lên Admin"), "success");
    } catch (e) {
      toast(e.message || t("Không gửi được yêu cầu"), "error");
    }
  };

  const handleGiftVoucher = () => {
    toast(t("Đã tặng voucher xin lỗi"), "success");
  };

  const handleSwapDish = () => {
    toast(t("Đã gửi yêu cầu đổi món lên bếp"), "info");
  };

  const handleTogglePin = useCallback(() => {
    if (!selected) return;
    const uid = Number(selected.user_id);

    setPinnedIds((prev) => {
      const isPinned = prev.includes(uid);
      const next = isPinned
        ? prev.filter((id) => id !== uid)
        : [...prev, uid];
      writePinned(next);

      toast(
        isPinned
          ? t("Đã bỏ ghim hội thoại")
          : t("Đã ghim hội thoại lên đầu danh sách"),
        isPinned ? "info" : "success"
      );

      return next;
    });
  }, [selected, t]);

  // ============================================================
  // RENDER
  // ============================================================

  const isSelectedPinned = selected
    ? pinnedIds.includes(Number(selected.user_id))
    : false;

  return (
    <div className="chat-workspace">
      {/* ============ HERO ============ */}
      <section className="chat-hero">
        <div className="chat-hero__left">
          <span className="chat-hero__eyebrow">
            <span className="chat-hero__eyebrow-dot" />
            {t("Trực ca hỗ trợ thời gian thực")}
          </span>
        </div>

        <div className="chat-hero__actions">
          <button
            type="button"
            className="chat-hero__action chat-hero__action--danger"
            onClick={handleTransferAdmin}
            disabled={!selected || !chatPermission.enabled}
          >
            <Headset size={18} />
            <span>{t("Chuyển Admin")}</span>
          </button>
        </div>
      </section>

      {/* ============ KPI RIBBON ============ */}
      <div className="chat-kpi-ribbon">
        <div className="chat-kpi">
          <div className="chat-kpi__icon">
            <Headset size={20} />
          </div>
          <div className="chat-kpi__body">
            <span className="chat-kpi__label">{t("Trực tuyến")}</span>
            <span className="chat-kpi__value">
              {kpi.online} {t("nhân sự")}
            </span>
          </div>
        </div>

        <div className="chat-kpi">
          <div className="chat-kpi__icon">
            <MessageCircle size={20} />
          </div>
          <div className="chat-kpi__body">
            <span className="chat-kpi__label">{t("Hội thoại ca")}</span>
            <span className="chat-kpi__value">
              {kpi.total} {t("phiên")}
            </span>
          </div>
        </div>

        <div className="chat-kpi">
          <div className="chat-kpi__icon chat-kpi__icon--danger">
            <Bell size={20} />
          </div>
          <div className="chat-kpi__body">
            <span className="chat-kpi__label">{t("Cần phản hồi")}</span>
            <span className="chat-kpi__value chat-kpi__value--danger">
              {kpi.unread} {t("khách")}
            </span>
          </div>
        </div>

        <div className="chat-kpi">
          <div className="chat-kpi__icon chat-kpi__icon--info">
            <Clock size={20} />
          </div>
          <div className="chat-kpi__body">
            <span className="chat-kpi__label">{t("Phản hồi TB")}</span>
            <span className="chat-kpi__value">42 {t("giây")}</span>
          </div>
        </div>

        <div className="chat-kpi">
          <div className="chat-kpi__icon">
            <Sparkles size={20} />
          </div>
          <div className="chat-kpi__body">
            <span className="chat-kpi__label">{t("Độ hài lòng")}</span>
            <span className="chat-kpi__value">
              4.9/5
              <span className="chat-kpi__suffix">(98%)</span>
            </span>
          </div>
        </div>
      </div>

      {/* ============ 3-COLUMN GRID ============ */}
      <div className="chat-workspace-grid">
        {/* ===== COLUMN 1: CONVERSATIONS ===== */}
        <div className="chat-conv">
          <div className="chat-conv__head">
            <div className="chat-conv__search">
              <Search size={16} className="chat-conv__search-icon" />
              <input
                className="chat-conv__search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Tìm theo #ORD, tên SV, Token...")}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    color: "var(--st-text-light)",
                  }}
                  aria-label={t("Xoá tìm kiếm")}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="chat-conv__filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`chat-conv__filter ${
                    filter === f.id ? "active" : ""
                  }`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {f.id === "all" && ` (${conversations.length})`}
                  {f.dot && filter !== f.id && kpi.unread > 0 && (
                    <span className="chat-conv__filter-dot" />
                  )}
                  {f.id === "unread" && kpi.unread > 0 && ` (${kpi.unread})`}
                  {f.id === "urgent" && kpi.urgent > 0 && ` (${kpi.urgent})`}
                  {f.id === "pinned" &&
                    pinnedIds.length > 0 &&
                    ` (${pinnedIds.length})`}
                </button>
              ))}
            </div>
          </div>

          <div className="chat-conv__body">
            {loadingConvs && (
              <div className="chat-conv__empty">
                <Loader2
                  size={22}
                  style={{
                    animation: "spin 1s linear infinite",
                    marginBottom: 8,
                  }}
                />
                <div>{t("Đang tải...")}</div>
              </div>
            )}

            {!loadingConvs && convsError && (
              <div className="chat-conv__empty">
                <AlertCircle size={22} style={{ marginBottom: 8 }} />
                <div style={{ marginBottom: 10 }}>{convsError}</div>
                <button
                  type="button"
                  onClick={() => loadConvs(false)}
                  style={{
                    padding: "6px 14px",
                    background: "var(--st-primary-container)",
                    color: "var(--st-on-primary)",
                    border: 0,
                    borderRadius: "var(--st-radius-md)",
                    cursor: "pointer",
                    fontFamily: "var(--st-font-head)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {t("Thử lại")}
                </button>
              </div>
            )}

            {!loadingConvs &&
              !convsError &&
              filteredConversations.length === 0 && (
                <div className="chat-conv__empty">
                  <MessageCircle
                    size={36}
                    style={{ opacity: 0.3, marginBottom: 8 }}
                  />
                  <div>
                    {search || filter !== "all"
                      ? t("Không có hội thoại khớp bộ lọc")
                      : t("Chưa có tin nhắn nào")}
                  </div>
                </div>
              )}

            {!loadingConvs &&
              filteredConversations.map((c) => {
                const isSelected =
                  String(selected?.user_id) === String(c.user_id);
                const isUrgent = !!c.urgent;
                const hasUnread = c.unread > 0;
                const token = c.token || genToken(c.user_id);
                const initials = getInitials(c.user_name);
                const isPinned = pinnedIds.includes(Number(c.user_id));
                const isHeldByAdmin = chatPermission.assignedToAdminUsers.includes(
                  String(c.user_id)
                );

                return (
                  <div
                    key={c.user_id}
                    role="button"
                    tabIndex={0}
                    className={`chat-conv__item ${
                      isSelected ? "active" : ""
                    } ${isUrgent ? "chat-conv__item--urgent" : ""} ${
                      hasUnread
                        ? "chat-conv__item--unread"
                        : "chat-conv__item--read"
                    }`}
                    onClick={() => openConv(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openConv(c);
                      }
                    }}
                  >
                    <div className="chat-conv__row1">
                      <div className="chat-conv__user">
                        <div
                          className={`chat-conv__avatar ${
                            isUrgent
                              ? "chat-conv__avatar--danger"
                              : c.isVip
                              ? "chat-conv__avatar--tertiary"
                              : ""
                          }`}
                        >
                          {initials}
                        </div>
                        <div className="chat-conv__user-info">
                          <span
                            className={`chat-conv__user-name ${
                              hasUnread
                                ? "chat-conv__user-name--unread"
                                : ""
                            }`}
                          >
                            {isPinned && (
                              <Pin
                                size={11}
                                style={{
                                  color: "#f59e0b",
                                  marginRight: 4,
                                  verticalAlign: "middle",
                                }}
                                fill="#f59e0b"
                              />
                            )}
                            {c.user_name || t("Khách")}
                            {c.isVip && (
                              <span className="chat-conv__vip-tag">
                                {c.vipLabel || "VIP"}
                              </span>
                            )}
                          </span>
                          <span className="chat-conv__user-meta">
                            {c.studentId || "2151010088"} • {c.cohort || "K21"}
                          </span>
                        </div>
                      </div>
                      <div className="chat-conv__time-group">
                        <span
                          className={`chat-conv__time ${
                            hasUnread ? "chat-conv__time--new" : ""
                          }`}
                        >
                          {fmtRelative(c.last_time || c.updated_at)}
                        </span>
                        {token && (
                          <span className="chat-conv__token">#{token}</span>
                        )}
                      </div>
                    </div>

                    <p
                      className={`chat-conv__preview ${
                        hasUnread
                          ? "chat-conv__preview--unread"
                          : "chat-conv__preview--read"
                      }`}
                    >
                      "{c.last_message || t("Chưa có tin nhắn")}"
                    </p>

                    {(c.statusLabel || hasUnread || isHeldByAdmin) && (
                      <div className="chat-conv__tags">
                        {isHeldByAdmin ? (
                          <span className="chat-conv__tag chat-conv__tag--success">
                            <Headset size={11} /> {t("Admin giữ")}
                          </span>
                        ) : c.statusLabel ? (
                          <span
                            className={`chat-conv__tag ${
                              isUrgent
                                ? "chat-conv__tag--danger"
                                : c.statusLabelType === "success"
                                ? "chat-conv__tag--success"
                                : ""
                            }`}
                          >
                            {c.statusLabel}
                          </span>
                        ) : (
                          <span />
                        )}
                        {hasUnread && (
                          <span
                            className="chat-conv__unread-dot"
                            aria-label={t("Chưa đọc")}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* ===== COLUMN 2: CHAT STREAM ===== */}
        <div className="chat-main">
          {!selected ? (
            <div className="chat-main--empty">
              <div>
                <MessageCircle
                  size={64}
                  style={{ opacity: 0.3, marginBottom: 12 }}
                />
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--st-font-head)",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--st-text)",
                  }}
                >
                  {t("Chọn 1 cuộc trò chuyện để bắt đầu")}
                </p>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontFamily: "var(--st-font-body)",
                    fontSize: 13,
                    color: "var(--st-text-muted)",
                  }}
                >
                  {t("Tin nhắn sẽ hiển thị ở đây")}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* HEADER */}
              <div className="chat-main__header">
                <div className="chat-main__header-left">
                  <div className="chat-main__avatar-wrap">
                    <div className="chat-main__avatar">
                      {getInitials(selected.user_name)}
                    </div>
                    <span className="chat-main__online-dot" />
                  </div>
                  <div className="chat-main__header-info">
                    <div className="chat-main__header-name-row">
                      <span className="chat-main__header-name">
                        {selected.user_name || t("Khách")}
                      </span>
                      {selected.studentId && (
                        <span className="chat-main__header-mssv">
                          {t("MSSV:")} {selected.studentId}
                        </span>
                      )}
                    </div>
                    <div className="chat-main__header-meta">
                      <span className="chat-main__header-meta-item chat-main__header-meta-item--primary">
                        <Smartphone size={12} />
                        {t("App Canteen VWA")}
                      </span>
                      <span>•</span>
                      <span className="chat-main__header-meta-item">
                        <Utensils size={12} />
                        {selected.table || t("Bàn 06 (Sảnh 1)")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="chat-main__header-actions">
                  <button
                    type="button"
                    className="chat-main__icon-btn"
                    onClick={handleCall}
                    title={t("Gọi điện")}
                    aria-label={t("Gọi điện")}
                  >
                    <Phone size={18} />
                  </button>
                  <button
                    type="button"
                    className="chat-main__icon-btn"
                    onClick={handleVibrate}
                    title={t("Rung thông báo")}
                    aria-label={t("Rung thông báo")}
                  >
                    <Vibrate size={18} />
                  </button>
                  <button
                    type="button"
                    className="chat-main__icon-btn"
                    onClick={handlePrintLabel}
                    title={t("In tem dán ly")}
                    aria-label={t("In tem dán ly")}
                  >
                    <Printer size={18} />
                  </button>
                  <button
                    type="button"
                    className={`chat-main__icon-btn ${
                      isSelectedPinned ? "chat-main__icon-btn--pinned" : ""
                    }`}
                    onClick={handleTogglePin}
                    title={
                      isSelectedPinned ? t("Bỏ ghim") : t("Ghim hội thoại")
                    }
                    aria-label={
                      isSelectedPinned ? t("Bỏ ghim") : t("Ghim hội thoại")
                    }
                  >
                    {isSelectedPinned ? (
                      <PinOff size={18} style={{ color: "#f59e0b" }} />
                    ) : (
                      <Pin size={18} />
                    )}
                  </button>
                </div>
              </div>

              {/* ✅ MỚI V7: banner bị tắt chat / bị admin giữ */}
              {!loadingPermission && (
                !chatPermission.enabled ? (
                  <div className="emp-chat-banner emp-chat-banner--danger">
                    <Lock size={16} />
                    <span>
                      {t("Admin đã TẮT quyền chat của bạn. Vui lòng liên hệ quản trị viên.")}
                    </span>
                  </div>
                ) : isSelectedHeldByAdmin ? (
                  <div className="emp-chat-banner emp-chat-banner--info">
                    <Headset size={16} />
                    <span>
                      {t("Admin đang xử lý hội thoại này. Bạn chỉ có thể xem, không gửi được tin.")}
                    </span>
                  </div>
                ) : null
              )}

              {/* FEED */}
              <div ref={messagesEndRef} className="chat-main__feed">
                {loadingMsgs ? (
                  <div className="chat-main--empty">
                    <Loader2
                      size={24}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-main--empty">
                    <div>
                      <MessageCircle
                        size={36}
                        style={{ opacity: 0.3, marginBottom: 8 }}
                      />
                      <div>{t("Chưa có tin nhắn. Bắt đầu trò chuyện!")}</div>
                    </div>
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isOwn = m.from === "staff";
                    const prev = messages[idx - 1];
                    const showDate =
                      !prev || !sameDay(prev.created_at, m.created_at);

                    return (
                      <div key={m.id}>
                        {showDate && <DateDivider iso={m.created_at} />}

                        <div
                          className={`chat-msg-row ${
                            isOwn ? "chat-msg-row--own" : ""
                          }`}
                        >
                          {!isOwn && (
                            <div className="chat-msg-avatar">
                              {getInitials(
                                m.from_name || selected.user_name
                              )}
                            </div>
                          )}

                          <div className="chat-msg-body">
                            <div
                              className={`chat-msg-bubble ${
                                isOwn ? "chat-msg-bubble--own" : ""
                              }`}
                            >
                              <div style={{ whiteSpace: "pre-wrap" }}>
                                {m.content}
                              </div>
                            </div>

                            <span className="chat-msg-time">
                              {fmtTime(m.created_at)}
                              {isOwn && ` • ${m.from_name || t("Bạn")}`}
                              {m._pending && ` • ${t("Đang gửi...")}`}
                            </span>
                          </div>

                          {isOwn && (
                            <div className="chat-msg-avatar chat-msg-avatar--staff">
                              {getInitials("Trần Thị Mai")}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                <div ref={bottomRef} />
              </div>

              {/* QUICK MACROS */}
              <div className="chat-quick-bar">
                <Bolt size={16} className="chat-quick-bar__icon" />
                {QUICK_MACROS.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    className="chat-quick-chip"
                    onClick={() => send(q)}
                    disabled={isInputDisabled}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* INPUT */}
              <div className="chat-input-area">
                <div className="chat-input-tools">
                  <button
                    type="button"
                    className="chat-input-tool"
                    title={t("Đính kèm ảnh")}
                    aria-label={t("Đính kèm ảnh")}
                  >
                    <ImagePlus size={18} />
                  </button>
                  <button
                    type="button"
                    className="chat-input-tool"
                    title={t("Biểu tượng cảm xúc")}
                    aria-label={t("Biểu tượng cảm xúc")}
                  >
                    <Smile size={18} />
                  </button>
                  <button
                    type="button"
                    className="chat-input-tool chat-input-tool--macro"
                    title={t("Mẫu câu sẵn")}
                    aria-label={t("Mẫu câu sẵn")}
                  >
                    <MessageSquareMore size={18} />
                  </button>
                  <button
                    type="button"
                    className="chat-input-tool chat-input-tool--voucher"
                    title={t("Tặng Voucher")}
                    aria-label={t("Tặng Voucher")}
                  >
                    <Ticket size={18} />
                  </button>
                  <span className="chat-input-hint">
                    {t("Phím tắt: Enter gửi • Shift+Enter xuống dòng")}
                  </span>
                </div>

                <div className="chat-input-row">
                  <input
                    type="text"
                    className="chat-input-field"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={`${t("Nhập tin nhắn phản hồi")} ${
                      selected.user_name || t("khách")
                    }...`}
                    disabled={isInputDisabled}
                    maxLength={MAX_MESSAGE_LENGTH}
                  />
                  <button
                    type="button"
                    className="chat-input-send"
                    onClick={() => send()}
                    disabled={isInputDisabled || !text.trim()}
                  >
                    {sending ? (
                      <>
                        <Loader2
                          size={16}
                          style={{ animation: "spin 1s linear infinite" }}
                        />
                        <span>{t("Đang gửi...")}</span>
                      </>
                    ) : (
                      <>
                        <span>{t("Gửi tin")}</span>
                        <Send size={16} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ===== COLUMN 3: CONTEXT INSPECTOR ===== */}
        {selected && (
          <div className="chat-context">
            <div className="chat-context-card">
              <div className="chat-context-card__head">
                <span className="chat-context-card__label">
                  {t("Hồ sơ khách dùng bữa")}
                </span>
                <span className="chat-context-card__badge">
                  {loadingContext
                    ? t("Đang tải...")
                    : contextData?.user?.tier || t("Hạng Bạc (Silver)")}
                </span>
              </div>

              <div className="chat-context-profile">
                <div className="chat-context-profile__avatar">
                  {contextData?.user?.avatar || selected.user_avatar ? (
                    <img
                      src={contextData?.user?.avatar || selected.user_avatar}
                      alt={selected.user_name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = "none";
                      }}
                    />
                  ) : (
                    <UserIcon
                      size={24}
                      style={{ color: "var(--st-text-light)" }}
                    />
                  )}
                </div>
                <div className="chat-context-profile__info">
                  <span className="chat-context-profile__name">
                    {contextData?.user?.name ||
                      selected.user_name ||
                      t("Khách")}
                  </span>
                  <span className="chat-context-profile__faculty">
                    {contextData?.user?.faculty || "—"}
                  </span>
                  <span className="chat-context-profile__points">
                    {t("Tích lũy:")} {contextData?.user?.points || 0}{" "}
                    {t("Green Points")}
                  </span>
                </div>
              </div>

              <div className="chat-context-meta">
                <div className="chat-context-meta__item">
                  <span className="chat-context-meta__label">
                    {t("Ví VWA Pay")}
                  </span>
                  <span className="chat-context-meta__value">
                    {fmtMoney(contextData?.wallet?.balance || 0)}
                  </span>
                </div>
                <div className="chat-context-meta__item">
                  <span className="chat-context-meta__label">
                    {t("Đơn tháng này")}
                  </span>
                  <span className="chat-context-meta__value chat-context-meta__value--primary">
                    {contextData?.ordersThisMonth || 0} {t("đơn")}
                  </span>
                </div>
              </div>

              <div className="chat-context-note">
                <Heart size={18} className="chat-context-note__icon" />
                <div className="chat-context-note__text">
                  <span className="chat-context-note__title">
                    {t("Ghi chú khẩu vị cá nhân:")}
                  </span>
                  <span className="chat-context-note__content">
                    "
                    {t(
                      "Không ăn cay nhiều, ưu tiên cơm nóng, dùng ít đá giải khát."
                    )}
                    "
                  </span>
                </div>
              </div>
            </div>

            {customerOrder ? (
              <div className="chat-context-card">
                <div className="chat-order-inspector__head">
                  <div className="chat-order-inspector__info">
                    <span className="chat-order-inspector__label">
                      {t("Đơn hàng đang xử lý")}
                    </span>
                    <span className="chat-order-inspector__code">
                      {customerOrder.code}
                    </span>
                  </div>
                  <div className="chat-order-inspector__token">
                    #{selected.token || genToken(selected.user_id)}
                  </div>
                </div>

                <div className="chat-order-inspector__status">
                  <span className="chat-order-inspector__status-label">
                    <Microwave
                      size={16}
                      style={{ color: "var(--st-primary)" }}
                    />
                    {t("Trạng thái hiện tại")}
                  </span>
                  <span className="chat-order-inspector__status-value">
                    {t(customerOrder.status)}
                  </span>
                </div>

                <div className="chat-order-inspector__items">
                  {(customerOrder.items || []).map((item, index) => (
                    <div
                      key={index}
                      className="chat-order-inspector__item"
                    >
                      <div className="chat-order-inspector__item-left">
                        <span className="chat-order-inspector__item-qty">
                          {item.qty}x
                        </span>
                        <span className="chat-order-inspector__item-name">
                          {t(item.name)}
                        </span>
                      </div>
                      <span className="chat-order-inspector__item-price">
                        {fmtMoney(item.price)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="chat-order-inspector__summary">
                  <div className="chat-order-inspector__row">
                    <span>{t("Tổng cộng")}</span>
                    <span>{fmtMoney(customerOrder.subtotal)}</span>
                  </div>
                  {customerOrder.discount > 0 && (
                    <div className="chat-order-inspector__row chat-order-inspector__row--success">
                      <span>{t("Giảm giá")}</span>
                      <span>-{fmtMoney(customerOrder.discount)}</span>
                    </div>
                  )}
                  <div className="chat-order-inspector__row chat-order-inspector__row--final">
                    <span className="chat-order-inspector__row-label">
                      {t("Đã thu qua")} {customerOrder.payment}:
                    </span>
                    <span className="chat-order-inspector__row-value">
                      {fmtMoney(customerOrder.total)}
                    </span>
                  </div>
                </div>

                <div className="chat-order-inspector__triggers">
                  <button
                    type="button"
                    className="chat-trigger-btn chat-trigger-btn--primary"
                    onClick={handleRecall}
                  >
                    <Megaphone size={18} />
                    {t("Bấm Loa Gọi Số")} #
                    {selected.token || genToken(selected.user_id)}
                  </button>
                  <button
                    type="button"
                    className="chat-trigger-btn"
                    onClick={handleNotify}
                  >
                    <Bell size={18} />
                    {t("Bắn thông báo 'Món Đã Sẵn Sàng'")}
                  </button>
                  <div className="chat-trigger-grid-2">
                    <button
                      type="button"
                      className="chat-trigger-btn"
                      onClick={handleSwapDish}
                    >
                      <ArrowLeftRight size={14} />
                      {t("Đổi món khác")}
                    </button>
                    <button
                      type="button"
                      className="chat-trigger-btn"
                      onClick={handleGiftVoucher}
                    >
                      <Gift size={14} />
                      {t("Tặng Voucher")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="chat-context-card"
                style={{
                  textAlign: "center",
                  padding: 20,
                  color: "var(--st-text-muted)",
                }}
              >
                {t("Khách chưa có đơn nào đang xử lý")}
              </div>
            )}
          </div>
        )}

        {/* ===== GHI CHÚ NỘI BỘ ===== */}
        {selected && (
          <div className="chat-context-card chat-context-card--fullwidth">
            <div className="chat-internal-note">
              <div className="chat-internal-note__head">
                <span className="chat-internal-note__title">
                  <Edit3 size={14} />
                  {t("Ghi chú nội bộ cho ca sau")}
                </span>
                <span className="chat-internal-note__saved">
                  {t("Tự động lưu")}
                </span>
              </div>
              <textarea
                className="chat-internal-note__textarea"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder={t("Nhập ghi chú cho nhân viên ca tối...")}
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      {/* ===== MODALS ===== */}
      <CallModal
        open={showCallModal}
        customer={selected}
        onClose={() => setShowCallModal(false)}
      />

      <PrintLabelModal
        open={showPrintModal}
        customer={selected}
        order={customerOrder}
        onClose={() => setShowPrintModal(false)}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .chat-main__icon-btn--pinned {
          background: rgba(245, 158, 11, 0.12) !important;
        }

        /* ✅ V7: banner tắt chat / admin giữ */
        .emp-chat-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          margin: 0 0 8px;
          border-radius: 10px;
          font-family: var(--st-font-body);
          font-size: 13px;
          font-weight: 600;
          line-height: 1.5;
        }
        .emp-chat-banner--danger {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #dc2626;
        }
        .emp-chat-banner--info {
          background: rgba(38, 52, 213, 0.08);
          border: 1px solid rgba(38, 52, 213, 0.25);
          color: #2634d5;
        }
      `}</style>
    </div>
  );
}