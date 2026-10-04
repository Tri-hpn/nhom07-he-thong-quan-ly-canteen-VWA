// ============================================================
// CUSTOMERCHAT.JSX — Chat khách hàng (V3)
// ============================================================
// ✅ V3:
//   - Badge ngày ở giữa chat (Hôm nay/Hôm qua/X ngày/dd/mm)
//   - Smart scroll: KHÔNG tự cuộn khi user đang kéo tay
//   - Immediate lần đầu, smooth khi có tin mới (chỉ khi ở gần cuối)
//   - pendingScrollRef: chỉ scroll khi user vừa gửi tin
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Send, RefreshCw, Bot, Store, ShoppingCart, Loader2, AlertCircle,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { getBotReply } from "../../components/ChatBot";
import { useI18n } from "../../hooks/useI18n";
import FoodDetailModal from "../../components/FoodDetailModal";
import {
  fmtTime,
  fmtDateLabel,
  getDateLabelVariant,
} from "../../lib/datetime";

// ============================================================
// CONSTANTS
// ============================================================

const BOT_AVATAR = "/bot-avatar.svg";

const POLL_MS = 3000;
const AI_REPLY_DELAY_MS = 600;
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
// SUB: BotAvatar
// ============================================================

function BotAvatar({ size = 32 }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #8b5cf6, #2634d5)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          alignSelf: "flex-end",
        }}
      >
        <Bot size={size * 0.5} />
      </div>
    );
  }

  return (
    <img
      src={BOT_AVATAR}
      alt="Bot"
      onError={() => setError(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        alignSelf: "flex-end",
        border: "2px solid #c7d2fe",
        backgroundColor: "#fff",
      }}
    />
  );
}

// ============================================================
// SUB: TabButton
// ============================================================

