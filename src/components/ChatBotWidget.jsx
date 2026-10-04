// ============================================================
// CHATBOTWIDGET.JSX — Chat popup nổi (V2 - căn giữa, ca trực thật)
// ============================================================
// ✅ Panel căn giữa màn hình (không che navbar)
// ✅ Hotline ca trực lấy từ API — không có nhân viên thì ẩn
// ✅ Thời gian hiển thị đủ ngày + giờ + nhãn "Hôm qua"
// ============================================================

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Bot, X, Send, ShoppingCart, Store, MessageCircleHeart, Loader2,
  AlertCircle, RefreshCw, Sparkles, Headset, CheckCircle2, ArrowRight,
  Wallet, Leaf, Flame, Phone,
} from "lucide-react";
import { api } from "../api";
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
const SCROLL_THRESHOLD_PX = 120;

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

/**
 * Định dạng thời gian tin nhắn:
 *  - Hôm nay:  "04:11"
 *  - Hôm qua:  "17:15 • Hôm qua"
 *  - Cũ hơn:   "14:30 • 08/04"
 */
function fmtTime(iso) {
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
    if (diffDays === 1) return `${hh}:${mi} • Hôm qua`;
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

function toMinutes(str) {
  if (!str) return 0;
  const [h, m] = String(str).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getCurrentShift(staffList) {
  if (!Array.isArray(staffList) || staffList.length === 0) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    staffList.find((s) => {
      const start = toMinutes(s.start_time || s.shift_start);
      const end = toMinutes(s.end_time || s.shift_end);
      if (!start && !end) return false;
      return nowMin >= start && nowMin <= end;
    }) || null
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ChatBotWidget({ cart, setCart, user }) {
  const { t, tData } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("ai");

  const [aiMessages, setAiMessages] = useState([]);
  const [aiText, setAiText] = useState("");
  const [aiTyping, setAiTyping] = useState(false);

  const [staffMessages, setStaffMessages] = useState([]);
  const [staffText, setStaffText] = useState("");
  const [staffSending, setStaffSending] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");

  const [menuItems, setMenuItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hasNew, setHasNew] = useState(false);

  const [shiftStaff, setShiftStaff] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);

  const staffReqIdRef = useRef(0);
  const aiTimerRef = useRef(null);
  const lastAiCountRef = useRef(0);
  const lastStaffCountRef = useRef(0);
  const aiScrollRef = useRef(null);
  const staffScrollRef = useRef(null);
  const aiBottomRef = useRef(null);
  const staffBottomRef = useRef(null);
  const lastUserIdRef = useRef(user?.id);

  useEffect(() => {
    let cancelled = false;

    api.menu
      .listActive("", "Tất cả", "popular")
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d) ? d : [];
        setMenuItems(list.filter((m) => m.active));
      })
      .catch(() => !cancelled && setMenuItems([]));

    api.settings
      .get()
      .then((d) => !cancelled && setSettings(d))
      .catch(() => !cancelled && setSettings(null));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setShiftLoading(true);

    api.shifts
      .approvedToday()
      .then((list) => {
        if (cancelled) return;
        const current = getCurrentShift(list);
        setShiftStaff(current);
      })
      .catch(() => {
        if (!cancelled) setShiftStaff(null);
      })
      .finally(() => {
        if (!cancelled) setShiftLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (lastUserIdRef.current !== user?.id) {
      lastUserIdRef.current = user?.id;
      setAiMessages([]);
      setStaffMessages([]);
      setAiText("");
      setStaffText("");
    }
  }, [user?.id]);

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

  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

  const loadStaff = useCallback(
    async (silent = true) => {
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
          behavior: isInitial ? "auto" : "smooth",
        });
      });
    }

    lastAiCountRef.current = aiMessages.length;
  }, [open, mode, aiMessages, aiTyping]);

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
          behavior: isInitial ? "auto" : "smooth",
        });
      });
    }

    lastStaffCountRef.current = staffMessages.length;
  }, [open, mode, staffMessages]);

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

  const sendAI = (value) => {
    const val = (value || aiText).trim();
    if (!val || aiTyping) return;

    if (val.length > MAX_MESSAGE_LENGTH) {
      toast(
        t("Tin nhắn tối đa {n} ký tự").replace("{n}", MAX_MESSAGE_LENGTH),
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
  };

  const sendStaff = async () => {
    const val = staffText.trim();
    if (!val || staffSending) return;

    if (val.length > MAX_MESSAGE_LENGTH) {
      toast(
        t("Tin nhắn tối đa {n} ký tự").replace("{n}", MAX_MESSAGE_LENGTH),
        "error"
      );
      return;
    }

    setStaffSending(true);
    try {
      const msg = await api.chat.send({ content: val });
      setStaffText("");
      setStaffMessages((m) => [...m, msg]);
    } catch (e) {
      toast(e.message || t("Không gửi được tin nhắn"), "error");
    } finally {
      setStaffSending(false);
    }
  };

  const quickAdd = (m) => {
    const id = m._id || m.id;
    const key = `${id}-S-`;
    const maxQty = getMaxQty(m);

    let added = false;
    let reason = "";

    setCart((c) => {
      const existing = c[key];
      const currentQty = Number(existing?.qty) || 0;
      if (currentQty >= maxQty) {
        reason = t("Chỉ còn {n} phần trong kho").replace("{n}", maxQty);
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
      toast(t("Đã thêm {name} vào giỏ").replace("{name}", m.name), "success");
    } else {
      toast(reason, "error");
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t("Trợ lý Canteen")}
          className="chatbot-fab"
          type="button"
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
                  className="chatbot-header__btn"
                  onClick={() => setMode(mode === "ai" ? "staff" : "ai")}
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

          <div className="chatbot-body">
            <aside className="chatbot-side chatbot-side--left">
              <LeftSidebar user={user} t={t} />
            </aside>

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
              )}
            </section>

            <aside className="chatbot-side chatbot-side--right">
              <RightSidebar
                user={user}
                t={t}
                shiftStaff={shiftStaff}
                shiftLoading={shiftLoading}
              />
            </aside>
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

function LeftSidebar({ user, t }) {
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
              {t("MSSV:")} {user?.studentId || "K21-CNTT04"}
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
              {money(user?.balance || 185000)}
            </span>
          </div>
          <div className="chatbot-profile__stat">
            <span className="chatbot-profile__stat-label">
              {t("Điểm thưởng")}
            </span>
            <span className="chatbot-profile__stat-value chatbot-profile__stat-value--blue">
              {user?.points || 350} pts
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
            <PromptButton key={i} icon={p.icon} text={t(p.text)} />
          ))}
        </div>
      </div>
    </>
  );
}

