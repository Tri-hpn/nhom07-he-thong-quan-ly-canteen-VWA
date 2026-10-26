// ============================================================
// OWNERCHAT.JSX — Trang quản lý Chat cho Admin (V3 - FIX RACE CONDITION)
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, RefreshCw, Loader2, AlertCircle, Search, X,
  Headset, Send, User as UserIcon, Lock, Unlock, ShieldAlert,
  CheckCircle2, XCircle, ChevronLeft, Pin, PinOff, Bell,
  Ticket, Heart, Microwave, Smartphone, Utensils, ChevronRight
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import AdminChatControls from "../../components/AdminChatControls";
import { fmtTime, fmtDateLabel, getDateLabelVariant } from "../../lib/datetime";

const POLL_MS = 3000;
const MAX_MESSAGE_LENGTH = 2000;
const PINNED_STORAGE_KEY = "canteen.chat.admin.pinned";

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

function sameDay(a, b) {
  if (!a || !b) return false;
  try {
    const d1 = new Date(a), d2 = new Date(b);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  } catch {
    return false;
  }
}

function getInitials(name) {
  const n = (name || "VWA").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "VWA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtRelative(iso) {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Vừa xong";
    if (m < 60) return `${m}p`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return "";
  }
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("vi-VN") + "đ";
}

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