function TabButton({ active, onClick, icon, title, subtitle, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "14px 16px",
        background: active ? "var(--bg-tertiary, #f5f7fb)" : "transparent",
        border: 0,
        borderBottom: active ? "3px solid " + color : "3px solid transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: active ? color : color + "20",
          color: active ? "#fff" : color,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: active
              ? "var(--text-primary, #172033)"
              : "var(--text-muted, #475569)",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-light, #8993a3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {subtitle}
        </div>
      </div>
    </button>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerChat({ cart, setCart, user }) {
  const { t } = useI18n();

  const QUICK_REPLIES = [
    t("Dưới 30k"),
    t("Món chay"),
    t("Đồ uống"),
    t("Món cay"),
    t("Bán chạy"),
    t("Gợi ý"),
  ];

  const [tab, setTab] = useState("ai");

  // Staff chat
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [staffError, setStaffError] = useState("");

  // AI chat
  const [aiMessages, setAiMessages] = useState([]);
  const [aiText, setAiText] = useState("");
  const [aiTyping, setAiTyping] = useState(false);

  const [menuItems, setMenuItems] = useState([]);
  const [selected, setSelected] = useState(null);

  const aiScrollRef = useRef(null);
  const aiBottomRef = useRef(null);
  const staffScrollRef = useRef(null);
  const staffBottomRef = useRef(null);

  const staffReqIdRef = useRef(0);
  const aiTimerRef = useRef(null);

  // ✅ Refs cho smart scroll
  const lastAiCountRef = useRef(0);
  const lastStaffCountRef = useRef(0);
  const aiInitializedRef = useRef(false);
  const staffInitializedRef = useRef(false);

  // ✅ Cờ "user đang chạm feed" — không auto-scroll khi true
  const aiTouchingRef = useRef(false);
  const staffTouchingRef = useRef(false);
  // ✅ Cờ "user vừa bấm gửi" — cần scroll xuống để thấy tin mình
  const aiPendingScrollRef = useRef(false);
  const staffPendingScrollRef = useRef(false);

  // Load menu 1 lần
  useEffect(() => {
    api.menu
      .listActive("", "Tất cả", "popular")
      .then((d) => setMenuItems(Array.isArray(d) ? d : []))
      .catch(() => setMenuItems([]));
  }, []);

  // Cleanup AI timeout
  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

  // Load staff
  const loadStaff = useCallback(
    async (silent = false) => {
      const myReqId = ++staffReqIdRef.current;

      if (!silent) setLoading(true);
      if (!silent) setStaffError("");

      try {
        const data = await api.chat.myMessages();
        if (myReqId !== staffReqIdRef.current) return;
        setMessages(Array.isArray(data) ? data : []);
      } catch (e) {
        if (myReqId === staffReqIdRef.current && !silent) {
          setStaffError(e.message || t("Không tải được tin nhắn"));
        }
      } finally {
        if (myReqId === staffReqIdRef.current) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (tab !== "staff") return;

    loadStaff(false);
    const timer = setInterval(() => loadStaff(true), POLL_MS);
    return () => clearInterval(timer);
  }, [tab, loadStaff]);

  // ============================================================
  // AI SCROLL — SMART V3
  // ============================================================
  // Quy tắc:
  //   1. Lần đầu vào tab AI → scroll IMMEDIATE xuống cuối
  //   2. User vừa gửi tin → scroll SMOOTH xuống cuối
  //   3. Có tin mới + user gần cuối + user KHÔNG đang chạm → scroll SMOOTH
  //   4. Mọi trường hợp khác → KHÔNG scroll

  // --- AI: listener chạm feed ---
  useEffect(() => {
    if (tab !== "ai") return;
    const container = aiScrollRef.current;
    if (!container) return;

    const onTouchStart = () => {
      aiTouchingRef.current = true;
    };
    const onTouchEnd = () => {
      setTimeout(() => {
        aiTouchingRef.current = false;
      }, 300);
    };
    const onWheel = () => {
      aiTouchingRef.current = true;
      clearTimeout(onWheel._t);
      onWheel._t = setTimeout(() => {
        aiTouchingRef.current = false;
      }, 300);
    };
    const onMouseDown = () => {
      aiTouchingRef.current = true;
    };
    const onMouseUp = () => {
      aiTouchingRef.current = false;
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mouseup", onMouseUp);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mouseup", onMouseUp);
      clearTimeout(onWheel._t);
    };
  }, [tab]);

  // --- AI: auto scroll ---
  useEffect(() => {
    if (tab !== "ai") return;
    const container = aiScrollRef.current;
    if (!container) return;

    const isInitialLoad = !aiInitializedRef.current;

    // Rule 1: lần đầu → immediate
    if (isInitialLoad && aiMessages.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      });
      aiInitializedRef.current = true;
      lastAiCountRef.current = aiMessages.length;
      aiPendingScrollRef.current = false;
      return;
    }

    const grew = aiMessages.length > lastAiCountRef.current;
    if (!grew && !aiTyping) {
      lastAiCountRef.current = aiMessages.length;
      return;
    }

    // Rule 2: user vừa gửi → scroll
    if (aiPendingScrollRef.current) {
      aiPendingScrollRef.current = false;
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });
      lastAiCountRef.current = aiMessages.length;
      return;
    }

    // Rule 3: user đang chạm → không scroll
    if (aiTouchingRef.current) {
      lastAiCountRef.current = aiMessages.length;
      return;
    }

    // Rule 4: gần cuối → scroll
    const dist =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = dist < SCROLL_THRESHOLD_PX;

    if (nearBottom || aiTyping) {
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });
    }

    lastAiCountRef.current = aiMessages.length;
  }, [tab, aiMessages, aiTyping]);

  // ============================================================
  // STAFF SCROLL — SMART V3
  // ============================================================

  // --- Staff: listener chạm feed ---
  useEffect(() => {
    if (tab !== "staff") return;
    const container = staffScrollRef.current;
    if (!container) return;

    const onTouchStart = () => {
      staffTouchingRef.current = true;
    };
    const onTouchEnd = () => {
      setTimeout(() => {
        staffTouchingRef.current = false;
      }, 300);
    };
    const onWheel = () => {
      staffTouchingRef.current = true;
      clearTimeout(onWheel._t);
      onWheel._t = setTimeout(() => {
        staffTouchingRef.current = false;
      }, 300);
    };
    const onMouseDown = () => {
      staffTouchingRef.current = true;
    };
    const onMouseUp = () => {
      staffTouchingRef.current = false;
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mouseup", onMouseUp);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mouseup", onMouseUp);
      clearTimeout(onWheel._t);
    };
  }, [tab]);

  // --- Staff: auto scroll ---
  useEffect(() => {
    if (tab !== "staff") return;
    const container = staffScrollRef.current;
    if (!container) return;

    const isInitialLoad = !staffInitializedRef.current;

    if (isInitialLoad && messages.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      });
      staffInitializedRef.current = true;
      lastStaffCountRef.current = messages.length;
      staffPendingScrollRef.current = false;
      return;
    }

    const grew = messages.length > lastStaffCountRef.current;
    if (!grew) {
      lastStaffCountRef.current = messages.length;
      return;
    }

    if (staffPendingScrollRef.current) {
      staffPendingScrollRef.current = false;
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });
      lastStaffCountRef.current = messages.length;
      return;
    }

    if (staffTouchingRef.current) {
      lastStaffCountRef.current = messages.length;
      return;
    }

    const dist =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = dist < SCROLL_THRESHOLD_PX;

    if (nearBottom) {
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });
    }

    lastStaffCountRef.current = messages.length;
  }, [tab, messages]);

  // Reset init ref khi đổi tab
  useEffect(() => {
    if (tab === "ai") {
      staffInitializedRef.current = false;
    } else {
      aiInitializedRef.current = false;
    }
  }, [tab]);

  const sendStaff = async () => {
    const val = text.trim();
    if (!val || sending) return;

    if (val.length > MAX_MESSAGE_LENGTH) {
      toast(
        t("Tin nhắn tối đa {n} ký tự").replace("{n}", MAX_MESSAGE_LENGTH),
        "error"
      );
      return;
    }

    staffPendingScrollRef.current = true;
    setSending(true);
    try {
      const msg = await api.chat.send({ content: val });
      setText("");
      setMessages((m) => [...m, msg]);
    } catch (e) {
      toast(e.message || t("Không gửi được tin nhắn"), "error");
      staffPendingScrollRef.current = false;
    } finally {
      setSending(false);
    }
  };

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

    aiPendingScrollRef.current = true;
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
      const reply = getBotReply(val, menuItems);
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

  const quickAdd = (m) => {
    const id = m._id || m.id;
    const key = `${id}-S-`;

    setCart((c) => {
      const existing = c[key];
      const maxStock = typeof m.stock === "number" ? Math.max(1, m.stock) : 99;
      const newQty = Math.min(maxStock, (existing?.qty || 0) + 1);

      if (existing && existing.qty >= maxStock) return c;

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

    const existing = cart[key];
    const maxStock = typeof m.stock === "number" ? Math.max(1, m.stock) : 99;
    if (existing && existing.qty >= maxStock) {
      toast(
        t("Chỉ còn {n} phần trong kho").replace("{n}", maxStock),
        "error"
      );
      return;
    }

    toast(t("Đã thêm {name} vào giỏ").replace("{name}", m.name), "success");
  };

  const onAiKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAI();
    }
  };

  const onStaffKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendStaff();
    }
  };

  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 180px)",
        minHeight: 520,
        overflow: "hidden",
      }}
    >
      {/* ============ TABS ============ */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color, #eef2f7)",
          background: "var(--card-bg, #fff)",
        }}
      >
        <TabButton
          active={tab === "ai"}
          onClick={() => setTab("ai")}
          icon={<Bot size={16} />}
          title={t("Trợ lý AI")}
          subtitle={t("Gợi ý món, hỏi đáp nhanh")}
          color="#8b5cf6"
        />
        <TabButton
          active={tab === "staff"}
          onClick={() => setTab("staff")}
          icon={<Store size={16} />}
          title={t("Nhân viên Canteen")}
          subtitle={t("Hỗ trợ trực tiếp")}
          color="#2634d5"
        />
      </div>

      {/* ============ TAB AI ============ */}
      {tab === "ai" && (
        <>
          <div
            ref={aiScrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: 16,
              background: "var(--bg-tertiary, #f5f7fb)",
            }}
          >
            {aiMessages.length === 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <BotAvatar />
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "12px 14px",
                    borderRadius: "16px 16px 16px 4px",
                    background: "#eef2ff",
                    color: "#172033",
                    fontSize: 13,
                    border: "1px solid #c7d2fe",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#2634d5",
                      marginBottom: 6,
                    }}
                  >
                    🤖 {t("Trợ lý Canteen")}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {t("Xin chào {name}! Mình có thể giúp gì cho bạn?").replace(
                      "{name}",
                      user?.name || t("bạn")
                    )}
                  </div>
                </div>
              </div>
            )}

            {aiMessages.map((m, idx) => {
              const isUser = m.from === "user";
              const prev = aiMessages[idx - 1];
              const showDate =
                !prev || !sameDay(prev.created_at, m.created_at);

              return (
                <div key={m.id}>
                  {showDate && <DateDivider iso={m.created_at} />}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    {!isUser && <BotAvatar />}
                    <div
                      style={{
                        maxWidth: "75%",
                        padding: "10px 14px",
                        borderRadius: isUser
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                        background: isUser ? "#2634d5" : "#eef2ff",
                        color: isUser ? "#fff" : "#172033",
                        fontSize: 13,
                        border: isUser ? "none" : "1px solid #c7d2fe",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                      }}
                    >
                      {!isUser && (
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#2634d5",
                            marginBottom: 4,
                          }}
                        >
                          🤖 {t("Trợ lý")}
                        </div>
                      )}
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {m.content}
                      </div>

                      {!isUser && m.items && m.items.length > 0 && (
                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {m.items.map((it) => (
                            <div
                              key={it.id || it._id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: 6,
                                background: "#fff",
                                borderRadius: 10,
                                border: "1px solid #c7d2fe",
                              }}
                            >
                              <img
                                src={it.image}
                                alt={it.name}
                                style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: 8,
                                  objectFit: "cover",
                                  flexShrink: 0,
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: "#172033",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {it.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#18a967",
                                    fontWeight: 700,
                                  }}
                                >
                                  {money(it.price)}
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  flexShrink: 0,
                                }}
                              >
                                <button
                                  onClick={() => quickAdd(it)}
                                  aria-label={t(
                                    "Thêm vào giỏ {name}"
                                  ).replace("{name}", it.name)}
                                  style={{
                                    background: "#2634d5",
                                    color: "#fff",
                                    border: 0,
                                    width: 30,
                                    height: 30,
                                    borderRadius: 7,
                                    cursor: "pointer",
                                    display: "grid",
                                    placeItems: "center",
                                  }}
                                >
                                  <ShoppingCart size={13} />
                                </button>
                                <button
                                  onClick={() => setSelected(it)}
                                  style={{
                                    background: "#f59e0b",
                                    color: "#fff",
                                    border: 0,
                                    padding: "0 10px",
                                    height: 30,
                                    borderRadius: 7,
                                    cursor: "pointer",
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  {t("Xem")}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div
                        style={{
                          fontSize: 10,
                          opacity: 0.7,
                          marginTop: 4,
                          textAlign: "right",
                        }}
                      >
                        {fmtTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {aiTyping && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <BotAvatar />
                <div
                  style={{
                    padding: "12px 16px",
                    background: "#eef2ff",
                    borderRadius: "16px 16px 16px 4px",
                    display: "flex",
                    gap: 4,
                    alignItems: "center",
                    border: "1px solid #c7d2fe",
                  }}
                >
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
            )}

            <div ref={aiBottomRef} />
          </div>

          {/* Quick replies */}
          <div
            style={{
              padding: "10px 12px 0",
              display: "flex",
              gap: 6,
              overflowX: "auto",
              background: "var(--card-bg, #fff)",
              borderTop: "1px solid var(--border-color, #eef2f7)",
              scrollbarWidth: "none",
            }}
          >
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                onClick={() => sendAI(q)}
                disabled={aiTyping}
                style={{
                  padding: "6px 12px",
                  background: "var(--bg-tertiary, #f5f7fb)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 20,
                  cursor: aiTyping ? "not-allowed" : "pointer",
                  fontSize: 12,
                  color: "var(--text-muted, #475569)",
                  whiteSpace: "nowrap",
                  fontWeight: 500,
                  opacity: aiTyping ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: 12, display: "flex", gap: 8 }}>
            <input
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              onKeyDown={onAiKey}
              placeholder={t("Nhập tin nhắn cho trợ lý...")}
              disabled={aiTyping}
              maxLength={MAX_MESSAGE_LENGTH}
              style={{
                flex: 1,
                padding: "10px 14px",
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 24,
                outline: "none",
                background: "var(--bg-secondary, #f5f7fb)",
                color: "var(--text-primary, #172033)",
                fontSize: 13,
                minWidth: 0,
              }}
            />
            <button
              onClick={() => sendAI()}
              disabled={aiTyping || !aiText.trim()}
              aria-label={t("Gửi tin nhắn")}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: aiText.trim() ? "#8b5cf6" : "#94a3b8",
                color: "#fff",
                border: 0,
                cursor:
                  aiText.trim() && !aiTyping ? "pointer" : "not-allowed",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Send size={18} />
            </button>
          </div>
        </>
      )}

      {/* ============ TAB STAFF ============ */}
      {tab === "staff" && (
        <>
          <div
            ref={staffScrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: 16,
              background: "var(--bg-tertiary, #f5f7fb)",
            }}
          >
            {staffError && !loading && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 14,
                  color: "#ef4444",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{staffError}</span>
                <button
                  onClick={() => loadStaff(false)}
                  style={{
                    padding: "6px 12px",
                    background: "#ef4444",
                    color: "#fff",
                    border: 0,
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {t("Thử lại")}
                </button>
              </div>
            )}

            {loading && (
              <div
                style={{
                  textAlign: "center",
                  padding: 30,
                  color: "var(--text-light, #8993a3)",
                  fontSize: 13,
                }}
              >
                <Loader2
                  size={22}
                  style={{
                    animation: "spin 1s linear infinite",
                    marginBottom: 8,
                  }}
                />
                <div>{t("Đang tải tin nhắn...")}</div>
              </div>
            )}

            {!loading && !staffError && messages.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: 60,
                  color: "var(--text-light, #8993a3)",
                  fontSize: 13,
                }}
              >
                <Store
                  size={48}
                  style={{
                    opacity: 0.3,
                    margin: "0 auto 12px",
                    display: "block",
                  }}
                />
                <b
                  style={{
                    display: "block",
                    color: "var(--text-primary, #172033)",
                    fontSize: 14,
                    marginBottom: 6,
                  }}
                >
                  {t("Chat với nhân viên Canteen")}
                </b>
                <p style={{ margin: 0 }}>
                  {t("Gửi tin nhắn để được hỗ trợ trực tiếp.")}
                </p>
              </div>
            )}

            {messages.map((m, idx) => {
              const isOwn = m.from === "customer";
              const prev = messages[idx - 1];
              const showDate =
                !prev || !sameDay(prev.created_at, m.created_at);

              return (
                <div key={m.id}>
                  {showDate && <DateDivider iso={m.created_at} />}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: isOwn ? "flex-end" : "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "70%",
                        padding: "10px 14px",
                        borderRadius: isOwn
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                        background: isOwn
                          ? "#2634d5"
                          : "var(--card-bg, #fff)",
                        color: isOwn
                          ? "#fff"
                          : "var(--text-primary, #172033)",
                        fontSize: 13,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                      }}
                    >
                      {m.from === "staff" && (
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#2634d5",
                            marginBottom: 4,
                          }}
                        >
                          {m.from_name || t("Nhân viên Canteen")}
                        </div>
                      )}
                      <div
                        style={{
                          wordBreak: "break-word",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {m.content}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          opacity: 0.7,
                          marginTop: 4,
                          textAlign: "right",
                        }}
                      >
                        {fmtTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={staffBottomRef} />
          </div>

          <div
            style={{
              padding: 12,
              borderTop: "1px solid var(--border-color, #eef2f7)",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onStaffKey}
              placeholder={t("Nhập tin nhắn...")}
              disabled={sending}
              maxLength={MAX_MESSAGE_LENGTH}
              style={{
                flex: 1,
                padding: "10px 14px",
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 24,
                outline: "none",
                background: "var(--bg-secondary, #f5f7fb)",
                color: "var(--text-primary, #172033)",
                fontSize: 13,
                minWidth: 0,
              }}
            />
            <button
              onClick={sendStaff}
              disabled={sending || !text.trim()}
              aria-label={t("Gửi tin nhắn")}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: text.trim() ? "#2634d5" : "#94a3b8",
                color: "#fff",
                border: 0,
                cursor:
                  text.trim() && !sending ? "pointer" : "not-allowed",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              {sending ? (
                <Loader2
                  size={18}
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </>
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

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}