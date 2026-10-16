// ============================================================
// CUSTOMERCHECKOUT.JSX â€” Thanh toÃ¡n (V5 - FINAL + i18n)
// ============================================================
// V5 (2026-10):
//   - ðŸ”§ FIX #28: EMPTY_ARRAY module-scoped constant, khÃ´ng re-create
//                 má»—i render â†’ useCrossTabSync khÃ´ng bá»‹ re-init
//   - Giá»¯ nguyÃªn toÃ n bá»™ logic khÃ¡c
// ============================================================

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  User, Phone, Clock, FileText, Tag, CheckCircle2, CreditCard, Gift, X, Zap,
  Loader2, Home, ChevronRight, Wallet, QrCode, Banknote, Copy, Check,
  Download, ExternalLink, Store, Soup, Utensils, Shield, PhoneCall,
  Microwave, Info, Lightbulb, Sparkles, Plus, Minus, RefreshCw, Wifi,
  BadgeCheck, AlertCircle, ShoppingBag, Receipt, Timer,
  Leaf } from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { usePointsConfig } from "../../hooks/usePointsConfig";
import { useCrossTabSync } from "../../hooks/useCrossTabSync";
import PaymentModal from "../../components/PaymentModal";

// ============================================================
// CONSTANTS
// ============================================================

const FALLBACK_TIME_SLOTS = [
  "07:00 - 07:30", "07:30 - 08:00", "08:00 - 08:30", "08:30 - 09:00",
  "09:00 - 09:30", "09:30 - 10:00", "10:00 - 10:30", "10:30 - 11:00",
  "11:00 - 11:30", "11:30 - 12:00", "12:00 - 12:30", "12:30 - 13:00",
  "13:00 - 13:30", "13:30 - 14:00", "14:00 - 14:30", "14:30 - 15:00",
  "15:00 - 15:30", "15:30 - 16:00", "16:00 - 16:30", "16:30 - 17:00",
  "17:00 - 17:30", "17:30 - 18:00", "18:00 - 18:30",
];

// ðŸ”§ FIX #28: Module-scoped frozen constant
const EMPTY_ARRAY = Object.freeze([]);

const MIN_REDEEM_POINTS = 100;
const REDEEM_PER_POINT = 100;
const REDEEM_MAX_AMOUNT = 2500;
const MIN_ORDER_POINTS_REDEEM = 10;
const COUNTDOWN_START = 585;

const SELECTED_CART_KEY = "canteen_cart_selected";
const CART_KEY = "canteen_cart";

const PAYMENT_METHODS = [
  { id: "wallet", label: "VÃ­ VWA Pay",    icon: Wallet },
  { id: "qr",     label: "MÃ£ VietQR",     icon: QrCode },
  { id: "card",   label: "Tháº» Sinh ViÃªn", icon: CreditCard },
  { id: "cash",   label: "Tiá»n máº·t",      icon: Banknote },
];

// ============================================================
// HELPERS
// ============================================================

function removeOrderedItems(cart, selectedKeys) {
  const remain = {};
  for (const [k, v] of Object.entries(cart || {})) {
    if (!selectedKeys.includes(k)) remain[k] = v;
  }
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(remain));
  } catch {}
  try {
    localStorage.removeItem(SELECTED_CART_KEY);
  } catch {}
  return remain;
}

