// ============================================================
// EMPLOYEECHAT.JSX — Trung tâm Chat & Hỗ trợ khách (V5)
// ============================================================
// Layout 3 cột: Conversation list + Chat stream + Context inspector
//
// ✅ V3:
//   - Badge ngày ở giữa chat khi đổi ngày (Hôm nay/Hôm qua/X ngày/dd/mm)
//   - Auto-scroll: immediate lần đầu mở, smooth khi có tin mới
//   - Không auto-scroll khi user kéo lên đọc tin cũ
// 🔧 FIX #79: truyền vars vào t() thay vì .replace("{n}", ...) thủ công
// 🔧 UI: xoá H1 + P trong chat-hero (giữ eyebrow + nút)
// 🔧 V4: Di chuyển block "Ghi chú nội bộ" xuống dưới, trải dài cột 1+2
// 🔧 V5: Fetch dữ liệu thật cho cột 3 Context Inspector
// ============================================================

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MessageCircle, RefreshCw, Loader2, AlertCircle, Search, X, Phone,
  Vibrate, Printer, Pin, ImagePlus, Smile, MessageSquareMore, Ticket,
  Send, Zap, Headset, User as UserIcon, Clock, Smartphone, Utensils,
  CheckCircle2, Heart, Edit3, Megaphone, Bell, ArrowLeftRight, Gift,
  Microwave, Receipt, BadgeCheck, Sparkles, Package, Check, Bolt,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import {
  fmtTime,
  fmtDateTime,
  fmtDateLabel,
  getDateLabelVariant,
} from "../../lib/datetime";

// ============================================================
// CONSTANTS
// ============================================================

const POLL_INTERVAL_MS = 3000;
const SCROLL_THRESHOLD_PX = 120;
const MAX_MESSAGE_LENGTH = 2000;

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

// Kiểm tra 2 tin nhắn có cùng ngày không
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
// MAIN COMPONENT
// ============================================================

