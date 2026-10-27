// ============================================================
// CHATBOTWIDGET.JSX — Chat popup nổi (V7 - FIX AUTH GUARD)
// ============================================================
// V7 (2026-11):
//   🔧 FIX: Thêm getToken() guard cho:
//     - loadStaff (polling 3s — spam 401 nếu session hết)
//     - settings fetch (mount)
//     - currentStaff fetch (khi mở widget)
//     - sendStaff / sendOrderSupport (toast rõ ràng)
//   🔧 FIX: useEffect supportRequest thêm onSupportRequestHandled vào deps
// V6 (2026-10):
//   - Fix race poll vs send (isSendingRef)
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bot, X, Send, ShoppingCart, Store, MessageCircleHeart, Loader2,
  AlertCircle, RefreshCw, Sparkles, Headset, ArrowRight, Flame, Phone,
} from "lucide-react";
import { api, getToken } from "../api";
import { money } from "./UI";
import { toast } from "./Effects";
import { getBotReply } from "./ChatBot";
import { useI18n } from "../hooks/useI18n";
import FoodDetailModal from "./FoodDetailModal";

// ============================================================
// CONSTANTS
// ============================================================

const QUICK_REPLIES_KEYS = [
  "Dưới 30k",
  "Món chay",
  "Đồ uống",
  "Món cay",
  "Bán chạy",
  "Gợi ý",
];

const PROMPT_SUGGESTIONS = [
  { icon: "🥗", text: "Gợi ý món ít calo dưới 45k" },
  { icon: "⚡", text: "Món nào ra nhanh dưới 5 phút?" },
  { icon: "🌱", text: "Thực đơn chay thanh đạm hôm nay" },
  { icon: "💰", text: "Món ngon sinh viên tiết kiệm nhất" },
  { icon: "⚠️", text: "Món cam kết KHÔNG chứa hải sản" },
];

const AI_REPLY_DELAY_MS = 600;
const POLL_MS = 3000;
const MAX_MESSAGE_LENGTH = 2000;
const SCROLL_THRESHOLD_PX = 30;

// ============================================================
// HELPERS
// ============================================================