function PromptButton({ icon, text }) {
  return (
    <button
      type="button"
      className="chatbot-prompt-btn"
      onClick={() => {
        const input = document.querySelector(".chatbot-input__field");
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          ).set;
          setter.call(input, text);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
        }
      }}
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

function RightSidebar({ user, t, shiftStaff, shiftLoading }) {
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
      ) : shiftStaff ? (
        <div className="chatbot-card">
          <div className="chatbot-card__head">
            <Phone size={16} />
            <span>{t("Hotline Khẩn Cấp Ca Trực")}</span>
          </div>
          <div className="chatbot-hotline">
            <div className="chatbot-hotline__row">
              <span>{t("Quầy trưởng ca:")}</span>
              <b>
                {shiftStaff.name || shiftStaff.staff_name || t("Nhân viên")}
                {(shiftStaff.employee_code || shiftStaff.code) &&
                  ` (${shiftStaff.employee_code || shiftStaff.code})`}
              </b>
            </div>
            {(shiftStaff.station || shiftStaff.counter_name) && (
              <div className="chatbot-hotline__row">
                <span>{t("Vị trí:")}</span>
                <b>{shiftStaff.station || shiftStaff.counter_name}</b>
              </div>
            )}
            {shiftStaff.phone && (
              <div className="chatbot-hotline__row">
                <span>{t("Hotline:")}</span>
                <a href={`tel:${shiftStaff.phone}`}>{shiftStaff.phone}</a>
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
              className={`chatbot-msg ${isUser ? "chatbot-msg--user" : ""}`}
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
                      <div key={it.id || it._id} className="chatbot-food-card">
                        <div className="chatbot-food-card__img-wrap">
                          <img src={it.image} alt={it.name} loading="lazy" />
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
                                onClick={() => onQuickAdd(it)}
                                className="chatbot-food-card__add"
                                title={t("Thêm vào giỏ")}
                                type="button"
                              >
                                <ShoppingCart size={13} />
                              </button>
                              <button
                                onClick={() => onView(it)}
                                className="chatbot-food-card__view"
                                type="button"
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
                  {fmtTime(m.created_at)}
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
            onClick={() => onSend(t(key))}
            disabled={typing}
            type="button"
            className="chatbot-chip"
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div className="chatbot-input">
        <div className="chatbot-input__icons">
          <button
            className="chatbot-input__icon"
            type="button"
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
          onClick={() => onSend()}
          disabled={typing || !text.trim()}
          aria-label={t("Gửi")}
          className="chatbot-input__send"
          type="button"
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
            <button onClick={onRetry} type="button">
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
              className={`chatbot-msg ${isOwn ? "chatbot-msg--user" : ""}`}
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
                  {fmtTime(m.created_at)}
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
          onClick={onSend}
          disabled={sending || !text.trim()}
          aria-label={t("Gửi")}
          className="chatbot-input__send"
          type="button"
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