export default function EmployeeChat() {
  const { t } = useI18n();

  // ---- Conversations ----
  const [conversations, setConversations] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [convsError, setConvsError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // ---- Selected + messages ----
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // ---- Context Inspector ----
  const [contextData, setContextData] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // ---- Input ----
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // ---- Internal note ----
  const [internalNote, setInternalNote] = useState(
    "Sinh viên lịch sự, đã cập nhật Barista đổi trà sen ít ngọt 30% đường theo yêu cầu thành công."
  );

  // ---- Refs ----
  const bottomRef = useRef(null);
  const messagesEndRef = useRef(null);
  const selectedRef = useRef(null);
  const msgsReqIdRef = useRef(0);

  // ✅ Refs cho smart scroll
  const lastMsgCountRef = useRef(0);
  const lastConvIdRef = useRef(null); // Conversation đã scroll lần đầu

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

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

  // Polling
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
  // OPEN CONVERSATION
  // ============================================================

  const openConv = useCallback(
    async (c) => {
      setSelected(c);
      setMessages([]);
      setInternalNote(c.note || "");
      // ✅ Reset scroll state để scroll immediate khi load xong
      lastMsgCountRef.current = 0;
      lastConvIdRef.current = null;
      await loadMessages(c.user_id, false);

      // 🔧 FIX: Fetch context data
      setLoadingContext(true);
      api.chat
        .getContext(c.user_id)
        .then((data) => {
          // Chỉ set data nếu vẫn đang chat với user này
          if (selectedRef.current?.user_id === c.user_id) {
            setContextData(data);
          }
        })
        .catch(() => setContextData(null))
        .finally(() => setLoadingContext(false));

      setConversations((list) =>
        list.map((x) =>
          x.user_id === c.user_id ? { ...x, unread: 0 } : x
        )
      );
    },
    [loadMessages]
  );

  // ============================================================
  // AUTO SCROLL (SMART)
  // ============================================================
  // Logic:
  //   1. Lần đầu mở conversation (convId khác) → scroll immediate xuống cuối
  //   2. Có tin mới (grew) + user gần cuối → scroll smooth
  //   3. Tin cuối là tin của chính mình → scroll smooth (luôn cuộn)
  //   4. User kéo lên đọc tin cũ (grew nhưng xa cuối) → KHÔNG scroll

  useEffect(() => {
    const container = messagesEndRef.current;
    if (!container) return;

    const convId = selected?.user_id ?? null;

    // ✅ Trường hợp 1: conversation mới (hoặc lần đầu)
    const isNewConv = convId !== lastConvIdRef.current;

    if (isNewConv && messages.length > 0) {
      // Đợi DOM render xong rồi scroll
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

    // ✅ Trường hợp 2-4: chỉ xử lý khi có tin mới
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

    // ✅ Chỉ scroll nếu: tin của chính mình HOẶC user đang gần cuối
    if (isOwnMessage || isNearBottom) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    }
    // Nếu user đang kéo lên đọc tin cũ → KHÔNG scroll

    lastMsgCountRef.current = messages.length;
  }, [messages, selected?.user_id]);

  // ============================================================
  // SEND
  // ============================================================

  const send = useCallback(
    async (contentOverride) => {
      const val = (contentOverride ?? text).trim();
      if (!val || !selected || sending) return;
      if (val.length > MAX_MESSAGE_LENGTH) {
        // 🔧 FIX #79: truyền vars vào t() thay vì .replace("{n}", ...) thủ công
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
        setMessages((m) => m.map((x) => (x.id === tempId ? msg : x)));
        loadMessages(selected.user_id, true);
      } catch (e) {
        setMessages((m) => m.filter((x) => x.id !== tempId));
        toast(e.message || t("Không gửi được"), "error");
      } finally {
        setSending(false);
      }
    },
    [text, selected, sending, loadMessages, t]
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

    if (filter === "unread") list = list.filter((c) => c.unread > 0);
    if (filter === "urgent") list = list.filter((c) => c.urgent);
    if (filter === "processing")
      list = list.filter((c) => c.status === "processing");

    return list;
  }, [conversations, search, filter]);

  const kpi = useMemo(() => {
    const online = 3;
    const total = conversations.length;
    const unread = conversations.filter((c) => c.unread > 0).length;
    const urgent = conversations.filter((c) => c.urgent).length;

    return { online, total, unread, urgent };
  }, [conversations]);

  // ============================================================
  // ACTION HANDLERS
  // ============================================================

  const handlePrintLabel = () =>
    toast(t("Đang gửi lệnh in tem dán ly..."), "success");
  const handleCall = () => toast(t("Đang gọi cho khách..."), "info");
  const handleVibrate = () =>
    toast(t("Đã gửi rung thông báo khẩn"), "success");
  const handleRecall = () => {
    if (!selected) return;
    toast(
      `${t("Đang phát loa: Mời số")} #${genToken(
        selected.user_id
      )} ${t("đến nhận món")}`,
      "info"
    );
  };
  const handleNotify = () =>
    toast(t("Đã gửi thông báo 'Món đã sẵn sàng'"), "success");
  const handleTransferAdmin = () =>
    toast(t("Đã chuyển hội thoại lên Admin"), "info");
  const handleMacros = () => toast(t("Mở cấu hình Macros..."), "info");
  const handleAutoDone = () => toast(t("Bật tự động báo món xong"), "success");
  const handleAddTo86 = () => toast(t("Đã báo hết món liên quan"), "warning");
  const handleGiftVoucher = () => toast(t("Đã tặng voucher xin lỗi"), "success");
  const handleSwapDish = () =>
    toast(t("Đã gửi yêu cầu đổi món lên bếp"), "info");

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="chat-workspace">
      {/* ============ HERO ============ */}
      {/* 🔧 UI: xoá H1 + P — chỉ giữ eyebrow + cụm nút bên phải */}
      <section className="chat-hero">
        <div className="chat-hero__left">
          <span className="chat-hero__eyebrow">
            <span className="chat-hero__eyebrow-dot" />
            {t("Trực ca hỗ trợ thời gian thực")}
          </span>
        </div>

        <div className="chat-hero__actions">
          <button type="button" className="chat-hero__action" onClick={handleAutoDone}>
            <Zap size={18} />
            <span>{t("Tự động báo món xong")}</span>
          </button>
          <button type="button" className="chat-hero__action" onClick={handleMacros}>
            <Sparkles size={18} />
            <span>{t("Cấu hình Macros")}</span>
          </button>
          <button
            type="button"
            className="chat-hero__action chat-hero__action--danger"
            onClick={handleTransferAdmin}
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
                  {f.dot && filter !== f.id && (
                    <span className="chat-conv__filter-dot" />
                  )}
                  {f.id === "urgent" && kpi.urgent > 0 && ` (${kpi.urgent})`}
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

                return (
                  <div
                    key={c.user_id}
                    role="button"
                    tabIndex={0}
                    className={`chat-conv__item ${
                      isSelected ? "active" : ""
                    } ${isUrgent ? "chat-conv__item--urgent" : ""} ${
                      !hasUnread && !isUrgent ? "chat-conv__item--muted" : ""
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
                          <span className="chat-conv__user-name">
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
                          ? "chat-conv__preview--medium"
                          : "chat-conv__preview--muted"
                      }`}
                    >
                      "{c.last_message || t("Chưa có tin nhắn")}"
                    </p>

                    {(c.statusLabel || hasUnread) && (
                      <div className="chat-conv__tags">
                        {c.statusLabel ? (
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
                    className="chat-main__icon-btn"
                    title={t("Ghim hội thoại")}
                    aria-label={t("Ghim hội thoại")}
                  >
                    <Pin size={18} />
                  </button>
                </div>
              </div>

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
                    // ✅ Chèn badge ngày nếu đổi ngày
                    const showDate =
                      !prev ||
                      !sameDay(prev.created_at, m.created_at);

                    return (
                      <div key={m.id}>
                        {showDate && (
                          <DateDivider iso={m.created_at} />
                        )}

                        <div
                          className={`chat-msg-row ${
                            isOwn ? "chat-msg-row--own" : ""
                          }`}
                        >
                          {!isOwn && (
                            <div className="chat-msg-avatar">
                              {getInitials(m.from_name || selected.user_name)}
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
                    disabled={sending}
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
                    disabled={sending}
                    maxLength={MAX_MESSAGE_LENGTH}
                  />
                  <button
                    type="button"
                    className="chat-input-send"
                    onClick={() => send()}
                    disabled={sending || !text.trim()}
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
                  {(contextData?.user?.avatar || selected.user_avatar) ? (
                    <img
                      src={contextData?.user?.avatar || selected.user_avatar}
                      alt={selected.user_name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = "none"; // Hide broken image
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
                    {contextData?.user?.name || selected.user_name || t("Khách")}
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

            {contextData?.currentOrder ? (
              <div className="chat-context-card">
                <div className="chat-order-inspector__head">
                  <div className="chat-order-inspector__info">
                    <span className="chat-order-inspector__label">
                      {t("Đơn hàng đang xử lý")}
                    </span>
                    <span className="chat-order-inspector__code">
                      {contextData.currentOrder.code}
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
                    {t(contextData.currentOrder.status)}
                  </span>
                </div>

                <div className="chat-order-inspector__items">
                  {contextData.currentOrder.items.map((item, index) => (
                    <div key={index} className="chat-order-inspector__item">
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
                    <span>{fmtMoney(contextData.currentOrder.subtotal)}</span>
                  </div>
                  {contextData.currentOrder.discount > 0 && (
                    <div className="chat-order-inspector__row chat-order-inspector__row--success">
                      <span>{t("Giảm giá")}</span>
                      <span>-{fmtMoney(contextData.currentOrder.discount)}</span>
                    </div>
                  )}
                  <div className="chat-order-inspector__row chat-order-inspector__row--final">
                    <span className="chat-order-inspector__row-label">
                      {t("Đã thu qua")} {contextData.currentOrder.payment}:
                    </span>
                    <span className="chat-order-inspector__row-value">
                      {fmtMoney(contextData.currentOrder.total)}
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

        {/* ===== BLOCK GHI CHÚ NỘI BỘ — TRẢI DÀI CỘT 1 + 2 ===== */}
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

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}