function makeId(prefix) {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${rand}`;
}

function fmtTime(iso, t) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";

    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return `${hh}:${mi}`;
    if (diffDays === 1) {
      const yesterday = t ? t("Hôm qua") : "Hôm qua";
      return `${hh}:${mi} • ${yesterday}`;
    }
    return `${hh}:${mi} • ${dd}/${mm}`;
  } catch {
    return "";
  }
}

function getMaxQty(item) {
  if (typeof item?.stock === "number") return Math.max(1, item.stock);
  return 99;
}

function getInitials(name) {
  const n = (name || "VWA").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "VWA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ChatBotWidget({ cart, setCart, user, hideLauncher = false, supportRequest = null, onSupportRequestHandled }) {
  const { t, tData } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const openFromOrderHelp = (event) => {
      const detail = event?.detail;
      setMode("staff");
      setOpen(true);

      if (detail?.message) {
        setOrderSupportRequest({
          requestId: detail.requestId || `${Date.now()}`,
          message: detail.message
        });
      }
    };

    window.addEventListener("canteen-open-chatbot", openFromOrderHelp);
    return () => {
      window.removeEventListener("canteen-open-chatbot", openFromOrderHelp);
    };
  }, []);
  const [mode, setMode] = useState("ai");

  // AI messages
  const [aiMessages, setAiMessages] = useState([]);
  const [aiText, setAiText] = useState("");
  const [aiTyping, setAiTyping] = useState(false);

  // Staff messages
  const [staffMessages, setStaffMessages] = useState([]);
  const [staffText, setStaffText] = useState("");
  const [staffSending, setStaffSending] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [orderSupportRequest, setOrderSupportRequest] = useState(null);

  // DIRECT ORDER SUPPORT PROP
  useEffect(() => {
    if (!supportRequest?.message) return;
    setMode("staff");
    setOrderSupportRequest(supportRequest);
    setOpen(true);
    if (typeof onSupportRequestHandled === "function") {
      onSupportRequestHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportRequest]);

  // Data
  const [menuItems, setMenuItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hasNew, setHasNew] = useState(false);

  // Current staff
  const [currentStaff, setCurrentStaff] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);

  // Refs
  const staffReqIdRef = useRef(0);
  const orderSupportSentRef = useRef(null);
  const aiTimerRef = useRef(null);
  const lastAiCountRef = useRef(0);
  const lastStaffCountRef = useRef(0);
  const aiScrollRef = useRef(null);
  const staffScrollRef = useRef(null);
  const aiBottomRef = useRef(null);
  const staffBottomRef = useRef(null);
  const lastUserIdRef = useRef(user?.id);
  const isSendingRef = useRef(false);

  // ============================================================
  // LOAD MENU + SETTINGS
  // ============================================================
  useEffect(() => {
    let cancelled = false;

    api.menu
      .listActive("", "Tất cả", "popular")
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d) ? d : [];
        setMenuItems(list.filter((m) => m.active));
      })
      .catch(() => {
        if (!cancelled) setMenuItems([]);
      });

    // 🔧 FIX V7: guard token cho settings (endpoint yêu cầu auth)
    if (!getToken()) {
      setSettings(null);
    } else {
      api.settings
        .get()
        .then((d) => {
          if (!cancelled) setSettings(d || null);
        })
        .catch(() => {
          if (!cancelled) setSettings(null);
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // ============================================================
  // LOAD CURRENT STAFF
  // ============================================================
  useEffect(() => {
    if (!open) return;

    // 🔧 FIX V7: guard token — tránh 401 khi widget mở sau khi session hết
    if (!getToken()) {
      setCurrentStaff(null);
      setShiftLoading(false);
      return;
    }

    let cancelled = false;
    setShiftLoading(true);

    api.shifts
      .currentStaff()
      .then((staff) => {
        if (!cancelled) setCurrentStaff(staff || null);
      })
      .catch(() => {
        if (!cancelled) setCurrentStaff(null);
      })
      .finally(() => {
        if (!cancelled) setShiftLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // ============================================================
  // RESET KHI USER ĐỔI
  // ============================================================
  useEffect(() => {
    if (lastUserIdRef.current !== user?.id) {
      lastUserIdRef.current = user?.id;
      setAiMessages([]);
      setStaffMessages([]);
      setAiText("");
      setStaffText("");
      lastAiCountRef.current = 0;
      lastStaffCountRef.current = 0;
    }
  }, [user?.id]);

  // ============================================================
  // RESET SCROLL REFS KHI MỞ LẠI PANEL
  // ============================================================
  useEffect(() => {
    if (open) {
      lastAiCountRef.current = 0;
      lastStaffCountRef.current = 0;
    }
  }, [open]);

  // ============================================================
  // WELCOME MESSAGE
  // ============================================================
  useEffect(() => {
    if (!open || mode !== "ai") return;
    if (aiMessages.length > 0) return;

    setAiMessages([
      {
        id: "welcome",
        from: "bot",
        content: t("Xin chào {name}! Mình có thể giúp gì cho bạn?").replace(
          "{name}",
          user?.name || t("Khách")
        ),
        created_at: new Date().toISOString(),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, user?.name, aiMessages.length]);

  // Cleanup AI timer
  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

  // ============================================================
  // LOAD STAFF
  // ============================================================
  const loadStaff = useCallback(
    async (silent = true) => {
      // 🔧 FIX V7 CRITICAL: guard token — polling 3s sẽ spam 401 khi session hết
      if (!getToken()) return;

      // 🔴 FIX V6: Chặn Polling nếu đang gửi tin
      if (silent && isSendingRef.current) return;

      const myReqId = ++staffReqIdRef.current;

      if (!silent) {
        setStaffLoading(true);
        setStaffError("");
      }

      try {
        const data = await api.chat.myMessages();
        if (myReqId !== staffReqIdRef.current) return;
        setStaffMessages(Array.isArray(data) ? data : []);
      } catch (e) {
        if (myReqId === staffReqIdRef.current && !silent) {
          setStaffError(e.message || t("Không tải được tin nhắn"));
        }
      } finally {
        if (myReqId === staffReqIdRef.current) setStaffLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (!open || mode !== "staff") return;
    loadStaff(false);
    const timer = setInterval(() => loadStaff(true), POLL_MS);
    return () => clearInterval(timer);
  }, [open, mode, loadStaff]);

  // ============================================================
  // AUTO-SCROLL AI
  // ============================================================
  useEffect(() => {
    if (!open || mode !== "ai") return;
    const container = aiScrollRef.current;
    if (!container) return;

    const isInitial = lastAiCountRef.current === 0;
    const grew = aiMessages.length > lastAiCountRef.current;
    const last = aiMessages[aiMessages.length - 1];
    const isOwn = last?.from === "user";

    const dist =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = dist < SCROLL_THRESHOLD_PX;

    if (isInitial || isOwn || (grew && nearBottom) || aiTyping) {
      requestAnimationFrame(() => {
        aiBottomRef.current?.scrollIntoView({
          behavior: isInitial ? "auto" : "auto",
        });
      });
    }

    lastAiCountRef.current = aiMessages.length;
  }, [open, mode, aiMessages, aiTyping]);

  // ============================================================
  // AUTO-SCROLL STAFF
  // ============================================================
  useEffect(() => {
    if (!open || mode !== "staff") return;
    const container = staffScrollRef.current;
    if (!container) return;

    const isInitial = lastStaffCountRef.current === 0;
    const grew = staffMessages.length > lastStaffCountRef.current;
    const last = staffMessages[staffMessages.length - 1];
    const isOwn = last?.from === "customer";

    const dist =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = dist < SCROLL_THRESHOLD_PX;

    if (isInitial || isOwn || (grew && nearBottom)) {
      requestAnimationFrame(() => {
        staffBottomRef.current?.scrollIntoView({
          behavior: isInitial ? "auto" : "auto",
        });
      });
    }

    lastStaffCountRef.current = staffMessages.length;
  }, [open, mode, staffMessages]);

  // ============================================================
  // ĐÁNH DẤU CÓ TIN MỚI KHI ĐÓNG
  // ============================================================
  useEffect(() => {
    if (open) {
      setHasNew(false);
      return;
    }
    if (staffMessages.length > 0) {
      const last = staffMessages[staffMessages.length - 1];
      if (last?.from === "staff") setHasNew(true);
    }
  }, [open, staffMessages]);

  // ============================================================
  // ESC + LOCK BODY
  // ============================================================
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // ============================================================
  // SEND AI
  // ============================================================
  const sendAI = useCallback(
    (value) => {
      const val = (value || aiText).trim();
      if (!val || aiTyping) return;

      if (val.length > MAX_MESSAGE_LENGTH) {
        toast(
          t("Tin nhắn tối đa {n} ký tự").replace(
            "{n}",
            MAX_MESSAGE_LENGTH
          ),
          "error"
        );
        return;
      }

      setAiText("");
      setAiMessages((m) => [
        ...m,
        {
          id: makeId("u"),
          from: "user",
          content: val,
          created_at: new Date().toISOString(),
        },
      ]);
      setAiTyping(true);

      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);

      aiTimerRef.current = setTimeout(() => {
        aiTimerRef.current = null;
        const reply = getBotReply(val, menuItems, settings, t);
        setAiTyping(false);
        if (!reply) return;

        setAiMessages((m) => [
          ...m,
          {
            id: makeId("b"),
            from: "bot",
            content: reply.text,
            items: reply.items || [],
            created_at: new Date().toISOString(),
          },
        ]);
      }, AI_REPLY_DELAY_MS);
    },
    [aiText, aiTyping, menuItems, settings, t]
  );

  // ============================================================
  // SEND STAFF
  // ============================================================
  const sendStaff = useCallback(async () => {
    const val = staffText.trim();
    if (!val || staffSending) return;

    // 🔧 FIX V7: guard token với thông báo rõ ràng
    if (!getToken()) {
      toast(t("Vui lòng đăng nhập để gửi tin nhắn"), "error");
      return;
    }

    if (val.length > MAX_MESSAGE_LENGTH) {
      toast(
        t("Tin nhắn tối đa {n} ký tự").replace("{n}", MAX_MESSAGE_LENGTH),
        "error"
      );
      return;
    }

    isSendingRef.current = true;
    setStaffSending(true);
    try {
      const msg = await api.chat.send({ content: val });
      setStaffText("");
      setStaffMessages((m) => {
        if (m.some((x) => x.id === msg.id)) return m;
        return [...m, msg];
      });
    } catch (e) {
      toast(e.message || t("Không gửi được tin nhắn"), "error");
    } finally {
      setStaffSending(false);
      isSendingRef.current = false;
    }
  }, [staffText, staffSending, t]);

  // ============================================================
  // Chi gui thong tin don khi khach bam nut xac nhan
  const sendOrderSupport = useCallback(async () => {
    const request = orderSupportRequest;
    if (!request?.message || staffSending) return;
    if (orderSupportSentRef.current === request.requestId) return;

    // 🔧 FIX V7: guard token
    if (!getToken()) {
      toast(t("Vui lòng đăng nhập để gửi yêu cầu"), "error");
      return;
    }

    orderSupportSentRef.current = request.requestId;
    isSendingRef.current = true;
    setStaffSending(true);

    try {
      const msg = await api.chat.send({ content: request.message });

      setStaffMessages((current) => {
        const newId = msg?.id ?? msg?._id;
        if (
          newId != null &&
          current.some((existing) => (existing?.id ?? existing?._id) === newId)
        ) {
          return current;
        }
        return [...current, msg];
      });

      setStaffText("");
      setOrderSupportRequest((current) =>
        current?.requestId === request.requestId ? null : current
      );
      toast(t("Đã gửi yêu cầu kiểm tra đơn tới quầy bếp."), "success");
    } catch (e) {
      orderSupportSentRef.current = null;
      setStaffText(request.message);
      toast(
        e.message || t("Không gửi được yêu cầu tới quầy bếp. Vui lòng thử lại."),
        "error"
      );
    } finally {
      setStaffSending(false);
      isSendingRef.current = false;
    }
  }, [orderSupportRequest, staffSending, t]);

  // ============================================================
  // QUICK ADD
  // ============================================================
  const quickAdd = useCallback(
    (m) => {
      const id = m._id || m.id;
      const key = `${id}-S-`;
      const maxQty = getMaxQty(m);

      let added = false;
      let reason = "";

      setCart((c) => {
        const existing = c[key];
        const currentQty = Number(existing?.qty) || 0;
        if (currentQty >= maxQty) {
          reason = t("Chỉ còn {n} phần trong kho").replace(
            "{n}",
            maxQty
          );
          return c;
        }
        added = true;
        const newQty = Math.min(maxQty, currentQty + 1);
        return {
          ...c,
          [key]: {
            ...m,
            name: m.name,
            price: m.price,
            qty: newQty,
            stock: m.stock ?? 99,
            _originalId: id,
          },
        };
      });

      if (added) {
        toast(
          t("Đã thêm {name} vào giỏ").replace("{name}", m.name),
          "success"
        );
      } else {
        toast(reason, "error");
      }
    },
    [setCart, t]
  );

  // ============================================================
  // TOGGLE MODE
  // ============================================================
  const toggleMode = useCallback(() => {
    setMode((m) => (m === "ai" ? "staff" : "ai"));
  }, []);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {!hideLauncher && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("Trợ lý Canteen")}
          className="chatbot-fab"
        >
          <MessageCircleHeart size={26} />
          {hasNew && <span className="chatbot-fab__badge">1</span>}
          <span className="chatbot-pulse" />
        </button>
      )}

      {open && (
        <div
          className="chatbot-panel-v2"
          role="dialog"
          aria-modal="true"
          aria-label={t("Trợ lý Canteen")}
        >
          <header className="chatbot-header">
            <div className="chatbot-header__row">
              <div className="chatbot-header__info">
                <div className="chatbot-header__avatar">
                  {mode === "ai" ? <Bot size={22} /> : <Headset size={22} />}
                  {mode === "ai" && <span className="chatbot-header__online" />}
                </div>
                <div className="chatbot-header__text">
                  <b>
                    {mode === "ai"
                      ? t("Canteen VWA Smart Assistant")
                      : t("Nhân viên Canteen")}
                  </b>
                  <span>
                    {mode === "ai"
                      ? t("Đồng bộ thực đơn thời gian thực & Dữ liệu Viện Dinh Dưỡng")
                      : t("Đang mở ca trưa • Phản hồi < 1 phút")}
                  </span>
                </div>
              </div>

              <div className="chatbot-header__actions">
                <button
                  type="button"
                  className="chatbot-header__btn"
                  onClick={toggleMode}
                  title={
                    mode === "ai"
                      ? t("Chuyển sang gặp Nhân viên quầy")
                      : t("Quay lại Trợ lý AI")
                  }
                >
                  {mode === "ai" ? (
                    <>
                      <Headset size={16} />
                      <span>{t("Gặp Quầy Bếp")}</span>
                    </>
                  ) : (
                    <>
                      <Bot size={16} />
                      <span>{t("Trợ lý AI")}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="chatbot-header__icon-btn"
                  onClick={() => {
                    setAiMessages([]);
                    lastAiCountRef.current = 0;
                  }}
                  title={t("Làm mới cuộc trò chuyện")}
                >
                  <RefreshCw size={16} />
                </button>

                <button
                  type="button"
                  className="chatbot-header__icon-btn chatbot-header__close"
                  onClick={() => setOpen(false)}
                  title={t("Đóng")}
                  aria-label={t("Đóng")}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="chatbot-body" style={mode === "staff" ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}>
            {mode === "ai" && (
              <aside className="chatbot-side chatbot-side--left">
                <LeftSidebar
                  user={user}
                  t={t}
                  onPromptClick={(text) => {
                    setMode("ai");
                    sendAI(text);
                  }}
                />
              </aside>
            )}

            <section className="chatbot-center">
              {mode === "ai" ? (
                <AIContent
                  messages={aiMessages}
                  typing={aiTyping}
                  onSend={sendAI}
                  text={aiText}
                  setText={setAiText}
                  onQuickAdd={quickAdd}
                  onView={setSelected}
                  scrollRef={aiScrollRef}
                  bottomRef={aiBottomRef}
                  t={t}
                  tData={tData}
                />
              ) : (
                <>
                  {orderSupportRequest?.message && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                        padding: "12px 14px",
                        margin: "12px 14px 0",
                        border: "1px solid #dbeafe",
                        borderRadius: 14,
                        background: "#f3f6ff",
                        flex: "0 0 auto"
                      }}
                    >
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <strong
                          style={{
                            display: "block",
                            color: "#172554",
                            marginBottom: 4
                          }}
                        >
                          {t("Cần quầy bếp kiểm tra đơn này?")}
                        </strong>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#475569",
                            lineHeight: 1.5
                          }}
                        >
                          {t("Gửi mã đơn, món ăn, số lượng, trạng thái và tổng tiền trực tiếp cho nhân viên.")}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={staffSending}
                        onClick={sendOrderSupport}
                        style={{
                          border: 0,
                          borderRadius: 10,
                          padding: "10px 14px",
                          background: staffSending ? "#94a3b8" : "#2634d5",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: staffSending ? "wait" : "pointer"
                        }}
                      >
                        {staffSending
                          ? t("Đang gửi yêu cầu...")
                          : t("Gửi yêu cầu đến quầy bếp")}
                      </button>
                    </div>
                  )}
                  <StaffContent
                    messages={staffMessages}
                    loading={staffLoading}
                    error={staffError}
                    onRetry={() => loadStaff(false)}
                    sending={staffSending}
                    onSend={sendStaff}
                    text={staffText}
                    setText={setStaffText}
                    scrollRef={staffScrollRef}
                    bottomRef={staffBottomRef}
                    t={t}
                  />
                </>
              )}
            </section>

            {mode === "ai" && (
              <aside className="chatbot-side chatbot-side--right">
                <RightSidebar
                  user={user}
                  t={t}
                  currentStaff={currentStaff}
                  shiftLoading={shiftLoading}
                />
              </aside>
            )}
          </div>
        </div>
      )}

      {selected && (
        <FoodDetailModal
          item={selected}
          cart={cart}
          setCart={setCart}
          user={user}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

// ============================================================
// LeftSidebar
// ============================================================

function LeftSidebar({ user, t, onPromptClick }) {
  return (
    <>
      <div className="chatbot-card">
        <div className="chatbot-profile">
          <div className="chatbot-profile__avatar">
            {getInitials(user?.name)}
          </div>
          <div className="chatbot-profile__info">
            <b>{user?.name || t("Khách")}</b>
            <span>
              {t("MSSV:")} {user?.studentId || "—"}
            </span>
          </div>
          <span className="chatbot-profile__badge">SV</span>
        </div>

        <div className="chatbot-profile__stats">
          <div className="chatbot-profile__stat">
            <span className="chatbot-profile__stat-label">
              {t("Ví VWA Pay")}
            </span>
            <span className="chatbot-profile__stat-value chatbot-profile__stat-value--blue">
              {money(user?.balance || 0)}
            </span>
          </div>
          <div className="chatbot-profile__stat">
            <span className="chatbot-profile__stat-label">
              {t("Xu thưởng")}
            </span>
            <span className="chatbot-profile__stat-value chatbot-profile__stat-value--blue">
              {user?.points || 0} pts
            </span>
          </div>
        </div>

        <div className="chatbot-profile__tags-wrap">
          <div className="chatbot-profile__tags-label">
            <Sparkles size={12} />
            {t("Hồ sơ ẩm thực đã lưu:")}
          </div>
          <div className="chatbot-profile__tags">
            <span className="chatbot-tag">{t("Ít cay")}</span>
            <span className="chatbot-tag chatbot-tag--error">
              {t("Dị ứng hải sản")}
            </span>
            <span className="chatbot-tag chatbot-tag--green">
              {t("Healthy")}
            </span>
          </div>
        </div>
      </div>

      <div className="chatbot-card">
        <div className="chatbot-card__head">
          <Sparkles size={16} />
          <span>{t("Gợi ý câu hỏi thông minh")}</span>
        </div>
        <div className="chatbot-prompts">
          {PROMPT_SUGGESTIONS.map((p, i) => (
            <PromptButton
              key={i}
              icon={p.icon}
              text={t(p.text)}
              onClick={() => onPromptClick(p.text)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function PromptButton({ icon, text, onClick }) {
  return (
    <button
      type="button"
      className="chatbot-prompt-btn"
      onClick={onClick}
    >
      <span className="chatbot-prompt-btn__text">
        {icon} {text}
      </span>
      <ArrowRight size={14} className="chatbot-prompt-btn__arrow" />
    </button>
  );
}

// ============================================================
// RightSidebar
// ============================================================

function RightSidebar({ user, t, currentStaff, shiftLoading }) {
  return (
    <>
      <div className="chatbot-card">
        <div className="chatbot-card__head chatbot-card__head--row">
          <div className="chatbot-card__head-left">
            <Flame size={16} />
            <span>{t("Dinh dưỡng khuyến nghị")}</span>
          </div>
          <span className="chatbot-card__head-sub">{t("Ca Chiều")}</span>
        </div>

        <div className="chatbot-nutrition">
          <div className="chatbot-nutrition__row">
            <span>{t("Năng lượng nạp vào:")}</span>
            <b>480 / 650 kcal</b>
          </div>
          <div className="chatbot-nutrition__bar">
            <div
              className="chatbot-nutrition__bar-fill"
              style={{ width: "74%" }}
            />
          </div>

          <div className="chatbot-nutrition__macros">
            <div className="chatbot-nutrition__macro">
              <span className="chatbot-nutrition__macro-label">
                {t("Đạm")}
              </span>
              <span className="chatbot-nutrition__macro-value">28g</span>
              <span className="chatbot-nutrition__macro-sub chatbot-nutrition__macro-sub--green">
                85%
              </span>
            </div>
            <div className="chatbot-nutrition__macro">
              <span className="chatbot-nutrition__macro-label">
                {t("Carb")}
              </span>
              <span className="chatbot-nutrition__macro-value">54g</span>
              <span className="chatbot-nutrition__macro-sub">
                {t("Cân bằng")}
              </span>
            </div>
            <div className="chatbot-nutrition__macro">
              <span className="chatbot-nutrition__macro-label">
                {t("Chất xơ")}
              </span>
              <span className="chatbot-nutrition__macro-value">12g</span>
              <span className="chatbot-nutrition__macro-sub chatbot-nutrition__macro-sub--green">
                {t("Rất tốt")}
              </span>
            </div>
          </div>

          <div className="chatbot-tip">
            <Sparkles size={16} className="chatbot-tip__icon" />
            <p className="chatbot-tip__text">
              <b>{t("Lời khuyên chuyên gia:")}</b>{" "}
              {t(
                "Bạn nên bổ sung thêm 1 ly Nước ép ổi hồng hoặc Trà sen vàng ít đường để bổ sung vitamin C cho buổi học chiều dài nhé."
              )}
            </p>
          </div>
        </div>
      </div>

      {shiftLoading ? (
        <div className="chatbot-card">
          <div className="chatbot-card__head">
            <Phone size={16} />
            <span>{t("Hotline Khẩn Cấp Ca Trực")}</span>
          </div>
          <div className="chatbot-shift-loading">
            <Loader2 size={16} className="chatbot-spin" />
            <span>{t("Đang kiểm tra ca trực...")}</span>
          </div>
        </div>
      ) : currentStaff ? (
        <div className="chatbot-card">
          <div className="chatbot-card__head">
            <Phone size={16} />
            <span>{t("Hotline Khẩn Cấp Ca Trực")}</span>
          </div>
          <div className="chatbot-hotline">
            <div className="chatbot-hotline__row">
              <span>{t("Quầy trưởng ca:")}</span>
              <b>
                {currentStaff.name || t("Nhân viên")}
                {currentStaff.employee_code &&
                  ` (${currentStaff.employee_code})`}
              </b>
            </div>
            {currentStaff.station && (
              <div className="chatbot-hotline__row">
                <span>{t("Vị trí:")}</span>
                <b>{currentStaff.station}</b>
              </div>
            )}
            {currentStaff.phone && (
              <div className="chatbot-hotline__row">
                <span>{t("Hotline:")}</span>
                <a href={`tel:${currentStaff.phone}`}>
                  {currentStaff.phone}
                </a>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ============================================================
// AIContent
// ============================================================

function AIContent({
  messages,
  typing,
  onSend,
  text,
  setText,
  onQuickAdd,
  onView,
  scrollRef,
  bottomRef,
  t,
  tData,
}) {
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <>
      <div ref={scrollRef} className="chatbot-messages">
        {messages.map((m) => {
          const isUser = m.from === "user";
          return (
            <div
              key={m.id}
              className={`chatbot-msg ${
                isUser ? "chatbot-msg--user" : ""
              }`}
            >
              {!isUser && (
                <div className="chatbot-msg__avatar">
                  <Bot size={18} />
                </div>
              )}

              <div
                className={`chatbot-msg__body ${
                  isUser ? "chatbot-msg__body--user" : ""
                }`}
              >
                {!isUser && (
                  <div className="chatbot-msg__header">
                    <span className="chatbot-msg__name">
                      🤖 {t("Canteen VWA Smart Assistant")}
                    </span>
                  </div>
                )}

                <div className="chatbot-msg__content">{m.content}</div>

                {!isUser && m.items && m.items.length > 0 && (
                  <div className="chatbot-food-grid">
                    {m.items.map((it) => (
                      <div
                        key={it.id || it._id}
                        className="chatbot-food-card"
                      >
                        <div className="chatbot-food-card__img-wrap">
                          <img
                            src={it.image}
                            alt={it.name}
                            loading="lazy"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                          {(it.sold || 0) >= 50 && (
                            <span className="chatbot-food-card__badge">
                              <Flame size={10} /> {t("Bán chạy")}
                            </span>
                          )}
                          {it.discount_percent > 0 && (
                            <span className="chatbot-food-card__discount">
                              -{it.discount_percent}%
                            </span>
                          )}
                        </div>
                        <div className="chatbot-food-card__info">
                          <h4 className="chatbot-food-card__name">
                            {tData(it, "name")}
                          </h4>
                          <div className="chatbot-food-card__meta">
                            <span>{it.category}</span>
                          </div>
                          <div className="chatbot-food-card__bottom">
                            <span className="chatbot-food-card__price">
                              {money(it.price)}
                            </span>
                            <div className="chatbot-food-card__actions">
                              <button
                                type="button"
                                onClick={() => onQuickAdd(it)}
                                className="chatbot-food-card__add"
                                title={t("Thêm vào giỏ")}
                              >
                                <ShoppingCart size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onView(it)}
                                className="chatbot-food-card__view"
                              >
                                {t("Xem")}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="chatbot-msg__time">
                  {fmtTime(m.created_at, t)}
                </div>
              </div>
            </div>
          );
        })}

        {typing && (
          <div className="chatbot-msg">
            <div className="chatbot-msg__avatar">
              <Bot size={18} />
            </div>
            <div className="chatbot-msg__body">
              <div className="chatbot-typing">
                <span className="dot-typing" />
                <span
                  className="dot-typing"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="dot-typing"
                  style={{ animationDelay: "0.3s" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chatbot-quick-row">
        <span className="chatbot-quick-row__label">{t("Gợi ý nhanh:")}</span>
        {QUICK_REPLIES_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onSend(t(key))}
            disabled={typing}
            className="chatbot-chip"
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div className="chatbot-input">
        <div className="chatbot-input__icons">
          <button
            type="button"
            className="chatbot-input__icon"
            title={t("Đính kèm ảnh")}
          >
            <Sparkles size={18} />
          </button>
        </div>
        <input
          className="chatbot-input__field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={t(
            "Hỏi AI Bot về món ăn, lượng calo, gợi ý bữa trưa..."
          )}
          disabled={typing}
          maxLength={MAX_MESSAGE_LENGTH}
        />
        <button
          type="button"
          onClick={() => onSend()}
          disabled={typing || !text.trim()}
          aria-label={t("Gửi")}
          className="chatbot-input__send"
        >
          <Send size={16} />
        </button>
      </div>
    </>
  );
}

// ============================================================
// StaffContent
// ============================================================

function StaffContent({
  messages,
  loading,
  error,
  onRetry,
  sending,
  onSend,
  text,
  setText,
  scrollRef,
  bottomRef,
  t,
}) {
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <>
      <div ref={scrollRef} className="chatbot-messages">
        {error && !loading && (
          <div className="chatbot-error">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button type="button" onClick={onRetry}>
              <RefreshCw size={11} /> {t("Thử lại")}
            </button>
          </div>
        )}

        {loading && (
          <div className="chatbot-loading">
            <Loader2 size={20} className="chatbot-spin" />
            <span>{t("Đang tải...")}</span>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="chatbot-empty">
            <Store size={44} />
            <b>{t("Chưa có tin nhắn")}</b>
            <p>{t("Gửi tin nhắn để được hỗ trợ trực tiếp.")}</p>
          </div>
        )}

        {messages.map((m) => {
          const isOwn = m.from === "customer";
          return (
            <div
              key={m.id}
              className={`chatbot-msg ${
                isOwn ? "chatbot-msg--user" : ""
              }`}
            >
              {!isOwn && (
                <div className="chatbot-msg__avatar chatbot-msg__avatar--staff">
                  <Headset size={18} />
                </div>
              )}
              <div
                className={`chatbot-msg__body ${
                  isOwn ? "chatbot-msg__body--user" : ""
                }`}
              >
                {!isOwn && m.from === "staff" && (
                  <div className="chatbot-msg__header">
                    <span className="chatbot-msg__name">
                      {m.from_name || t("Nhân viên Canteen")}
                    </span>
                  </div>
                )}
                <div className="chatbot-msg__content">{m.content}</div>
                <div className="chatbot-msg__time">
                  {fmtTime(m.created_at, t)}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div className="chatbot-input">
        <input
          className="chatbot-input__field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={t("Nhập tin nhắn...")}
          disabled={sending}
          maxLength={MAX_MESSAGE_LENGTH}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sending || !text.trim()}
          aria-label={t("Gửi")}
          className="chatbot-input__send"
        >
          {sending ? (
            <Loader2 size={16} className="chatbot-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </>
  );
}