function readSelectedKeys() {
  try {
    const raw = localStorage.getItem(SELECTED_CART_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function isSlotInPast(slot) {
  if (!slot) return false;
  const startTime = slot.split(" - ")[0];
  const [h, m] = startTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return false;

  const now = new Date();
  const slotDate = new Date();
  slotDate.setHours(h, m, 0, 0);

  return slotDate.getTime() < now.getTime();
}

function genPreviewOrderCode() {
  const now = new Date();
  const y = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `PREVIEW-${y}${mm}${dd}${rand}`;
}

function slotToString(slot) {
  if (!slot) return "";
  if (typeof slot === "string") return slot;
  if (slot.id && !slot.start) return slot.id;
  if (slot.start && slot.end) return `${slot.start} - ${slot.end}`;
  return "";
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerCheckout({ cart, setCart, user }) {
  const navigate = useNavigate();
  const checkoutLocation = useLocation();
  const buyNowItem = checkoutLocation.state?.buyNowItem || null;
  const buyNowItems = Array.isArray(checkoutLocation.state?.buyNowItems) ? checkoutLocation.state.buyNowItems : [];
  const isBuyNow = Boolean(buyNowItem || buyNowItems.length);
  const { t, tData } = useI18n();

  const [name, setName] = useState(() => user?.name || "");
  const [phone, setPhone] = useState(() => user?.phone || "");
  const [pickupTime, setPickupTime] = useState("");
  const [note, setNote] = useState("");
  const [isGreen, setIsGreen] = useState(false);
  const ptsCfg = usePointsConfig();
  const [errors, setErrors] = useState({});

  const [voucherCode, setVoucherCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [applyingVoucher, setApplyingVoucher] = useState(false);

  const [myVouchers, setMyVouchers] = useState([]);
  const [points, setPoints] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [settings, setSettings] = useState(null);
  const [qrImageFailedUrl, setQrImageFailedUrl] = useState('');
  const [timeSlots, setTimeSlots] = useState(FALLBACK_TIME_SLOTS);
  const [initLoading, setInitLoading] = useState(true);

  const [redeemLoading, setRedeemLoading] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);

  const [paymentMethod, setPaymentMethod] = useState("qr");
  const [usePoints, setUsePoints] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_START);

  const voucherReqIdRef = useRef(0);
  const submittingRef = useRef(false);
  const prevSubtotalRef = useRef(null);

  // ðŸ”§ FIX #28: EMPTY_ARRAY lÃ  module-scoped frozen constant,
  // khÃ´ng pháº£i re-create má»—i render
  const [selectedKeys] = useCrossTabSync(SELECTED_CART_KEY, EMPTY_ARRAY);

  const lines = useMemo(() => {
    if (buyNowItems.length) {
      return buyNowItems.map((item, index) => ({
        ...item,
        _key: `__buy_now_item_${index}__`
      }));
    }

    if (buyNowItem && typeof buyNowItem === "object") {
      return [{ ...buyNowItem, _key: "__buy_now_item__" }];
    }

    if (!selectedKeys || !selectedKeys.length) {
      return Object.entries(cart).map(([key, item]) => ({
        ...item,
        _key: key,
      }));
    }

    const selectedSet = new Set(selectedKeys);
    return Object.entries(cart)
      .filter(([key]) => selectedSet.has(key))
      .map(([key, item]) => ({ ...item, _key: key }));
  }, [buyNowItem, buyNowItems, cart, selectedKeys]);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (s, m) => s + (Number(m.price) || 0) * (Number(m.qty) || 0),
        0
      ),
    [lines]
  );

  const pointsToRedeem = Math.min(
    Math.max(0, Math.floor(Number(points) || 0)),
    Math.floor(REDEEM_MAX_AMOUNT / REDEEM_PER_POINT),
    Math.floor(Math.max(0, Number(subtotal) || 0) / REDEEM_PER_POINT)
  );
  const pointsDiscount =
    usePoints && !appliedVoucher && pointsToRedeem >= MIN_ORDER_POINTS_REDEEM
      ? pointsToRedeem * REDEEM_PER_POINT
      : 0;

  const total = useMemo(
    () => Math.max(0, subtotal - discount - pointsDiscount),
    [subtotal, discount, pointsDiscount]
  );

  useEffect(() => {
    if (prevSubtotalRef.current === null) {
      prevSubtotalRef.current = subtotal;
      return;
    }

    if (prevSubtotalRef.current !== subtotal && appliedVoucher) {
      if (appliedVoucher.value > subtotal) {
        toast(
          t("Voucher khÃ´ng cÃ²n há»£p lá»‡ do thay Ä‘á»•i Ä‘Æ¡n hÃ ng"),
          "warning"
        );
        setDiscount(0);
        setVoucherCode("");
        setAppliedVoucher(null);
      }
    }

    prevSubtotalRef.current = subtotal;
  }, [subtotal, appliedVoucher, t]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((s) => (s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const countdownStr = useMemo(() => {
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [countdown]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [
          vouchersRes,
          pointsRes,
          walletRes,
          settingsRes,
          timeSlotsRes,
        ] = await Promise.all([
          api.vouchers.me().catch(() => []),
          api.points.me().catch(() => ({ points: 0 })),
          api.wallet.me().catch(() => ({ balance: 0 })),
          api.settings.get().catch(() => null),
          api.timeSlots.list().catch(() => []),
        ]);

        if (cancelled) return;

        setMyVouchers(
          (Array.isArray(vouchersRes) ? vouchersRes : []).filter(
            (v) => !v.used
          )
        );

        setPoints(pointsRes?.points || 0);
        setWalletBalance(walletRes?.balance || 0);
        setSettings(settingsRes);

        const slots = Array.isArray(timeSlotsRes) ? timeSlotsRes : [];
        if (slots.length > 0) {
          const enabledSlots = slots
            .filter((s) => s.enabled !== false)
            .map(slotToString)
            .filter(Boolean);

          setTimeSlots(
            enabledSlots.length > 0 ? enabledSlots : FALLBACK_TIME_SLOTS
          );
        } else {
          setTimeSlots(FALLBACK_TIME_SLOTS);
        }
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync customer VietQR from latest Admin bank settings
  useEffect(() => {
    let cancelled = false;
    let requesting = false;

    const refreshBankSettings = async () => {
      if (
        cancelled ||
        requesting ||
        document.visibilityState === "hidden"
      ) return;

      requesting = true;

      try {
        const latest = await api.settings.get();

        if (cancelled || !latest || typeof latest !== "object") return;

        setSettings((current) => {
          if (
            current &&
            String(current.bank || "") === String(latest.bank || "") &&
            String(current.account || "") === String(latest.account || "") &&
            String(current.accountName || "") === String(latest.accountName || "")
          ) {
            return current;
          }

          return { ...(current || {}), ...latest };
        });
      } catch {
        // Giu cau hinh cu neu mang tam thoi that bai
      } finally {
        requesting = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden") {
        void refreshBankSettings();
      }
    };

    const timerId = window.setInterval(refreshBankSettings, 10000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);
  useEffect(() => {
    if (user?.name) setName((cur) => (cur ? cur : user.name));
    if (user?.phone) setPhone((cur) => (cur ? cur : user.phone));
  }, [user]);

  const reloadVouchersAndPoints = useCallback(async () => {
    try {
      const [list, pointsData] = await Promise.all([
        api.vouchers.me().catch(() => []),
        api.points.me().catch(() => ({ points: 0 })),
      ]);
      setMyVouchers(
        (Array.isArray(list) ? list : []).filter((v) => !v.used)
      );
      setPoints(pointsData?.points || 0);
    } catch {}
  }, []);

  const applyVoucher = useCallback(
    async (code) => {
      const useCode = (code || voucherCode || "").trim().toUpperCase();

      if (!useCode) {
        toast(t("Vui lÃ²ng nháº­p mÃ£ voucher"), "error");
        return;
      }

      const myReqId = ++voucherReqIdRef.current;
      setApplyingVoucher(true);

      try {
        const res = await api.vouchers.validate(useCode);
        if (myReqId !== voucherReqIdRef.current) return;

        setDiscount(res.value);
        setVoucherCode(res.code);
        setAppliedVoucher({ code: res.code, value: res.value });
        setUsePoints(false);
        toast(
          `${t("ÄÃ£ Ã¡p dá»¥ng voucher")}: -${money(res.value)}`,
          "success"
        );
      } catch (e) {
        if (myReqId !== voucherReqIdRef.current) return;
        toast(e.message || t("MÃ£ voucher khÃ´ng há»£p lá»‡"), "error");
      } finally {
        if (myReqId === voucherReqIdRef.current) setApplyingVoucher(false);
      }
    },
    [voucherCode, t]
  );

  const clearVoucher = () => {
    voucherReqIdRef.current++;
    setApplyingVoucher(false);
    setVoucherCode("");
    setDiscount(0);
    setAppliedVoucher(null);
  };

  const redeemPoints = async () => {
    if (points < MIN_REDEEM_POINTS) {
      toast(
        t("Báº¡n cáº§n Ã­t nháº¥t {n} Ä‘iá»ƒm Ä‘á»ƒ Ä‘á»•i").replace(
          "{n}",
          MIN_REDEEM_POINTS
        ),
        "error"
      );
      return;
    }
    if (redeemLoading) return;

    setRedeemLoading(true);
    try {
      const voucher = await api.points.redeem({
        points: MIN_REDEEM_POINTS,
      });
      toast(
        `${t("Äá»•i thÃ nh cÃ´ng voucher")} ${voucher.code} â€” ${money(voucher.value)}`,
        "success"
      );

      await reloadVouchersAndPoints();
      await applyVoucher(voucher.code);
    } catch (e) {
      toast(e.message || t("KhÃ´ng Ä‘á»•i Ä‘Æ°á»£c voucher"), "error");
    } finally {
      setRedeemLoading(false);
    }
  };

  const validate = () => {
    const errs = {};

    if (!name.trim()) errs.name = t("Vui lÃ²ng nháº­p há» tÃªn");

    if (!phone.trim()) {
      errs.phone = t("Vui lÃ²ng nháº­p SÄT");
    } else if (!/^[0-9]{10,11}$/.test(phone.trim())) {
      errs.phone = t("SÄT pháº£i 10-11 sá»‘");
    }

    if (!pickupTime.trim()) {
      errs.pickupTime = t("Vui lÃ²ng chá»n giá» nháº­n");
    } else if (isSlotInPast(pickupTime)) {
      errs.pickupTime = t("Khung giá» nÃ y Ä‘Ã£ qua");
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildItemsPayload = useCallback(() => {
    return lines.map((m) => ({
      menuItem: m._originalId || m._id || m.id,
      qty: m.qty,
      toppings: Array.isArray(m._toppings) ? m._toppings : [],
      size: m._size || "S",
    }));
  }, [lines]);

  const buildNotePayload = useCallback(() => {
    const noteParts = [];
    if (note.trim()) noteParts.push(note.trim());
    if (pickupTime) noteParts.push(`${t("Nháº­n hÃ ng:")} ${pickupTime}`);
    return noteParts.join(" Â· ");
  }, [note, pickupTime, t]);

  const buildOrderDiscountPayload = useCallback(async () => {
    if (!usePoints) {
      return {
        discount: Number(discount) || 0,
        voucherCode: appliedVoucher?.code || "",
      };
    }

    if (appliedVoucher) {
      toast(
        t("Chá»‰ cÃ³ thá»ƒ sá»­ dá»¥ng voucher hoáº·c Green Points cho má»™t Ä‘Æ¡n hÃ ng."),
        "warning"
      );
      return null;
    }

    if (pointsToRedeem < MIN_ORDER_POINTS_REDEEM) {
      toast(
        t("Cáº§n tá»‘i thiá»ƒu 10 Ä‘iá»ƒm vÃ  Ä‘Æ¡n hÃ ng tá»« 1.000 Ä‘ Ä‘á»ƒ sá»­ dá»¥ng Green Points."),
        "warning"
      );
      return null;
    }

    // API hien co quy doi diem thanh voucher:
    // gia tri voucher = so diem doi * 100 VND.
    const pointVoucher = await api.points.redeem({
      points: pointsToRedeem,
    });

    const redeemedValue = Number(pointVoucher?.value) || 0;

    if (
      !pointVoucher?.code ||
      redeemedValue !== pointsToRedeem * REDEEM_PER_POINT ||
      redeemedValue > subtotal
    ) {
      await reloadVouchersAndPoints();
      throw new Error(
        t("KhÃ´ng xÃ¡c minh Ä‘Æ°á»£c voucher Ä‘á»•i Ä‘iá»ƒm. Vui lÃ²ng kiá»ƒm tra láº¡i voucher trong tÃ i khoáº£n.")
      );
    }

    // Neu dat don that bai, voucher da tao van duoc giu lai
    // trong tai khoan de khach co the su dung lai.
    setUsePoints(false);
    setDiscount(redeemedValue);
    setVoucherCode(pointVoucher.code);
    setAppliedVoucher({
      code: pointVoucher.code,
      value: redeemedValue,
    });

    await reloadVouchersAndPoints();

    return {
      discount: redeemedValue,
      voucherCode: pointVoucher.code,
    };
  }, [
    usePoints,
    appliedVoucher,
    discount,
    pointsToRedeem,
    subtotal,
    reloadVouchersAndPoints,
    t,
  ]);
  const submitOrder = useCallback(
    async (method) => {
      if (submittingRef.current) return;
      if (!lines.length) {
        toast(t("Giá» hÃ ng trá»‘ng"), "error");
        return;
      }
      if (!validate()) {
        toast(t("Kiá»ƒm tra láº¡i thÃ´ng tin"), "error");
        return;
      }

      submittingRef.current = true;
      setSubmittingOrder(true);

      try {
        const orderDiscountPayload = await buildOrderDiscountPayload();
        if (!orderDiscountPayload) return;

        const order = await api.orders.create({
          items: buildItemsPayload(),
          payment: method,
          note: buildNotePayload(),
          pickupTime: pickupTime || "",
          ...orderDiscountPayload,
          isGreen,
        });

        if (!isBuyNow) {
          const selectedKeysArr = lines.map((m) => m._key);
          const remainCart = removeOrderedItems(cart, selectedKeysArr);
          setCart(remainCart);
        }
        toast(
          `${t("Äáº·t hÃ ng thÃ nh cÃ´ng!")} ${t("MÃ£ Ä‘Æ¡n")}: ${order.code}`,
          "success"
        );

        navigate("/customer/success", { state: { order } });
      } catch (e) {
        toast(e.message || t("KhÃ´ng Ä‘áº·t Ä‘Æ°á»£c hÃ ng"), "error");
      } finally {
        submittingRef.current = false;
        setSubmittingOrder(false);
      }
    },
    [
      lines,
      isBuyNow,
      cart,
      setCart,
      navigate,
      buildItemsPayload,
      buildNotePayload,
      pickupTime,
      discount,
      pointsDiscount,
      appliedVoucher,
      buildOrderDiscountPayload,
      t,
    ]
  );

  const openPayment = useCallback(
    (method) => {
      if (submittingRef.current) return;
      if (!lines.length) {
        toast(t("Giá» hÃ ng trá»‘ng"), "error");
        return;
      }
      if (!validate()) {
        toast(t("Kiá»ƒm tra láº¡i thÃ´ng tin"), "error");
        return;
      }

      setPaymentOrder({
        code: genPreviewOrderCode(),
        total,
        name,
        phone,
        pickupTime,
        note,
        discount: discount + pointsDiscount,
        voucherCode: appliedVoucher?.code || "",
          isGreen,
        method,
      });
    },
    [
      lines,
      total,
      name,
      phone,
      pickupTime,
      note,
      discount,
      pointsDiscount,
      appliedVoucher,
      t,
    ]
  );

  const confirmPayment = useCallback(
    async (paymentMethodArg) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmittingOrder(true);

      try {
        const orderDiscountPayload = await buildOrderDiscountPayload();
        if (!orderDiscountPayload) return;

        const order = await api.orders.create({
          items: buildItemsPayload(),
          payment: paymentMethodArg,
          note: buildNotePayload(),
          pickupTime: pickupTime || "",
          ...orderDiscountPayload,
          isGreen,
        });

        if (!isBuyNow) {
          const selectedKeysArr = lines.map((m) => m._key);
          const remainCart = removeOrderedItems(cart, selectedKeysArr);
          setCart(remainCart);
        }
        toast(
          `${t("Äáº·t hÃ ng thÃ nh cÃ´ng!")} ${t("MÃ£ Ä‘Æ¡n")}: ${order.code}`,
          "success"
        );
        setPaymentOrder(null);

        navigate("/customer/success", { state: { order } });
      } catch (e) {
        toast(e.message || t("KhÃ´ng Ä‘áº·t Ä‘Æ°á»£c hÃ ng"), "error");
      } finally {
        submittingRef.current = false;
        setSubmittingOrder(false);
      }
    },
    [
      lines,
      isBuyNow,
      cart,
      setCart,
      navigate,
      buildItemsPayload,
      buildNotePayload,
      pickupTime,
      discount,
      pointsDiscount,
      appliedVoucher,
      buildOrderDiscountPayload,
      t,
    ]
  );

  const copyToClipboard = (text) => {
    try {
      navigator.clipboard.writeText(text);
      toast(t("ÄÃ£ sao chÃ©p"), "success");
    } catch {
      toast(t("KhÃ´ng sao chÃ©p Ä‘Æ°á»£c"), "error");
    }
  };

  if (!lines.length) {
    return (
      <div className="checkout-v2-empty">
        <ShoppingBag size={60} />
        <h3>{t("Giá» hÃ ng Ä‘ang trá»‘ng")}</h3>
        <Link to="/customer/menu" className="checkout-v2-empty__btn">
          <Utensils size={16} />
          {t("KhÃ¡m phÃ¡ thá»±c Ä‘Æ¡n")}
        </Link>
      </div>
    );
  }

  const bankCode = settings?.bank || "VCB";
  const bankAccount = settings?.account || "";
  const bankAccountName = settings?.accountName || "CANTEEN VWA";
  const transferContent = paymentOrder?.code
    ? `CANTEEN ${paymentOrder.code}`
    : "CANTEEN";

  const normalizedBankCode = String(bankCode || "").trim();
  const normalizedBankAccount = String(bankAccount || "").replace(/\s+/g, "");

  const vietQrParams = new URLSearchParams({
    amount: String(Math.max(0, Math.round(Number(total) || 0))),
    addInfo: transferContent,
    accountName: bankAccountName,
  });

  const vietQrImageUrl =
    normalizedBankCode && normalizedBankAccount
      ? `https://img.vietqr.io/image/${encodeURIComponent(normalizedBankCode)}-${encodeURIComponent(normalizedBankAccount)}-compact2.svg?${vietQrParams.toString()}`
      : "";
  const downloadVietQrImage = async () => {
    if (!vietQrImageUrl) {
      toast(t("ChÆ°a cÃ³ mÃ£ QR Ä‘á»ƒ táº£i xuá»‘ng"), "error");
      return;
    }

    try {
      const response = await fetch(vietQrImageUrl, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Khong tai duoc anh QR");
      }

      const blob = await response.blob();

      if (!blob.size || (blob.type && !blob.type.startsWith("image/"))) {
        throw new Error("Du lieu tra ve khong phai anh QR");
      }

      const extension = /\.svg(?:[?#]|$)/i.test(vietQrImageUrl)
        ? "svg"
        : "png";

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = `canteen-vwa-vietqr-${Date.now()}.${extension}`;
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      toast(t("ÄÃ£ táº£i áº£nh mÃ£ QR xuá»‘ng mÃ¡y"), "success");
    } catch (error) {
      console.error("Download VietQR failed:", error);
      toast(
        t("KhÃ´ng táº£i Ä‘Æ°á»£c áº£nh QR tá»± Ä‘á»™ng. Vui lÃ²ng kiá»ƒm tra káº¿t ná»‘i vÃ  thá»­ láº¡i."),
        "error"
      );
    }
  };
  return (
    <div className="checkout-v2">
      <section className="checkout-header">
        <div className="checkout-header__top">
          <nav className="checkout-breadcrumb">
            <Link to="/customer/home" className="checkout-breadcrumb__link">
              <Home size={14} />
              {t("Trang chá»§")}
            </Link>
            <ChevronRight size={14} className="checkout-breadcrumb__sep" />
            <Link to="/customer/cart" className="checkout-breadcrumb__link">
              {t("Giá» hÃ ng")}
            </Link>
            <ChevronRight size={14} className="checkout-breadcrumb__sep" />
            <span className="checkout-breadcrumb__current">
              {t("Thanh toÃ¡n Ä‘Æ¡n hÃ ng")}
            </span>
          </nav>

          <div className="checkout-timer">
            <Timer size={16} className="checkout-timer__icon" />
            <span>{t("Giá»¯ suáº¥t & giÃ¡ Æ°u Ä‘Ã£i trong:")}</span>
            <b>{countdownStr}</b>
          </div>
        </div>

        <div className="checkout-stepper">
          <div className="checkout-stepper__item checkout-stepper__item--done">
            <div className="checkout-stepper__icon">
              <Check size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÆ¯á»šC 1")}</span>
              <b>{t("Chá»n mÃ³n")}</b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--done">
            <div className="checkout-stepper__icon">
              <Check size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÆ¯á»šC 2")}</span>
              <b>{t("Giá» & TÃ¹y chá»n")}</b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--active">
            <div className="checkout-stepper__icon checkout-stepper__icon--active">
              <CreditCard size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label checkout-stepper__label--active">
                {t("BÆ¯á»šC 3")}
              </span>
              <b className="checkout-stepper__label--active">
                {t("Thanh toÃ¡n")}
              </b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--pending">
            <div className="checkout-stepper__icon">
              <Store size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÆ¯á»šC 4")}</span>
              <b>{t("Nháº­n táº¡i quáº§y")}</b>
            </div>
          </div>
        </div>
      </section>

      <div className="checkout-grid">
        <div className="checkout-left">
          <div className="checkout-method-header">
            <div>
              <h1>{t("PhÆ°Æ¡ng thá»©c thanh toÃ¡n")}</h1>
              <p>
                {t("Chá»n 1 trong 4 hÃ¬nh thá»©c thanh toÃ¡n thuáº­n tiá»‡n cho sinh viÃªn & giáº£ng viÃªn")}
              </p>
            </div>
            <span className="checkout-method-header__badge">
              <Zap size={14} />
              {t("Xá»­ lÃ½ tá»± Ä‘á»™ng 24/7")}
            </span>
          </div>

          <div className="checkout-payment-tabs">
            {PAYMENT_METHODS.map((m) => {
              const Icon = m.icon;
              const active = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`checkout-payment-tab ${
                    active ? "active" : ""
                  }`}
                  onClick={() => setPaymentMethod(m.id)}
                >
                  <Icon size={20} />
                  <span>{t(m.label)}</span>
                </button>
              );
            })}
          </div>

          {paymentMethod === "wallet" && (
            <div className="checkout-panel">
              <div className="checkout-panel__head">
                <div className="checkout-panel__head-left">
                  <div className="checkout-panel__icon checkout-panel__icon--blue">
                    <Wallet size={24} />
                  </div>
                  <div>
                    <h3>{t("VÃ­ Äiá»‡n Tá»­ Canteen VWA Pay")}</h3>
                    <span>{t("TÃ i khoáº£n thanh toÃ¡n ná»™i bá»™ há»c viá»‡n")}</span>
                  </div>
                </div>
                <span className="checkout-panel__tag checkout-panel__tag--blue">
                  {t("HoÃ n")} {(ptsCfg?.earn?.rate_points || 1) / ((ptsCfg?.earn?.rate_amount || 10000) / 100)}% Green Points
                </span>
              </div>

              <div className="checkout-wallet-balance">
                <div>
                  <span className="checkout-wallet-balance__label">
                    {t("Sá»‘ dÆ° kháº£ dá»¥ng trong vÃ­:")}
                  </span>
                  <div className="checkout-wallet-balance__value">
                    <b>{money(walletBalance).replace("Ä‘", "")}</b>
                    <span>Ä‘</span>
                    <span className="checkout-wallet-balance__badge">
                      {total <= walletBalance
                        ? t("Äá»§ thanh toÃ¡n")
                        : t("KhÃ´ng Ä‘á»§")}
                    </span>
                  </div>
                </div>
                <Link
                  to="/customer/wallet"
                  className="checkout-wallet-balance__btn"
                >
                  <Plus size={16} />
                  {t("Náº¡p thÃªm tiá»n")}
                </Link>
              </div>

              <label className="checkout-points-option">
                <input
                  type="checkbox"
                  checked={usePoints}
                  onChange={(e) => {
                    if (e.target.checked && appliedVoucher) {
                      toast(t("Chá»‰ cÃ³ thá»ƒ sá»­ dá»¥ng voucher hoáº·c Green Points cho má»™t Ä‘Æ¡n hÃ ng."), "warning");
                      return;
                    }
                    setUsePoints(e.target.checked);
                  }}
                />
                <div className="checkout-points-option__body">
                  <div className="checkout-points-option__head">
                    <b>{t("Sá»­ dá»¥ng Ä‘iá»ƒm sinh viÃªn Green Points")}</b>
                    <span className="checkout-points-option__discount">
                      -{money(pointsDiscount)}
                    </span>
                  </div>
                  <p>
                    {t("Báº¡n Ä‘ang cÃ³ {points} Ä‘iá»ƒm tÃ­ch lÅ©y. Quy Ä‘á»•i tá»‘i Ä‘a 2.500 Ä‘ cho suáº¥t Äƒn nÃ y.")
                      .replace("{points}", points)}
                  </p>
                </div>
              </label>

              <button
                type="button"
                className="checkout-panel__cta"
                onClick={() => confirmPayment("WALLET")}
                disabled={submittingOrder || total > walletBalance}
              >
                <Check size={20} />
                {t("XÃ¡c nháº­n trá»« vÃ­ & HoÃ n táº¥t Ä‘Æ¡n")} ({money(total)})
              </button>
            </div>
          )}

          {paymentMethod === "qr" && (
            <div className="checkout-panel">
              <div className="checkout-panel__head">
                <div className="checkout-panel__head-left">
                  <div className="checkout-panel__icon checkout-panel__icon--blue">
                    <QrCode size={24} />
                  </div>
                  <div>
                    <h3>{t("QuÃ©t mÃ£ VietQR / NgÃ¢n hÃ ng")}</h3>
                    <span>
                      {t("TÆ°Æ¡ng thÃ­ch vá»›i hÆ¡n 45+ App NgÃ¢n HÃ ng & Momo, VNPay")}
                    </span>
                  </div>
                </div>
                <span className="checkout-panel__live">
                  <span className="checkout-panel__live-dot" />
                  {t("Tá»± Ä‘á»™ng Ä‘á»‘i soÃ¡t")}
                </span>
              </div>

              <div className="checkout-qr-grid">
                <div className="checkout-qr-frame">
                  <div className="checkout-qr-frame__inner">
                    {vietQrImageUrl && qrImageFailedUrl !== vietQrImageUrl ? (
                      <img
                        src={vietQrImageUrl}
                        className="checkout-qr-svg"
                        alt={`Ma VietQR thanh toan cho ${bankAccountName}`}
                        width="200"
                        height="200"
                        decoding="async"
                        onError={() => setQrImageFailedUrl(vietQrImageUrl)}
                      />
                    ) : (
                      <div
                        className="checkout-qr-unavailable"
                        style={{
                          width: 200,
                          height: 200,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "center",
                          gap: 10,
                          textAlign: "center",
                        }}
                      >
                        <QrCode size={36} />
                        <span>
                          {bankAccount
                            ? t("Khong tai duoc ma VietQR. Kiem tra ket noi hoac cau hinh ngan hang.")
                            : t("Admin chua cau hinh tai khoan nhan tien.")}
                        </span>
                      </div>
                    )}
                  </div>



                  <div className="checkout-qr-frame__actions">
                    <button type="button" onClick={downloadVietQrImage}>
                      <Download size={14} />
                      {t("LÆ°u áº£nh QR")}
                    </button>
                  </div>
                </div>

                <div className="checkout-qr-info">
                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("ÄÆ N Vá»Š THá»¤ HÆ¯á»žNG")}</span>
                      <b>{bankAccountName}</b>
                      <small>
                        {t("NgÃ¢n hÃ ng:")} {bankCode}
                      </small>
                    </div>
                  </div>

                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("Sá» TÃ€I KHOáº¢N")}</span>
                      <b className="mono">{bankAccount || "â€”"}</b>
                    </div>
                    {bankAccount && (
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(bankAccount.replace(/\s/g, ""))
                        }
                      >
                        <Copy size={14} />
                        {t("Sao chÃ©p")}
                      </button>
                    )}
                  </div>

                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("Ná»˜I DUNG CHUYá»‚N KHOáº¢N")}</span>
                      <b className="mono blue">{transferContent}</b>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(transferContent)}
                    >
                      <Copy size={14} />
                      {t("Sao chÃ©p")}
                    </button>
                  </div>

                  <div className="checkout-qr-info__row checkout-qr-info__row--amount">
                    <div>
                      <span>{t("Sá» TIá»€N CHÃNH XÃC")}</span>
                      <b className="mono blue large">{money(total)}</b>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => copyToClipboard(String(total))}
                    >
                      <Copy size={14} />
                      {t("Sao chÃ©p")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="checkout-qr-sync">
                <div className="checkout-qr-sync__icon">
                  <RefreshCw size={18} className="checkout-spin" />
                </div>
                <div>
                  <b>{t("Äang chá» nháº­n tiá»n tá»« tÃ i khoáº£n...")}</b>
                  <p>
                    {t("Há»‡ thá»‘ng sáº½ tá»± Ä‘á»™ng xÃ¡c nháº­n Ä‘Æ¡n trong 2 - 5 giÃ¢y ngay sau khi giao dá»‹ch thÃ nh cÃ´ng.")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="checkout-panel__cta"
                onClick={() => confirmPayment("QR")}
                disabled={submittingOrder}
              >
                <BadgeCheck size={20} />
                {t("TÃ´i Ä‘Ã£ chuyá»ƒn khoáº£n / HoÃ n táº¥t")}
              </button>
            </div>
          )}

          {paymentMethod === "card" && (
            <div className="checkout-panel">
              <div className="checkout-panel__head">
                <div className="checkout-panel__head-left">
                  <div className="checkout-panel__icon checkout-panel__icon--blue">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <h3>{t("Tháº» Sinh ViÃªn LiÃªn Káº¿t / Cháº¡m POS")}</h3>
                    <span>
                      {t("Tháº» chip contactless BIDV / Agribank tÃ­ch há»£p tháº» sinh viÃªn HVPNVN")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="checkout-card-info">
                <div className="checkout-card-info__icon">
                  <Wifi size={32} />
                </div>
                <div>
                  <b>{t("HÆ°á»›ng dáº«n thanh toÃ¡n táº¡i quáº§y")}</b>
                  <p>
                    {t("Khi Ä‘áº¿n Quáº§y 01 (CÆ¡m) Ä‘á»ƒ nháº­n suáº¥t, báº¡n chá»‰ cáº§n Ä‘Æ°a tháº» sinh viÃªn cháº¡m nháº¹ vÃ o Kiosk tá»± phá»¥c vá»¥ hoáº·c mÃ¡y POS di Ä‘á»™ng cá»§a nhÃ¢n viÃªn Ä‘á»ƒ hoÃ n táº¥t trá»« tiá»n trong tÃ­ch táº¯c.")}
                  </p>
                </div>
              </div>

              <div className="checkout-card-user">
                <div className="checkout-card-user__left">
                  <CreditCard size={18} />
                  <span>
                    {t("Tháº» SV:")} {user?.name || "Nguyá»…n VÄƒn A"} (K21 - CNTT)
                  </span>
                </div>
                <span className="checkout-card-user__num">â€¢â€¢â€¢â€¢ 8098</span>
              </div>

              <button
                type="button"
                className="checkout-panel__cta"
                onClick={() => submitOrder("CARD")}
                disabled={submittingOrder}
              >
                {submittingOrder ? (
                  <>
                    <Loader2 size={18} className="checkout-spin" />
                    {t("Äang xá»­ lÃ½...")}
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    {t("XÃ¡c nháº­n Ä‘áº·t suáº¥t & Cháº¡m tháº» khi nháº­n mÃ³n")}
                  </>
                )}
              </button>
            </div>
          )}

          {paymentMethod === "cash" && (
            <div className="checkout-panel">
              <div className="checkout-panel__head">
                <div className="checkout-panel__head-left">
                  <div className="checkout-panel__icon checkout-panel__icon--blue">
                    <Banknote size={24} />
                  </div>
                  <div>
                    <h3>{t("Tiá»n Máº·t Trá»±c Tiáº¿p Táº¡i Quáº§y")}</h3>
                    <span>
                      {t("Thanh toÃ¡n cho nhÃ¢n viÃªn thu ngÃ¢n táº¡i Quáº§y 01 khi láº¥y cÆ¡m")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="checkout-cash-info">
                <div className="checkout-cash-info__head">
                  <Info size={18} />
                  <b>{t("LÆ°u Ã½ khi thanh toÃ¡n tiá»n máº·t")}</b>
                </div>
                <p>
                  {t("Vui lÃ²ng chuáº©n bá»‹ sáºµn Ä‘Ãºng hoáº·c gáº§n Ä‘á»§ sá»‘ tiá»n")}{" "}
                  <b>{money(total)}</b>{" "}
                  {t("Ä‘á»ƒ giÃºp quáº§y phá»¥c vá»¥ trÆ°a nhanh chÃ³ng, trÃ¡nh Ã¹n táº¯c hÃ ng chá» trong giá» cao Ä‘iá»ƒm cá»§a há»c viá»‡n.")}
                </p>

                <div className="checkout-cash-info__denoms">
                  <span>{t("Má»‡nh giÃ¡ tiá»n dá»± kiáº¿n Ä‘Æ°a:")}</span>
                  <div className="checkout-cash-info__denoms-row">
                    <button type="button">
                      {t("ÄÃºng")} {money(total)}
                    </button>
                    <button type="button">
                      {t("ÄÆ°a 50.000 Ä‘ (Thá»‘i 15k)")}
                    </button>
                    <button type="button">{t("ÄÆ°a 100.000 Ä‘")}</button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="checkout-panel__cta"
                onClick={() => submitOrder("CASH")}
                disabled={submittingOrder}
              >
                {submittingOrder ? (
                  <>
                    <Loader2 size={18} className="checkout-spin" />
                    {t("Äang xá»­ lÃ½...")}
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    {t("XÃ¡c nháº­n Ä‘áº·t Ä‘Æ¡n & Tráº£ tiá»n máº·t táº¡i quáº§y")}
                  </>
                )}
              </button>
            </div>
          )}

          <div className="checkout-security">
            <div className="checkout-security__left">
              <Shield size={26} />
              <div>
                <b>{t("Thanh toÃ¡n báº£o máº­t chuáº©n SSL / PCI-DSS")}</b>
                <span>
                  {t("Cam káº¿t hoÃ n tiá»n 100% tá»± Ä‘á»™ng náº¿u quáº§y táº¡m háº¿t mÃ³n hoáº·c phÃ¡t sinh lá»—i")}
                </span>
              </div>
            </div>
            <div className="checkout-security__right">
              <PhoneCall size={16} />
              <span>{t("Hotline Canteen: 024 3775 1750")}</span>
            </div>
          </div>
        </div>

        <div className="checkout-right">
          <div className="checkout-student">
            <div className="checkout-student__left">
              <div className="checkout-student__avatar">
                {(user?.name || "NA")
                  .split(" ")
                  .map((w) => w[0])
                  .slice(-2)
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="checkout-student__info">
                <div className="checkout-student__name-row">
                  <b>{user?.name || t("Sinh viÃªn")}</b>
                  <span>K21 CNTT</span>
                </div>
                <div className="checkout-student__meta">
                  {t("MSSV:")} 2151010088 â€¢ {t("Trá»£ giÃ¡ SV 2025")}
                </div>
              </div>
            </div>
            <BadgeCheck size={22} className="checkout-student__verified" />
          </div>

          <div className="checkout-verify">
            <div className="checkout-verify__head">
              <div className="checkout-verify__title">
                <BadgeCheck size={20} />
                <b>{t("XÃ¡c minh thÃ´ng tin nháº­n mÃ³n")}</b>
              </div>
              <span className="checkout-verify__badge">
                <Shield size={12} />
                {t("Báº¯t buá»™c trÆ°á»›c khi Ä‘áº·t")}
              </span>
            </div>

            <div className="checkout-verify__grid">
              <label
                className={`checkout-field${errors.name ? " has-error" : ""}`}
              >
                <span className="checkout-field__label">
                  <User size={13} /> {t("Há» tÃªn ngÆ°á»i nháº­n")}
                </span>
                <input
                  type="text"
                  className="checkout-field__input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) {
                      setErrors((prev) => ({ ...prev, name: "" }));
                    }
                  }}
                  placeholder={t("Nguyá»…n VÄƒn A")}
                  autoComplete="name"
                />
                {errors.name && (
                  <span className="checkout-field__error">
                    <AlertCircle size={12} /> {errors.name}
                  </span>
                )}
              </label>

              <label
                className={`checkout-field${errors.phone ? " has-error" : ""}`}
              >
                <span className="checkout-field__label">
                  <Phone size={13} /> {t("Sá»‘ Ä‘iá»‡n thoáº¡i nháº­n mÃ³n")}
                </span>
                <input
                  type="tel"
                  className="checkout-field__input"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) {
                      setErrors((prev) => ({ ...prev, phone: "" }));
                    }
                  }}
                  placeholder="0988 123 456"
                  autoComplete="tel"
                />
                {errors.phone && (
                  <span className="checkout-field__error">
                    <AlertCircle size={12} /> {errors.phone}
                  </span>
                )}
              </label>

              <label
                className={`checkout-field checkout-field--full${
                  errors.pickupTime ? " has-error" : ""
                }`}
              >
                <span className="checkout-field__label">
                  <Clock size={13} /> {t("Giá» nháº­n mÃ³n")}
                </span>
                <select
                  className="checkout-field__input"
                  value={pickupTime}
                  onChange={(e) => {
                    setPickupTime(e.target.value);
                    if (errors.pickupTime) {
                      setErrors((prev) => ({ ...prev, pickupTime: "" }));
                    }
                  }}
                  disabled={initLoading}
                >
                  <option value="">
                    {initLoading
                      ? t("-- Äang táº£i khung giá» --")
                      : t("-- Chá»n khung giá» nháº­n --")}
                  </option>
                  {timeSlots.map((slot) => {
                    const past = isSlotInPast(slot);
                    return (
                      <option key={slot} value={slot} disabled={past}>
                        {slot}
                        {past ? ` (${t("Ä‘Ã£ qua")})` : ""}
                      </option>
                    );
                  })}
                </select>
                {errors.pickupTime && (
                  <span className="checkout-field__error">
                    <AlertCircle size={12} /> {errors.pickupTime}
                  </span>
                )}
              </label>

              <label className="checkout-field checkout-field--full">
                <span className="checkout-field__label">
                  <FileText size={13} />{" "}
                  {t("Ghi chÃº cho báº¿p (khÃ´ng báº¯t buá»™c)")}
                </span>
                <textarea
                  className="checkout-field__input checkout-field__input--area"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t(
                    "VD: Ã­t cay, khÃ´ng hÃ nh, gá»i trÆ°á»›c khi tá»›i quáº§y..."
                  )}
                />
              </label>

              {/* Sá»NG XANH Há»ŒC ÄÆ¯á»œNG */}
              <label
                className="checkout-field checkout-field--full"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  background: isGreen ? "rgba(24, 169, 103, 0.08)" : "transparent",
                  border: isGreen ? "1px solid #18a967" : "1px dashed #cbd5e1",
                  borderRadius: 10,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="checkbox"
                  id="isGreen-tick"
                  checked={isGreen}
                  onChange={(e) => setIsGreen(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#18a967" }}
                />
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    fontSize: 13,
                    fontWeight: 600,
                    color: isGreen ? "#18a967" : "var(--text-primary, #172033)",
                  }}
                >
                  <span>
                    <Leaf size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                    {t("TÃ´i mang bÃ¬nh nÆ°á»›c / há»™p cÆ¡m riÃªng")}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    {t("Sá»‘ng Xanh Há»c ÄÆ°á»ng â€” cá»™ng")} {ptsCfg?.earn?.green_points || 10} {t("Ä‘iá»ƒm sau khi nhÃ¢n viÃªn duyá»‡t")}
                  </span>
                </span>
              </label>
            </div>

            <p className="checkout-verify__hint">
              <Info size={14} />
              {t(
                "ThÃ´ng tin nÃ y dÃ¹ng Ä‘á»ƒ liÃªn há»‡ khi mÃ³n Ä‘Ã£ sáºµn sÃ ng vÃ  Ä‘á»ƒ in phiáº¿u báº¿p KDS."
              )}
            </p>
          </div>

          <div className="checkout-summary">
            <div className="checkout-summary__head">
              <div>
                <Utensils size={20} />
                <b>
                  {t("TÃ³m táº¯t Ä‘Æ¡n hÃ ng")} ({lines.length} {t("mÃ³n")})
                </b>
              </div>

            </div>

            <div className="checkout-pickup-badge">
              <div>
                <Store size={18} />
                <b>{t("Quáº§y 01 (CÆ¡m) & Quáº§y 03 (NÆ°á»›c)")}</b>
              </div>
              <span>
                {t("Ca TrÆ°a")} â€¢ {t("Ä‚n táº¡i quáº§y")}
              </span>
            </div>

            <div className="checkout-summary__items">
              {lines.map((m) => (
                <div key={m._key} className="checkout-summary-item">
                  <div className="checkout-summary-item__img">
                    {m.image ? (
                      <img src={m.image} alt={m.name} loading="lazy" />
                    ) : (
                      <Soup size={26} />
                    )}
                  </div>
                  <div className="checkout-summary-item__info">
                    <h4>{tData(m, "name")}</h4>
                    <div className="checkout-summary-item__meta">
                      <span>Quáº§y 01</span>
                      <span>â€¢</span>
                      <span>SL: {m.qty}</span>
                      {m.discount_percent > 0 && (
                        <span className="checkout-summary-item__tag">
                          {t("Trá»£ giÃ¡")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="checkout-summary-item__price">
                    {money(m.price * m.qty)}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="checkout-voucher-panel"
              style={{
                margin: "12px 0",
                padding: "14px",
                border: "1px solid #dbeafe",
                borderRadius: "12px",
                background: "#f8fbff"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
                <Tag size={17} color="#2563eb" />
                <strong style={{ color: "#173b8f" }}>Voucher giáº£m giÃ¡</strong>
              </div>

              {appliedVoucher ? (
                <div style={{
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0"
                }}>
                  <div style={{ color: "#047857", fontWeight: 700 }}>
                    âœ“ ÄÃ£ Ã¡p dá»¥ng mÃ£ {appliedVoucher.code}
                  </div>
                  <div style={{ color: "#047857", fontSize: "13px", marginTop: "5px" }}>
                    Giáº£m {money(discount)} cho Ä‘Æ¡n hÃ ng
                  </div>
                  <button
                    type="button"
                    onClick={clearVoucher}
                    style={{
                      marginTop: "8px",
                      padding: "7px 12px",
                      border: "1px solid #a7f3d0",
                      borderRadius: "7px",
                      background: "#fff",
                      color: "#047857",
                      cursor: "pointer"
                    }}
                  >
                    Bá» Ã¡p dá»¥ng
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyVoucher(voucherCode);
                        }
                      }}
                      placeholder="Nháº­p mÃ£ voucher"
                      aria-label="MÃ£ voucher"
                      disabled={applyingVoucher}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "10px",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        background: "#fff"
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => applyVoucher(voucherCode)}
                      disabled={applyingVoucher || !voucherCode.trim()}
                      style={{
                        padding: "10px 14px",
                        border: 0,
                        borderRadius: "8px",
                        background: applyingVoucher || !voucherCode.trim() ? "#94a3b8" : "#2563eb",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: applyingVoucher || !voucherCode.trim() ? "not-allowed" : "pointer"
                      }}
                    >
                      {applyingVoucher ? "Äang kiá»ƒm tra..." : "Ãp dá»¥ng"}
                    </button>
                  </div>

                  {myVouchers.filter((v) => !v.used).length > 0 && (
                    <div style={{ marginTop: "10px" }}>
                      <label style={{ display: "block", fontSize: "12px", color: "#475569", marginBottom: "5px" }}>
                        Hoáº·c chá»n voucher Ä‘Ã£ lÆ°u
                      </label>
                      <select
                        value=""
                        disabled={applyingVoucher}
                        onChange={(e) => {
                          if (e.target.value) applyVoucher(e.target.value);
                        }}
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          background: "#fff"
                        }}
                      >
                        <option value="">-- Chá»n voucher --</option>
                        {myVouchers.filter((v) => !v.used).map((v) => (
                          <option key={v.id || v.code} value={v.code}>
                            {v.code} â€” Giáº£m {money(Number(v.value) || 0)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {myVouchers.filter((v) => !v.used).length === 0 && (
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 0" }}>
                      Báº¡n chÆ°a cÃ³ voucher Ä‘Ã£ lÆ°u. HÃ£y nháº­p mÃ£ voucher há»£p lá»‡.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="checkout-summary__costs">
              <div className="checkout-cost-row">
                <span>{t("Táº¡m tÃ­nh:")}</span>
                <b>{money(subtotal)}</b>
              </div>

              {discount > 0 && (
                <div className="checkout-cost-row checkout-cost-row--discount">
                  <span>
                    <Tag size={14} />
                    {t("MÃ£ giáº£m giÃ¡")}
                    {appliedVoucher?.code && ` (${appliedVoucher.code})`}:
                  </span>
                  <b>-{money(discount)}</b>
                </div>
              )}

              {pointsDiscount > 0 && (
                <div className="checkout-cost-row checkout-cost-row--discount">
                  <span>
                    <Sparkles size={14} />
                    {t("Äiá»ƒm Green Points:")}
                  </span>
                  <b>-{money(pointsDiscount)}</b>
                </div>
              )}

              <div className="checkout-summary__total">
                <div>
                  <span>{t("Tá»”NG TIá»€N THANH TOÃN")}</span>
                  <small>
                    {t("ÄÃ£ bao gá»“m VAT & trá»£ giÃ¡ há»c Ä‘Æ°á»ng")}
                  </small>
                </div>
                <div className="checkout-summary__total-value">
                  {money(total)}
                </div>
              </div>
            </div>

            {(paymentMethod === "wallet" || paymentMethod === "qr") && (
              <div className="checkout-summary__note">
                <Info size={16} />
                <span>
                  {paymentMethod === "wallet"
                    ? t("VÃ­ sáº½ bá»‹ trá»« ngay khi báº¡n xÃ¡c nháº­n Ä‘Æ¡n hÃ ng.")
                    : t("Vui lÃ²ng hoÃ n táº¥t chuyá»ƒn khoáº£n, sau Ä‘Ã³ áº¥n xÃ¡c nháº­n.")}
                </span>
              </div>
            )}

            <Link
              to={isBuyNow ? "/customer/menu" : "/customer/cart"}
              className="checkout-summary__back"
            >
              {isBuyNow ? t("Quay láº¡i thá»±c Ä‘Æ¡n") : t("Quay láº¡i giá» hÃ ng chá»‰nh sá»­a")}
            </Link>
          </div>

          <div className="checkout-kds-note">
            <Microwave size={20} />
            <div>
              <b>{t("Quy trÃ¬nh chuyá»ƒn báº¿p KDS tá»± Ä‘á»™ng:")}</b>
              <p>
                {t("Sau khi áº¥n hoÃ n táº¥t thanh toÃ¡n, quáº§y báº¿p 01 & quáº§y nÆ°á»›c 03 sáº½ láº­p tá»©c nháº­n vÃ© Ä‘iá»‡n tá»­ Ä‘á»ƒ chuáº©n bá»‹ thá»©c Äƒn nÃ³ng sá»‘t ká»‹p thá»i cho báº¡n.")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          onClose={() => !submittingOrder && setPaymentOrder(null)}
          onConfirm={confirmPayment}
          walletBalance={walletBalance}
        />
      )}

      <style>{`
        @keyframes checkout-spin-anim {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .checkout-spin { animation: checkout-spin-anim 1s linear infinite; }
      `}</style>
    </div>
  );
}