export default function OwnerChat() {
  const { t } = useI18n();
  const navigate = useNavigate();

  // ---------- Data ----------
  const [conversations, setConversations] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [convsError, setConvsError] = useState("");

  // ---------- Filter ----------
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | unread | transfer | mine

  // ---------- Selected conversation ----------
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // ---------- Context Data (Customer Info) ----------
  const [contextData, setContextData] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [currentOrderIdx, setCurrentOrderIdx] = useState(0);

  // ---------- Compose ----------
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // ---------- Pinned ----------
  const [pinnedIds, setPinnedIds] = useState(() => readPinned());

  // ---------- Transfer requests (badge) ----------
  const [transferCount, setTransferCount] = useState(0);

  const bottomRef = useRef(null);
  const messagesEndRef = useRef(null);
  const selectedRef = useRef(null);
  const msgsReqIdRef = useRef(0);
  const isSendingRef = useRef(false); // 🔴 FIX RACE CONDITION
  const lastMsgCountRef = useRef(0);
  const lastConvIdRef = useRef(null);
  const tabVisibleRef = useRef(
    typeof document === "undefined" || !document.hidden
  );

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const handler = () => {
      tabVisibleRef.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ============================================================
  // LOAD CONVERSATIONS
  // ============================================================
  const loadConvs = useCallback(
    async (silent = false) => {
      try {
        const data = await api.chat.admin.conversations();
        setConversations(Array.isArray(data) ? data : []);
        if (!silent) setConvsError("");
      } catch (e) {
        if (!silent) setConvsError(e.message || t("Không tải được hội thoại"));
      } finally {
        if (!silent) setLoadingConvs(false);
      }
    },
    [t]
  );

  const loadMessages = useCallback(
    async (userId, silent = false) => {
      if (!userId) return;
      if (silent && isSendingRef.current) return; // 🔴 CHẶN POLLING

      const myReqId = ++msgsReqIdRef.current;
      if (!silent) setLoadingMsgs(true);
      
      try {
        const data = await api.chat.admin.messagesWith(userId);
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

  const loadTransferCount = useCallback(async () => {
    try {
      const list = await api.chat.admin.transferRequests("pending");
      setTransferCount(Array.isArray(list) ? list.length : 0);
    } catch {
      setTransferCount(0);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadConvs(false);
    loadTransferCount();
  }, [loadConvs, loadTransferCount]);

  // Polling
  useEffect(() => {
    const timer = setInterval(() => {
      if (!tabVisibleRef.current) return;
      loadConvs(true);
      loadTransferCount();
      if (selectedRef.current) {
        loadMessages(selectedRef.current.user_id, true);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadConvs, loadMessages, loadTransferCount]);

  // ============================================================
  // OPEN CONVERSATION
  // ============================================================
  const openConv = useCallback(
    async (c) => {
      setSelected(c);
      setMessages([]);
      lastMsgCountRef.current = 0;
      lastConvIdRef.current = null;
      setConversations((list) =>
        list.map((x) =>
          x.user_id === c.user_id ? { ...x, unread: 0 } : x
        )
      );
      
      // Reset context data
      setContextData(null);
      setCustomerOrders([]);
      setCurrentOrderIdx(0);

      await loadMessages(c.user_id, false);
      loadConvs(true);

      // Fetch context data
      api.chat.getContext(c.user_id).then(data => {
        if (selectedRef.current?.user_id === c.user_id) setContextData(data);
      }).catch(() => {});

      // Fetch orders
      api.orders.all("Tất cả").then(allOrders => {
        if (selectedRef.current?.user_id !== c.user_id) return;
        const list = Array.isArray(allOrders) ? allOrders : [];
        const myOrders = list
          .filter(o => o.customer_id === c.user_id && !["Hoàn thành", "Đã hủy"].includes(o.status))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setCustomerOrders(myOrders);
      }).catch(() => {});
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
          bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
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

    const last = messages[messages.length - 1];
    const isOwn = last?.from === "staff" || last?.from === "admin";
    const dist =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    if (isOwn || dist < 30) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      });
    }

    lastMsgCountRef.current = messages.length;
  }, [messages, selected?.user_id]);

  // ============================================================
  // SEND
  // ============================================================
  const send = useCallback(async () => {
    const val = text.trim();
    if (!val || !selected || sending) return;
    if (val.length > MAX_MESSAGE_LENGTH) {
      toast(t("Tin nhắn tối đa {n} ký tự").replace("{n}", MAX_MESSAGE_LENGTH), "error");
      return;
    }

    isSendingRef.current = true; // 🔴
    setSending(true);
    const tempId = "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2,6);
    const tempMsg = {
      id: tempId,
      from: "staff",
      from_name: t("Admin"),
      content: val,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    setMessages((m) => [...m, tempMsg]);
    setText("");

    try {
      const msg = await api.chat.send({ content: val, toUserId: selected.user_id });
      const safeMsg = {
        ...msg,
        id: msg?.id || tempId,
        created_at: msg?.created_at || new Date().toISOString(),
        from: msg?.from || "staff",
        from_name: msg?.from_name || t("Admin"),
      };
      setMessages((m) => m.map((x) => (x.id === tempId ? safeMsg : x)));
      // loadMessages(selected.user_id, true); -> Đã bỏ
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      toast(e.message || t("Không gửi được"), "error");
    } finally {
      setSending(false);
      isSendingRef.current = false; // 🔴
    }
  }, [text, selected, sending, t]);

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ============================================================
  // PIN
  // ============================================================
  const togglePin = useCallback(() => {
    if (!selected) return;
    const uid = Number(selected.user_id);
    setPinnedIds((prev) => {
      const isPinned = prev.includes(uid);
      const next = isPinned ? prev.filter((x) => x !== uid) : [...prev, uid];
      writePinned(next);
      toast(
        isPinned ? t("Đã bỏ ghim") : t("Đã ghim lên đầu"),
        isPinned ? "info" : "success"
      );
      return next;
    });
  }, [selected, t]);

  const isSelectedPinned = selected
    ? pinnedIds.includes(Number(selected.user_id))
    : false;

  // ============================================================
  // TAKEOVER / RELEASE
  // ============================================================
  const handleTakeover = useCallback(async () => {
    if (!selected) return;
    try {
      await api.chat.admin.takeover(selected.user_id);
      toast(t("Đã tiếp quản hội thoại"), "success");
      await loadConvs(true);
    } catch (e) {
      toast(e.message || t("Không tiếp quản được"), "error");
    }
  }, [selected, loadConvs, t]);

  const handleRelease = useCallback(async () => {
    if (!selected) return;
    try {
      await api.chat.admin.release(selected.user_id);
      toast(t("Đã trả hội thoại về cho nhân viên"), "success");
      await loadConvs(true);
    } catch (e) {
      toast(e.message || t("Không trả về được"), "error");
    }
  }, [selected, loadConvs, t]);

  // ============================================================
  // COMPUTED — filtered conversations
  // ============================================================
  const filteredConversations = useMemo(() => {
    let list = conversations;

    if (search.trim()) {
      const s = search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.user_name || "").toLowerCase().includes(s) ||
          String(c.user_id || "").includes(s)
      );
    }

    if (filter === "unread") list = list.filter((c) => c.unread > 0);
    if (filter === "transfer") list = list.filter((c) => c.has_pending_transfer);
    if (filter === "mine") list = list.filter((c) => c.assigned_to === "admin");

    return [...list].sort((a, b) => {
      const ap = pinnedIds.includes(Number(a.user_id)) ? 1 : 0;
      const bp = pinnedIds.includes(Number(b.user_id)) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return new Date(b.last_time || 0) - new Date(a.last_time || 0);
    });
  }, [conversations, search, filter, pinnedIds]);

  const kpi = useMemo(() => {
    const total = conversations.length;
    const unread = conversations.filter((c) => c.unread > 0).length;
    const mine = conversations.filter((c) => c.assigned_to === "admin").length;
    return { total, unread, mine, transfer: transferCount };
  }, [conversations, transferCount]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="chat-workspace">
      {/* HERO */}
      <section className="chat-hero">
        <div className="chat-hero__left">
          <span className="chat-hero__eyebrow">
            <span className="chat-hero__eyebrow-dot" />
            {t("Giám sát & điều phối chat toàn hệ thống")}
          </span>
        </div>

        <div className="chat-hero__actions">
          <div className="chat-kpi-chip">
            <MessageCircle size={16} />
            <span>{t("Hội thoại")}: <b>{kpi.total}</b></span>
          </div>
          <div className="chat-kpi-chip chat-kpi-chip--danger">
            <Bell size={16} />
            <span>{t("Cần phản hồi")}: <b>{kpi.unread}</b></span>
          </div>
          <div className="chat-kpi-chip chat-kpi-chip--warning">
            <ShieldAlert size={16} />
            <span>{t("Yêu cầu chuyển")}: <b>{kpi.transfer}</b></span>
          </div>
          <div className="chat-kpi-chip chat-kpi-chip--info">
            <Headset size={16} />
            <span>{t("Admin đang giữ")}: <b>{kpi.mine}</b></span>
          </div>
        </div>
      </section>

      {/* 3-COLUMN GRID */}
      <div className="chat-workspace-grid">
        {/* ============== COLUMN 1: CONVERSATIONS ============== */}
        <div className="chat-conv">
          <div className="chat-conv__head">
            <div className="chat-conv__search">
              <Search size={16} className="chat-conv__search-icon" />
              <input
                className="chat-conv__search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Tìm khách hàng...")}
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
              {[
                { id: "all", label: t("Tất cả"), count: conversations.length },
                { id: "unread", label: t("Chưa đọc"), count: kpi.unread },
                { id: "transfer", label: t("Chuyển tiếp"), count: kpi.transfer },
                { id: "mine", label: t("Tôi giữ"), count: kpi.mine },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`chat-conv__filter ${filter === f.id ? "active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
          </div>

          <div className="chat-conv__body">
            {loadingConvs && (
              <div className="chat-conv__empty">
                <Loader2 size={22} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
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

            {!loadingConvs && !convsError && filteredConversations.length === 0 && (
              <div className="chat-conv__empty">
                <MessageCircle size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
                <div>{t("Không có hội thoại nào")}</div>
              </div>
            )}

            {!loadingConvs &&
              filteredConversations.map((c) => {
                const isSelected = String(selected?.user_id) === String(c.user_id);
                const hasUnread = c.unread > 0;
                const isPinned = pinnedIds.includes(Number(c.user_id));
                const isMine = c.assigned_to === "admin";
                const hasTransfer = c.has_pending_transfer;

                return (
                  <div
                    key={c.user_id}
                    role="button"
                    tabIndex={0}
                    className={`chat-conv__item ${isSelected ? "active" : ""} ${
                      hasUnread ? "chat-conv__item--unread" : "chat-conv__item--read"
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
                        <div className="chat-conv__avatar">
                          {getInitials(c.user_name)}
                        </div>
                        <div className="chat-conv__user-info">
                          <span className={`chat-conv__user-name ${hasUnread ? "chat-conv__user-name--unread" : ""}`}>
                            {isPinned && (
                              <Pin size={11} style={{ color: "#f59e0b", marginRight: 4, verticalAlign: "middle" }} fill="#f59e0b" />
                            )}
                            {c.user_name || t("Khách")}
                          </span>
                          <span className="chat-conv__user-meta">
                            {isMine ? t("Admin đang giữ") : t("Nhân viên phụ trách")}
                          </span>
                        </div>
                      </div>
                      <div className="chat-conv__time-group">
                        <span className={`chat-conv__time ${hasUnread ? "chat-conv__time--new" : ""}`}>
                          {fmtRelative(c.last_time)}
                        </span>
                      </div>
                    </div>

                    <p className={`chat-conv__preview ${hasUnread ? "chat-conv__preview--unread" : "chat-conv__preview--read"}`}>
                      "{c.last_message || t("Chưa có tin nhắn")}"
                    </p>

                    <div className="chat-conv__tags">
                      {hasTransfer && (
                        <span className="chat-conv__tag chat-conv__tag--danger">
                          <ShieldAlert size={11} /> {t("Báo Admin")}
                        </span>
                      )}
                      {isMine && (
                        <span className="chat-conv__tag chat-conv__tag--success">
                          <Headset size={11} /> {t("Đang giữ")}
                        </span>
                      )}
                      {hasUnread && <span className="chat-conv__unread-dot" />}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* ============== COLUMN 2: CHAT STREAM ============== */}
        <div className="chat-main">
          {!selected ? (
            <div className="chat-main--empty">
              <div>
                <MessageCircle size={64} style={{ opacity: 0.3, marginBottom: 12 }} />
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
                  {t("Admin có thể xem mọi hội thoại giữa nhân viên và khách")}
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
                      {selected.assigned_to === "admin" && (
                        <span className="chat-main__header-mssv" style={{ background: "rgba(38, 52, 213, 0.15)", color: "#2634d5" }}>
                          <Headset size={11} /> {t("Admin đang giữ")}
                        </span>
                      )}
                    </div>
                    <div className="chat-main__header-meta">
                      <span className="chat-main__header-meta-item">
                        <UserIcon size={12} /> ID: {selected.user_id}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="chat-main__header-actions">
                  {selected.assigned_to !== "admin" ? (
                    <button
                      type="button"
                      className="chat-main__icon-btn"
                      onClick={handleTakeover}
                      title={t("Tiếp quản hội thoại")}
                    >
                      <Headset size={18} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chat-main__icon-btn"
                      onClick={handleRelease}
                      title={t("Trả về cho nhân viên")}
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    className={`chat-main__icon-btn ${isSelectedPinned ? "chat-main__icon-btn--pinned" : ""}`}
                    onClick={togglePin}
                    title={isSelectedPinned ? t("Bỏ ghim") : t("Ghim")}
                  >
                    {isSelectedPinned ? <PinOff size={18} style={{ color: "#f59e0b" }} /> : <Pin size={18} />}
                  </button>
                </div>
              </div>

              {/* FEED */}
              <div ref={messagesEndRef} className="chat-main__feed">
                {loadingMsgs ? (
                  <div className="chat-main--empty">
                    <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-main--empty">
                    <div>
                      <MessageCircle size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div>{t("Chưa có tin nhắn")}</div>
                    </div>
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isOwn = m.from === "staff" || m.from === "admin";
                    const isAdmin = m.from === "admin";
                    const prev = messages[idx - 1];
                    const showDate = !prev || !sameDay(prev.created_at, m.created_at);

                    return (
                      <div key={m.id}>
                        {showDate && <DateDivider iso={m.created_at} />}
                        <div className={`chat-msg-row ${isOwn ? "chat-msg-row--own" : ""}`}>
                          {!isOwn && (
                            <div className="chat-msg-avatar">
                              {getInitials(m.from_name || selected.user_name)}
                            </div>
                          )}
                          <div className="chat-msg-body">
                            <div className={`chat-msg-bubble ${isOwn ? "chat-msg-bubble--own" : ""}`}>
                              {isAdmin && (
                                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.8, marginBottom: 2 }}>
                                  <Headset size={10} style={{ verticalAlign: "middle" }} /> ADMIN
                                </div>
                              )}
                              <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                            </div>
                            <span className="chat-msg-time">
                              {fmtTime(m.created_at)}
                              {m.from_name && ` • ${m.from_name}`}
                              {m._pending && ` • ${t("Đang gửi...")}`}
                            </span>
                          </div>
                          {isOwn && (
                            <div className="chat-msg-avatar chat-msg-avatar--staff">
                              {isAdmin ? <Headset size={14} /> : getInitials(m.from_name || "NV")}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* INPUT */}
              <div className="chat-input-area">
                <div className="chat-input-tools">
                  <span className="chat-input-hint">
                    {t("Admin nhắn với tư cách Quản trị viên")}
                  </span>
                </div>
                <div className="chat-input-row">
                  <input
                    type="text"
                    className="chat-input-field"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={`${t("Nhập tin nhắn...")} ${selected.user_name || t("khách")}...`}
                    disabled={sending}
                    maxLength={MAX_MESSAGE_LENGTH}
                  />
                  <button
                    type="button"
                    className="chat-input-send"
                    onClick={send}
                    disabled={sending || !text.trim()}
                  >
                    {sending ? (
                      <>
                        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                        <span>{t("Đang gửi...")}</span>
                      </>
                    ) : (
                      <>
                        <span>{t("Gửi")}</span>
                        <Send size={16} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ============== COLUMN 3: ADMIN CONTROLS & CUSTOMER INFO ============== */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          
          {/* BLOCK HỒ SƠ KHÁCH HÀNG */}
          {selected && (
            <div className="chat-context-card" style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e7ebf0" }}>
              
              {/* Nút Tặng Voucher */}
              <button
                onClick={() => navigate(`/owner/vouchers?action=create&userId=${selected.user_id}&userName=${encodeURIComponent(selected.user_name)}`)}
                style={{
                  width: "100%", padding: "10px", borderRadius: 8, border: 0, background: "#2634d5", color: "#fff",
                  fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  cursor: "pointer", marginBottom: 16
                }}
              >
                <Ticket size={16} /> {t("Tặng voucher cho khách")}
              </button>

              {/* Hồ sơ */}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, color: "var(--st-text)" }}>{t("Hồ sơ khách dùng bữa")}</span>
                <span style={{ padding: "2px 8px", background: "#f0f4ff", color: "#2634d5", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                  {contextData?.user?.tier || t("Hạng Bạc")}
                </span>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#f0f4ff", display: "grid", placeItems: "center" }}>
                  {contextData?.user?.avatar || selected.user_avatar ? (
                    <img src={contextData?.user?.avatar || selected.user_avatar} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
                  ) : <UserIcon size={24} style={{ color: "#2634d5" }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{contextData?.user?.name || selected.user_name}</div>
                  <div style={{ fontSize: 12, color: "var(--st-text-muted)", marginTop: 2 }}>{contextData?.user?.faculty || "—"}</div>
                  <div style={{ fontSize: 11, color: "#18a967", fontWeight: 600, marginTop: 2 }}>Tích lũy: {contextData?.user?.points || 0} Green Points</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 12, background: "#f5f7fb", borderRadius: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--st-text-muted)" }}>{t("Ví VWA Pay")}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--st-text)" }}>{fmtMoney(contextData?.wallet?.balance || 0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--st-text-muted)" }}>{t("Đơn tháng này")}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#2634d5" }}>{contextData?.ordersThisMonth || 0} {t("đơn")}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, padding: 12, background: "#f4f6fd", borderRadius: 8, marginBottom: 16 }}>
                <Heart size={18} style={{ color: "#2634d5", flexShrink: 0 }} />
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{t("Ghi chú khẩu vị cá nhân:")}</div>
                  <div style={{ color: "var(--st-text-muted)" }}>"Không ăn cay nhiều, ưu tiên cơm nóng, dùng ít đá giải khát."</div>
                </div>
              </div>

              {/* Đơn đang xử lý */}
              {customerOrders.length > 0 ? (() => {
                const currentOrder = customerOrders[currentOrderIdx];
                return (
                  <div style={{ border: "1px solid #e7ebf0", borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--st-text-muted)", fontWeight: 600 }}>{t("ĐƠN HÀNG ĐANG XỬ LÝ")}</div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#2634d5", marginTop: 2 }}>{currentOrder.code}</div>
                      </div>
                      {customerOrders.length > 1 && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => setCurrentOrderIdx(p => Math.max(0, p - 1))} disabled={currentOrderIdx === 0} style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #e7ebf0", background: "#fff", cursor: currentOrderIdx === 0 ? "not-allowed" : "pointer" }}><ChevronLeft size={14} /></button>
                          <button onClick={() => setCurrentOrderIdx(p => Math.min(customerOrders.length - 1, p + 1))} disabled={currentOrderIdx === customerOrders.length - 1} style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #e7ebf0", background: "#fff", cursor: currentOrderIdx === customerOrders.length - 1 ? "not-allowed" : "pointer" }}><ChevronRight size={14} /></button>
                        </div>
                      )}
                      <div style={{ padding: "4px 10px", background: "#2634d5", color: "#fff", borderRadius: 6, fontWeight: 700, fontSize: 13 }}>
                        #{selected.token || (Number(selected.user_id) % 50 + 1)}
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#f0f4ff", borderRadius: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Microwave size={14} /> {t("Trạng thái")}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#2634d5" }}>{t(currentOrder.status)}</span>
                    </div>

                    {(currentOrder.items || []).map((item, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px dashed #e7ebf0" }}>
                        <div><span style={{ fontWeight: 700 }}>{item.qty}x</span> {t(item.name)}</div>
                        <div style={{ fontWeight: 600 }}>{fmtMoney(item.price)}</div>
                      </div>
                    ))}

                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 13, fontWeight: 700 }}>
                      <span>{t("Tổng cộng")}</span>
                      <span>{fmtMoney(currentOrder.subtotal)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 13, fontWeight: 700, color: "#18a967" }}>
                      <span>{t("Đã thu qua")} {currentOrder.payment}:</span>
                      <span>{fmtMoney(currentOrder.total)}</span>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ textAlign: "center", padding: 20, color: "var(--st-text-muted)", fontSize: 12 }}>
                  {t("Khách chưa có đơn nào đang xử lý")}
                </div>
              )}
            </div>
          )}

          <AdminChatControls
            onTransferCountChange={setTransferCount}
            onTakeoverUser={(userId) => {
              const c = conversations.find((x) => String(x.user_id) === String(userId));
              if (c) openConv(c);
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .chat-main__icon-btn--pinned {
          background: rgba(245, 158, 11, 0.12) !important;
        }
        .chat-kpi-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          background: var(--st-surface-container, #eaedff);
          font-family: var(--st-font-body);
          font-size: 12px;
          color: var(--st-text);
        }
        .chat-kpi-chip--danger {
          background: rgba(239, 68, 68, 0.12);
          color: #dc2626;
        }
        .chat-kpi-chip--warning {
          background: rgba(245, 158, 11, 0.12);
          color: #b45309;
        }
        .chat-kpi-chip--info {
          background: rgba(38, 52, 213, 0.12);
          color: #2634d5;
        }
      `}</style>
    </div>
  );
}