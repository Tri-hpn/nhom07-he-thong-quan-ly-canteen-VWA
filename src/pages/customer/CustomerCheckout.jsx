// ============================================================
// CUSTOMERCHECKOUT.JSX Ã¢â‚¬â€ Thanh toÃƒÂ¡n (V5 - FINAL + i18n)
// ============================================================
// V5 (2026-10):
//   - Ã°Å¸â€Â§ FIX #28: EMPTY_ARRAY module-scoped constant, khÃƒÂ´ng re-create
//                 mÃ¡Â»â€”i render Ã¢â€ â€™ useCrossTabSync khÃƒÂ´ng bÃ¡Â»â€¹ re-init
//   - GiÃ¡Â»Â¯ nguyÃƒÂªn toÃƒÂ n bÃ¡Â»â„¢ logic khÃƒÂ¡c
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

// Ã°Å¸â€Â§ FIX #28: Module-scoped frozen constant
const EMPTY_ARRAY = Object.freeze([]);

const MIN_REDEEM_POINTS = 100;
const REDEEM_PER_POINT = 100;
const REDEEM_MAX_AMOUNT = 2500;
const MIN_ORDER_POINTS_REDEEM = 10;
const COUNTDOWN_START = 585;

const SELECTED_CART_KEY = "canteen_cart_selected";
const CART_KEY = "canteen_cart";

const PAYMENT_METHODS = [
  { id: "wallet", label: "VÃƒÂ­ VWA Pay",    icon: Wallet },
  { id: "qr",     label: "MÃƒÂ£ VietQR",     icon: QrCode },
  { id: "card",   label: "ThÃ¡ÂºÂ» Sinh ViÃƒÂªn", icon: CreditCard },
  { id: "cash",   label: "TiÃ¡Â»Ân mÃ¡ÂºÂ·t",      icon: Banknote },
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

  // Ã°Å¸â€Â§ FIX #28: EMPTY_ARRAY lÃƒÂ  module-scoped frozen constant,
  // khÃƒÂ´ng phÃ¡ÂºÂ£i re-create mÃ¡Â»â€”i render
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
          t("Voucher khÃƒÂ´ng cÃƒÂ²n hÃ¡Â»Â£p lÃ¡Â»â€¡ do thay Ã„â€˜Ã¡Â»â€¢i Ã„â€˜Ã†Â¡n hÃƒÂ ng"),
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
        toast(t("Vui lÃƒÂ²ng nhÃ¡ÂºÂ­p mÃƒÂ£ voucher"), "error");
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
          `${t("Ã„ÂÃƒÂ£ ÃƒÂ¡p dÃ¡Â»Â¥ng voucher")}: -${money(res.value)}`,
          "success"
        );
      } catch (e) {
        if (myReqId !== voucherReqIdRef.current) return;
        toast(e.message || t("MÃƒÂ£ voucher khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡"), "error");
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
        t("BÃ¡ÂºÂ¡n cÃ¡ÂºÂ§n ÃƒÂ­t nhÃ¡ÂºÂ¥t {n} Ã„â€˜iÃ¡Â»Æ’m Ã„â€˜Ã¡Â»Æ’ Ã„â€˜Ã¡Â»â€¢i").replace(
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
        `${t("Ã„ÂÃ¡Â»â€¢i thÃƒÂ nh cÃƒÂ´ng voucher")} ${voucher.code} Ã¢â‚¬â€ ${money(voucher.value)}`,
        "success"
      );

      await reloadVouchersAndPoints();
      await applyVoucher(voucher.code);
    } catch (e) {
      toast(e.message || t("KhÃƒÂ´ng Ã„â€˜Ã¡Â»â€¢i Ã„â€˜Ã†Â°Ã¡Â»Â£c voucher"), "error");
    } finally {
      setRedeemLoading(false);
    }
  };

  const validate = () => {
    const errs = {};

    if (!name.trim()) errs.name = t("Vui lÃƒÂ²ng nhÃ¡ÂºÂ­p hÃ¡Â»Â tÃƒÂªn");

    if (!phone.trim()) {
      errs.phone = t("Vui lÃƒÂ²ng nhÃ¡ÂºÂ­p SÃ„ÂT");
    } else if (!/^[0-9]{10,11}$/.test(phone.trim())) {
      errs.phone = t("SÃ„ÂT phÃ¡ÂºÂ£i 10-11 sÃ¡Â»â€˜");
    }

    if (!pickupTime.trim()) {
      errs.pickupTime = t("Vui lÃƒÂ²ng chÃ¡Â»Ân giÃ¡Â»Â nhÃ¡ÂºÂ­n");
    } else if (isSlotInPast(pickupTime)) {
      errs.pickupTime = t("Khung giÃ¡Â»Â nÃƒÂ y Ã„â€˜ÃƒÂ£ qua");
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
    if (pickupTime) noteParts.push(`${t("NhÃ¡ÂºÂ­n hÃƒÂ ng:")} ${pickupTime}`);
    return noteParts.join(" Ã‚Â· ");
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
        t("ChÃ¡Â»â€° cÃƒÂ³ thÃ¡Â»Æ’ sÃ¡Â»Â­ dÃ¡Â»Â¥ng voucher hoÃ¡ÂºÂ·c Green Points cho mÃ¡Â»â„¢t Ã„â€˜Ã†Â¡n hÃƒÂ ng."),
        "warning"
      );
      return null;
    }

    if (pointsToRedeem < MIN_ORDER_POINTS_REDEEM) {
      toast(
        t("CÃ¡ÂºÂ§n tÃ¡Â»â€˜i thiÃ¡Â»Æ’u 10 Ã„â€˜iÃ¡Â»Æ’m vÃƒÂ  Ã„â€˜Ã†Â¡n hÃƒÂ ng tÃ¡Â»Â« 1.000 Ã„â€˜ Ã„â€˜Ã¡Â»Æ’ sÃ¡Â»Â­ dÃ¡Â»Â¥ng Green Points."),
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
        t("KhÃƒÂ´ng xÃƒÂ¡c minh Ã„â€˜Ã†Â°Ã¡Â»Â£c voucher Ã„â€˜Ã¡Â»â€¢i Ã„â€˜iÃ¡Â»Æ’m. Vui lÃƒÂ²ng kiÃ¡Â»Æ’m tra lÃ¡ÂºÂ¡i voucher trong tÃƒÂ i khoÃ¡ÂºÂ£n.")
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
        toast(t("GiÃ¡Â»Â hÃƒÂ ng trÃ¡Â»â€˜ng"), "error");
        return;
      }
      if (!validate()) {
        toast(t("KiÃ¡Â»Æ’m tra lÃ¡ÂºÂ¡i thÃƒÂ´ng tin"), "error");
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
          `${t("Ã„ÂÃ¡ÂºÂ·t hÃƒÂ ng thÃƒÂ nh cÃƒÂ´ng!")} ${t("MÃƒÂ£ Ã„â€˜Ã†Â¡n")}: ${order.code}`,
          "success"
        );

        navigate("/customer/success", { state: { order } });
      } catch (e) {
        toast(e.message || t("KhÃƒÂ´ng Ã„â€˜Ã¡ÂºÂ·t Ã„â€˜Ã†Â°Ã¡Â»Â£c hÃƒÂ ng"), "error");
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
        toast(t("GiÃ¡Â»Â hÃƒÂ ng trÃ¡Â»â€˜ng"), "error");
        return;
      }
      if (!validate()) {
        toast(t("KiÃ¡Â»Æ’m tra lÃ¡ÂºÂ¡i thÃƒÂ´ng tin"), "error");
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
          `${t("Ã„ÂÃ¡ÂºÂ·t hÃƒÂ ng thÃƒÂ nh cÃƒÂ´ng!")} ${t("MÃƒÂ£ Ã„â€˜Ã†Â¡n")}: ${order.code}`,
          "success"
        );
        setPaymentOrder(null);

        navigate("/customer/success", { state: { order } });
      } catch (e) {
        toast(e.message || t("KhÃƒÂ´ng Ã„â€˜Ã¡ÂºÂ·t Ã„â€˜Ã†Â°Ã¡Â»Â£c hÃƒÂ ng"), "error");
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
      toast(t("Ã„ÂÃƒÂ£ sao chÃƒÂ©p"), "success");
    } catch {
      toast(t("KhÃƒÂ´ng sao chÃƒÂ©p Ã„â€˜Ã†Â°Ã¡Â»Â£c"), "error");
    }
  };

  if (!lines.length) {
    return (
      <div className="checkout-v2-empty">
        <ShoppingBag size={60} />
        <h3>{t("GiÃ¡Â»Â hÃƒÂ ng Ã„â€˜ang trÃ¡Â»â€˜ng")}</h3>
        <Link to="/customer/menu" className="checkout-v2-empty__btn">
          <Utensils size={16} />
          {t("KhÃƒÂ¡m phÃƒÂ¡ thÃ¡Â»Â±c Ã„â€˜Ã†Â¡n")}
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
      toast(t("ChÃ†Â°a cÃƒÂ³ mÃƒÂ£ QR Ã„â€˜Ã¡Â»Æ’ tÃ¡ÂºÂ£i xuÃ¡Â»â€˜ng"), "error");
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
      toast(t("Ã„ÂÃƒÂ£ tÃ¡ÂºÂ£i Ã¡ÂºÂ£nh mÃƒÂ£ QR xuÃ¡Â»â€˜ng mÃƒÂ¡y"), "success");
    } catch (error) {
      console.error("Download VietQR failed:", error);
      toast(
        t("KhÃƒÂ´ng tÃ¡ÂºÂ£i Ã„â€˜Ã†Â°Ã¡Â»Â£c Ã¡ÂºÂ£nh QR tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng. Vui lÃƒÂ²ng kiÃ¡Â»Æ’m tra kÃ¡ÂºÂ¿t nÃ¡Â»â€˜i vÃƒÂ  thÃ¡Â»Â­ lÃ¡ÂºÂ¡i."),
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
              {t("Trang chÃ¡Â»Â§")}
            </Link>
            <ChevronRight size={14} className="checkout-breadcrumb__sep" />
            <Link to="/customer/cart" className="checkout-breadcrumb__link">
              {t("GiÃ¡Â»Â hÃƒÂ ng")}
            </Link>
            <ChevronRight size={14} className="checkout-breadcrumb__sep" />
            <span className="checkout-breadcrumb__current">
              {t("Thanh toÃƒÂ¡n Ã„â€˜Ã†Â¡n hÃƒÂ ng")}
            </span>
          </nav>

          <div className="checkout-timer">
            <Timer size={16} className="checkout-timer__icon" />
            <span>{t("GiÃ¡Â»Â¯ suÃ¡ÂºÂ¥t & giÃƒÂ¡ Ã†Â°u Ã„â€˜ÃƒÂ£i trong:")}</span>
            <b>{countdownStr}</b>
          </div>
        </div>

        <div className="checkout-stepper">
          <div className="checkout-stepper__item checkout-stepper__item--done">
            <div className="checkout-stepper__icon">
              <Check size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÃ†Â¯Ã¡Â»Å¡C 1")}</span>
              <b>{t("ChÃ¡Â»Ân mÃƒÂ³n")}</b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--done">
            <div className="checkout-stepper__icon">
              <Check size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÃ†Â¯Ã¡Â»Å¡C 2")}</span>
              <b>{t("GiÃ¡Â»Â & TÃƒÂ¹y chÃ¡Â»Ân")}</b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--active">
            <div className="checkout-stepper__icon checkout-stepper__icon--active">
              <CreditCard size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label checkout-stepper__label--active">
                {t("BÃ†Â¯Ã¡Â»Å¡C 3")}
              </span>
              <b className="checkout-stepper__label--active">
                {t("Thanh toÃƒÂ¡n")}
              </b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--pending">
            <div className="checkout-stepper__icon">
              <Store size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÃ†Â¯Ã¡Â»Å¡C 4")}</span>
              <b>{t("NhÃ¡ÂºÂ­n tÃ¡ÂºÂ¡i quÃ¡ÂºÂ§y")}</b>
            </div>
          </div>
        </div>
      </section>

      <div className="checkout-grid">
        <div className="checkout-left">
          <div className="checkout-method-header">
            <div>
              <h1>{t("PhÃ†Â°Ã†Â¡ng thÃ¡Â»Â©c thanh toÃƒÂ¡n")}</h1>
              <p>
                {t("ChÃ¡Â»Ân 1 trong 4 hÃƒÂ¬nh thÃ¡Â»Â©c thanh toÃƒÂ¡n thuÃ¡ÂºÂ­n tiÃ¡Â»â€¡n cho sinh viÃƒÂªn & giÃ¡ÂºÂ£ng viÃƒÂªn")}
              </p>
            </div>
            <span className="checkout-method-header__badge">
              <Zap size={14} />
              {t("XÃ¡Â»Â­ lÃƒÂ½ tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng 24/7")}
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
                    <h3>{t("VÃƒÂ­ Ã„ÂiÃ¡Â»â€¡n TÃ¡Â»Â­ Canteen VWA Pay")}</h3>
                    <span>{t("TÃƒÂ i khoÃ¡ÂºÂ£n thanh toÃƒÂ¡n nÃ¡Â»â„¢i bÃ¡Â»â„¢ hÃ¡Â»Âc viÃ¡Â»â€¡n")}</span>
                  </div>
                </div>
                <span className="checkout-panel__tag checkout-panel__tag--blue">
                  {t("HoÃƒÂ n")} {(ptsCfg?.earn?.rate_points || 1) / ((ptsCfg?.earn?.rate_amount || 10000) / 100)}% Green Points
                </span>
              </div>

              <div className="checkout-wallet-balance">
                <div>
                  <span className="checkout-wallet-balance__label">
                    {t("SÃ¡Â»â€˜ dÃ†Â° khÃ¡ÂºÂ£ dÃ¡Â»Â¥ng trong vÃƒÂ­:")}
                  </span>
                  <div className="checkout-wallet-balance__value">
                    <b>{money(walletBalance).replace("Ã„â€˜", "")}</b>
                    <span>Ã„â€˜</span>
                    <span className="checkout-wallet-balance__badge">
                      {total <= walletBalance
                        ? t("Ã„ÂÃ¡Â»Â§ thanh toÃƒÂ¡n")
                        : t("KhÃƒÂ´ng Ã„â€˜Ã¡Â»Â§")}
                    </span>
                  </div>
                </div>
                <Link
                  to="/customer/wallet"
                  className="checkout-wallet-balance__btn"
                >
                  <Plus size={16} />
                  {t("NÃ¡ÂºÂ¡p thÃƒÂªm tiÃ¡Â»Ân")}
                </Link>
              </div>

              <label className="checkout-points-option">
                <input
                  type="checkbox"
                  checked={usePoints}
                  onChange={(e) => {
                    if (e.target.checked && appliedVoucher) {
                      toast(t("ChÃ¡Â»â€° cÃƒÂ³ thÃ¡Â»Æ’ sÃ¡Â»Â­ dÃ¡Â»Â¥ng voucher hoÃ¡ÂºÂ·c Green Points cho mÃ¡Â»â„¢t Ã„â€˜Ã†Â¡n hÃƒÂ ng."), "warning");
                      return;
                    }
                    setUsePoints(e.target.checked);
                  }}
                />
                <div className="checkout-points-option__body">
                  <div className="checkout-points-option__head">
                    <b>{t("SÃ¡Â»Â­ dÃ¡Â»Â¥ng Ã„â€˜iÃ¡Â»Æ’m sinh viÃƒÂªn Green Points")}</b>
                    <span className="checkout-points-option__discount">
                      -{money(pointsDiscount)}
                    </span>
                  </div>
                  <p>
                    {t("BÃ¡ÂºÂ¡n Ã„â€˜ang cÃƒÂ³ {points} Ã„â€˜iÃ¡Â»Æ’m tÃƒÂ­ch lÃ…Â©y. Quy Ã„â€˜Ã¡Â»â€¢i tÃ¡Â»â€˜i Ã„â€˜a 2.500 Ã„â€˜ cho suÃ¡ÂºÂ¥t Ã„Æ’n nÃƒÂ y.")
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
                {t("XÃƒÂ¡c nhÃ¡ÂºÂ­n trÃ¡Â»Â« vÃƒÂ­ & HoÃƒÂ n tÃ¡ÂºÂ¥t Ã„â€˜Ã†Â¡n")} ({money(total)})
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
                    <h3>{t("QuÃƒÂ©t mÃƒÂ£ VietQR / NgÃƒÂ¢n hÃƒÂ ng")}</h3>
                    <span>
                      {t("TÃ†Â°Ã†Â¡ng thÃƒÂ­ch vÃ¡Â»â€ºi hÃ†Â¡n 45+ App NgÃƒÂ¢n HÃƒÂ ng & Momo, VNPay")}
                    </span>
                  </div>
                </div>
                <span className="checkout-panel__live">
                  <span className="checkout-panel__live-dot" />
                  {t("TÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng Ã„â€˜Ã¡Â»â€˜i soÃƒÂ¡t")}
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
                      {t("LÃ†Â°u Ã¡ÂºÂ£nh QR")}
                    </button>
                  </div>
                </div>

                <div className="checkout-qr-info">
                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("Ã„ÂÃ†Â N VÃ¡Â»Å  THÃ¡Â»Â¤ HÃ†Â¯Ã¡Â»Å¾NG")}</span>
                      <b>{bankAccountName}</b>
                      <small>
                        {t("NgÃƒÂ¢n hÃƒÂ ng:")} {bankCode}
                      </small>
                    </div>
                  </div>

                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("SÃ¡Â»Â TÃƒâ‚¬I KHOÃ¡ÂºÂ¢N")}</span>
                      <b className="mono">{bankAccount || "Ã¢â‚¬â€"}</b>
                    </div>
                    {bankAccount && (
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(bankAccount.replace(/\s/g, ""))
                        }
                      >
                        <Copy size={14} />
                        {t("Sao chÃƒÂ©p")}
                      </button>
                    )}
                  </div>

                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("NÃ¡Â»ËœI DUNG CHUYÃ¡Â»â€šN KHOÃ¡ÂºÂ¢N")}</span>
                      <b className="mono blue">{transferContent}</b>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(transferContent)}
                    >
                      <Copy size={14} />
                      {t("Sao chÃƒÂ©p")}
                    </button>
                  </div>

                  <div className="checkout-qr-info__row checkout-qr-info__row--amount">
                    <div>
                      <span>{t("SÃ¡Â»Â TIÃ¡Â»â‚¬N CHÃƒÂNH XÃƒÂC")}</span>
                      <b className="mono blue large">{money(total)}</b>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => copyToClipboard(String(total))}
                    >
                      <Copy size={14} />
                      {t("Sao chÃƒÂ©p")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="checkout-qr-sync">
                <div className="checkout-qr-sync__icon">
                  <RefreshCw size={18} className="checkout-spin" />
                </div>
                <div>
                  <b>{t("Ã„Âang chÃ¡Â»Â nhÃ¡ÂºÂ­n tiÃ¡Â»Ân tÃ¡Â»Â« tÃƒÂ i khoÃ¡ÂºÂ£n...")}</b>
                  <p>
                    {t("HÃ¡Â»â€¡ thÃ¡Â»â€˜ng sÃ¡ÂºÂ½ tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng xÃƒÂ¡c nhÃ¡ÂºÂ­n Ã„â€˜Ã†Â¡n trong 2 - 5 giÃƒÂ¢y ngay sau khi giao dÃ¡Â»â€¹ch thÃƒÂ nh cÃƒÂ´ng.")}
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
                {t("TÃƒÂ´i Ã„â€˜ÃƒÂ£ chuyÃ¡Â»Æ’n khoÃ¡ÂºÂ£n / HoÃƒÂ n tÃ¡ÂºÂ¥t")}
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
                    <h3>{t("ThÃ¡ÂºÂ» Sinh ViÃƒÂªn LiÃƒÂªn KÃ¡ÂºÂ¿t / ChÃ¡ÂºÂ¡m POS")}</h3>
                    <span>
                      {t("ThÃ¡ÂºÂ» chip contactless BIDV / Agribank tÃƒÂ­ch hÃ¡Â»Â£p thÃ¡ÂºÂ» sinh viÃƒÂªn HVPNVN")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="checkout-card-info">
                <div className="checkout-card-info__icon">
                  <Wifi size={32} />
                </div>
                <div>
                  <b>{t("HÃ†Â°Ã¡Â»â€ºng dÃ¡ÂºÂ«n thanh toÃƒÂ¡n tÃ¡ÂºÂ¡i quÃ¡ÂºÂ§y")}</b>
                  <p>
                    {t("Khi Ã„â€˜Ã¡ÂºÂ¿n QuÃ¡ÂºÂ§y 01 (CÃ†Â¡m) Ã„â€˜Ã¡Â»Æ’ nhÃ¡ÂºÂ­n suÃ¡ÂºÂ¥t, bÃ¡ÂºÂ¡n chÃ¡Â»â€° cÃ¡ÂºÂ§n Ã„â€˜Ã†Â°a thÃ¡ÂºÂ» sinh viÃƒÂªn chÃ¡ÂºÂ¡m nhÃ¡ÂºÂ¹ vÃƒÂ o Kiosk tÃ¡Â»Â± phÃ¡Â»Â¥c vÃ¡Â»Â¥ hoÃ¡ÂºÂ·c mÃƒÂ¡y POS di Ã„â€˜Ã¡Â»â„¢ng cÃ¡Â»Â§a nhÃƒÂ¢n viÃƒÂªn Ã„â€˜Ã¡Â»Æ’ hoÃƒÂ n tÃ¡ÂºÂ¥t trÃ¡Â»Â« tiÃ¡Â»Ân trong tÃƒÂ­ch tÃ¡ÂºÂ¯c.")}
                  </p>
                </div>
              </div>

              <div className="checkout-card-user">
                <div className="checkout-card-user__left">
                  <CreditCard size={18} />
                  <span>
                    {t("ThÃ¡ÂºÂ» SV:")} {user?.name || "NguyÃ¡Â»â€¦n VÃ„Æ’n A"} (K21 - CNTT)
                  </span>
                </div>
                <span className="checkout-card-user__num">Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ 8098</span>
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
                    {t("Ã„Âang xÃ¡Â»Â­ lÃƒÂ½...")}
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    {t("XÃƒÂ¡c nhÃ¡ÂºÂ­n Ã„â€˜Ã¡ÂºÂ·t suÃ¡ÂºÂ¥t & ChÃ¡ÂºÂ¡m thÃ¡ÂºÂ» khi nhÃ¡ÂºÂ­n mÃƒÂ³n")}
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
                    <h3>{t("TiÃ¡Â»Ân MÃ¡ÂºÂ·t TrÃ¡Â»Â±c TiÃ¡ÂºÂ¿p TÃ¡ÂºÂ¡i QuÃ¡ÂºÂ§y")}</h3>
                    <span>
                      {t("Thanh toÃƒÂ¡n cho nhÃƒÂ¢n viÃƒÂªn thu ngÃƒÂ¢n tÃ¡ÂºÂ¡i QuÃ¡ÂºÂ§y 01 khi lÃ¡ÂºÂ¥y cÃ†Â¡m")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="checkout-cash-info">
                <div className="checkout-cash-info__head">
                  <Info size={18} />
                  <b>{t("LÃ†Â°u ÃƒÂ½ khi thanh toÃƒÂ¡n tiÃ¡Â»Ân mÃ¡ÂºÂ·t")}</b>
                </div>
                <p>
                  {t("Vui lÃƒÂ²ng chuÃ¡ÂºÂ©n bÃ¡Â»â€¹ sÃ¡ÂºÂµn Ã„â€˜ÃƒÂºng hoÃ¡ÂºÂ·c gÃ¡ÂºÂ§n Ã„â€˜Ã¡Â»Â§ sÃ¡Â»â€˜ tiÃ¡Â»Ân")}{" "}
                  <b>{money(total)}</b>{" "}
                  {t("Ã„â€˜Ã¡Â»Æ’ giÃƒÂºp quÃ¡ÂºÂ§y phÃ¡Â»Â¥c vÃ¡Â»Â¥ trÃ†Â°a nhanh chÃƒÂ³ng, trÃƒÂ¡nh ÃƒÂ¹n tÃ¡ÂºÂ¯c hÃƒÂ ng chÃ¡Â»Â trong giÃ¡Â»Â cao Ã„â€˜iÃ¡Â»Æ’m cÃ¡Â»Â§a hÃ¡Â»Âc viÃ¡Â»â€¡n.")}
                </p>

                <div className="checkout-cash-info__denoms">
                  <span>{t("MÃ¡Â»â€¡nh giÃƒÂ¡ tiÃ¡Â»Ân dÃ¡Â»Â± kiÃ¡ÂºÂ¿n Ã„â€˜Ã†Â°a:")}</span>
                  <div className="checkout-cash-info__denoms-row">
                    <button type="button">
                      {t("Ã„ÂÃƒÂºng")} {money(total)}
                    </button>
                    <button type="button">
                      {t("Ã„ÂÃ†Â°a 50.000 Ã„â€˜ (ThÃ¡Â»â€˜i 15k)")}
                    </button>
                    <button type="button">{t("Ã„ÂÃ†Â°a 100.000 Ã„â€˜")}</button>
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
                    {t("Ã„Âang xÃ¡Â»Â­ lÃƒÂ½...")}
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    {t("XÃƒÂ¡c nhÃ¡ÂºÂ­n Ã„â€˜Ã¡ÂºÂ·t Ã„â€˜Ã†Â¡n & TrÃ¡ÂºÂ£ tiÃ¡Â»Ân mÃ¡ÂºÂ·t tÃ¡ÂºÂ¡i quÃ¡ÂºÂ§y")}
                  </>
                )}
              </button>
            </div>
          )}

          <div className="checkout-security">
            <div className="checkout-security__left">
              <Shield size={26} />
              <div>
                <b>{t("Thanh toÃƒÂ¡n bÃ¡ÂºÂ£o mÃ¡ÂºÂ­t chuÃ¡ÂºÂ©n SSL / PCI-DSS")}</b>
                <span>
                  {t("Cam kÃ¡ÂºÂ¿t hoÃƒÂ n tiÃ¡Â»Ân 100% tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng nÃ¡ÂºÂ¿u quÃ¡ÂºÂ§y tÃ¡ÂºÂ¡m hÃ¡ÂºÂ¿t mÃƒÂ³n hoÃ¡ÂºÂ·c phÃƒÂ¡t sinh lÃ¡Â»â€”i")}
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
                  <b>{user?.name || t("Sinh viÃƒÂªn")}</b>
                  <span>K21 CNTT</span>
                </div>
                <div className="checkout-student__meta">
                  {t("MSSV:")} 2151010088 Ã¢â‚¬Â¢ {t("TrÃ¡Â»Â£ giÃƒÂ¡ SV 2025")}
                </div>
              </div>
            </div>
            <BadgeCheck size={22} className="checkout-student__verified" />
          </div>

          <div className="checkout-verify">
            <div className="checkout-verify__head">
              <div className="checkout-verify__title">
                <BadgeCheck size={20} />
                <b>{t("XÃƒÂ¡c minh thÃƒÂ´ng tin nhÃ¡ÂºÂ­n mÃƒÂ³n")}</b>
              </div>
              <span className="checkout-verify__badge">
                <Shield size={12} />
                {t("BÃ¡ÂºÂ¯t buÃ¡Â»â„¢c trÃ†Â°Ã¡Â»â€ºc khi Ã„â€˜Ã¡ÂºÂ·t")}
              </span>
            </div>

            <div className="checkout-verify__grid">
              <label
                className={`checkout-field${errors.name ? " has-error" : ""}`}
              >
                <span className="checkout-field__label">
                  <User size={13} /> {t("HÃ¡Â»Â tÃƒÂªn ngÃ†Â°Ã¡Â»Âi nhÃ¡ÂºÂ­n")}
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
                  placeholder={t("NguyÃ¡Â»â€¦n VÃ„Æ’n A")}
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
                  <Phone size={13} /> {t("SÃ¡Â»â€˜ Ã„â€˜iÃ¡Â»â€¡n thoÃ¡ÂºÂ¡i nhÃ¡ÂºÂ­n mÃƒÂ³n")}
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
                  <Clock size={13} /> {t("GiÃ¡Â»Â nhÃ¡ÂºÂ­n mÃƒÂ³n")}
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
                      ? t("-- Ã„Âang tÃ¡ÂºÂ£i khung giÃ¡Â»Â --")
                      : t("-- ChÃ¡Â»Ân khung giÃ¡Â»Â nhÃ¡ÂºÂ­n --")}
                  </option>
                  {timeSlots.map((slot) => {
                    const past = isSlotInPast(slot);
                    return (
                      <option key={slot} value={slot} disabled={past}>
                        {slot}
                        {past ? ` (${t("Ã„â€˜ÃƒÂ£ qua")})` : ""}
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
                  {t("Ghi chÃƒÂº cho bÃ¡ÂºÂ¿p (khÃƒÂ´ng bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c)")}
                </span>
                <textarea
                  className="checkout-field__input checkout-field__input--area"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t(
                    "VD: ÃƒÂ­t cay, khÃƒÂ´ng hÃƒÂ nh, gÃ¡Â»Âi trÃ†Â°Ã¡Â»â€ºc khi tÃ¡Â»â€ºi quÃ¡ÂºÂ§y..."
                  )}
                />
              </label>

              {/* SÃ¡Â»ÂNG XANH HÃ¡Â»Å’C Ã„ÂÃ†Â¯Ã¡Â»Å“NG */}
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
                    {t("TÃƒÂ´i mang bÃƒÂ¬nh nÃ†Â°Ã¡Â»â€ºc / hÃ¡Â»â„¢p cÃ†Â¡m riÃƒÂªng")}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    {t("SÃ¡Â»â€˜ng Xanh HÃ¡Â»Âc Ã„ÂÃ†Â°Ã¡Â»Âng Ã¢â‚¬â€ cÃ¡Â»â„¢ng")} {ptsCfg?.earn?.green_points || 10} {t("Ã„â€˜iÃ¡Â»Æ’m sau khi nhÃƒÂ¢n viÃƒÂªn duyÃ¡Â»â€¡t")}
                  </span>
                </span>
              </label>
            </div>

            <p className="checkout-verify__hint">
              <Info size={14} />
              {t(
                "ThÃƒÂ´ng tin nÃƒÂ y dÃƒÂ¹ng Ã„â€˜Ã¡Â»Æ’ liÃƒÂªn hÃ¡Â»â€¡ khi mÃƒÂ³n Ã„â€˜ÃƒÂ£ sÃ¡ÂºÂµn sÃƒÂ ng vÃƒÂ  Ã„â€˜Ã¡Â»Æ’ in phiÃ¡ÂºÂ¿u bÃ¡ÂºÂ¿p KDS."
              )}
            </p>
          </div>

          <div className="checkout-summary">
            <div className="checkout-summary__head">
              <div>
                <Utensils size={20} />
                <b>
                  {t("TÃƒÂ³m tÃ¡ÂºÂ¯t Ã„â€˜Ã†Â¡n hÃƒÂ ng")} ({lines.length} {t("mÃƒÂ³n")})
                </b>
              </div>

            </div>

            <div className="checkout-pickup-badge">
              <div>
                <Store size={18} />
                <b>{t("QuÃ¡ÂºÂ§y 01 (CÃ†Â¡m) & QuÃ¡ÂºÂ§y 03 (NÃ†Â°Ã¡Â»â€ºc)")}</b>
              </div>
              <span>
                {t("Ca TrÃ†Â°a")} Ã¢â‚¬Â¢ {t("Ã„â€šn tÃ¡ÂºÂ¡i quÃ¡ÂºÂ§y")}
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
                      <span>QuÃ¡ÂºÂ§y 01</span>
                      <span>Ã¢â‚¬Â¢</span>
                      <span>SL: {m.qty}</span>
                      {m.discount_percent > 0 && (
                        <span className="checkout-summary-item__tag">
                          {t("TrÃ¡Â»Â£ giÃƒÂ¡")}
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
                <strong style={{ color: "#173b8f" }}>Voucher giÃ¡ÂºÂ£m giÃƒÂ¡</strong>
              </div>

              {appliedVoucher ? (
                <div style={{
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0"
                }}>
                  <div style={{ color: "#047857", fontWeight: 700 }}>
                    Ã¢Å“â€œ Ã„ÂÃƒÂ£ ÃƒÂ¡p dÃ¡Â»Â¥ng mÃƒÂ£ {appliedVoucher.code}
                  </div>
                  <div style={{ color: "#047857", fontSize: "13px", marginTop: "5px" }}>
                    GiÃ¡ÂºÂ£m {money(discount)} cho Ã„â€˜Ã†Â¡n hÃƒÂ ng
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
                    BÃ¡Â»Â ÃƒÂ¡p dÃ¡Â»Â¥ng
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
                      placeholder="NhÃ¡ÂºÂ­p mÃƒÂ£ voucher"
                      aria-label="MÃƒÂ£ voucher"
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
                      {applyingVoucher ? "Ã„Âang kiÃ¡Â»Æ’m tra..." : "ÃƒÂp dÃ¡Â»Â¥ng"}
                    </button>
                  </div>

                  {myVouchers.filter((v) => !v.used).length > 0 && (
                    <div style={{ marginTop: "10px" }}>
                      <label style={{ display: "block", fontSize: "12px", color: "#475569", marginBottom: "5px" }}>
                        HoÃ¡ÂºÂ·c chÃ¡Â»Ân voucher Ã„â€˜ÃƒÂ£ lÃ†Â°u
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
                        <option value="">-- ChÃ¡Â»Ân voucher --</option>
                        {myVouchers.filter((v) => !v.used).map((v) => (
                          <option key={v.id || v.code} value={v.code}>
                            {v.code} Ã¢â‚¬â€ GiÃ¡ÂºÂ£m {money(Number(v.value) || 0)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {myVouchers.filter((v) => !v.used).length === 0 && (
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 0" }}>
                      BÃ¡ÂºÂ¡n chÃ†Â°a cÃƒÂ³ voucher Ã„â€˜ÃƒÂ£ lÃ†Â°u. HÃƒÂ£y nhÃ¡ÂºÂ­p mÃƒÂ£ voucher hÃ¡Â»Â£p lÃ¡Â»â€¡.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="checkout-summary__costs">
              <div className="checkout-cost-row">
                <span>{t("TÃ¡ÂºÂ¡m tÃƒÂ­nh:")}</span>
                <b>{money(subtotal)}</b>
              </div>

              {discount > 0 && (
                <div className="checkout-cost-row checkout-cost-row--discount">
                  <span>
                    <Tag size={14} />
                    {t("MÃƒÂ£ giÃ¡ÂºÂ£m giÃƒÂ¡")}
                    {appliedVoucher?.code && ` (${appliedVoucher.code})`}:
                  </span>
                  <b>-{money(discount)}</b>
                </div>
              )}

              {pointsDiscount > 0 && (
                <div className="checkout-cost-row checkout-cost-row--discount">
                  <span>
                    <Sparkles size={14} />
                    {t("Ã„ÂiÃ¡Â»Æ’m Green Points:")}
                  </span>
                  <b>-{money(pointsDiscount)}</b>
                </div>
              )}

              <div className="checkout-summary__total">
                <div>
                  <span>{t("TÃ¡Â»â€NG TIÃ¡Â»â‚¬N THANH TOÃƒÂN")}</span>
                  <small>
                    {t("Ã„ÂÃƒÂ£ bao gÃ¡Â»â€œm VAT & trÃ¡Â»Â£ giÃƒÂ¡ hÃ¡Â»Âc Ã„â€˜Ã†Â°Ã¡Â»Âng")}
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
                    ? t("VÃƒÂ­ sÃ¡ÂºÂ½ bÃ¡Â»â€¹ trÃ¡Â»Â« ngay khi bÃ¡ÂºÂ¡n xÃƒÂ¡c nhÃ¡ÂºÂ­n Ã„â€˜Ã†Â¡n hÃƒÂ ng.")
                    : t("Vui lÃƒÂ²ng hoÃƒÂ n tÃ¡ÂºÂ¥t chuyÃ¡Â»Æ’n khoÃ¡ÂºÂ£n, sau Ã„â€˜ÃƒÂ³ Ã¡ÂºÂ¥n xÃƒÂ¡c nhÃ¡ÂºÂ­n.")}
                </span>
              </div>
            )}

            <Link
              to={isBuyNow ? "/customer/menu" : "/customer/cart"}
              className="checkout-summary__back"
            >
              {isBuyNow ? t("Quay lÃ¡ÂºÂ¡i thÃ¡Â»Â±c Ã„â€˜Ã†Â¡n") : t("Quay lÃ¡ÂºÂ¡i giÃ¡Â»Â hÃƒÂ ng chÃ¡Â»â€°nh sÃ¡Â»Â­a")}
            </Link>
          </div>

          <div className="checkout-kds-note">
            <Microwave size={20} />
            <div>
              <b>{t("Quy trÃƒÂ¬nh chuyÃ¡Â»Æ’n bÃ¡ÂºÂ¿p KDS tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng:")}</b>
              <p>
                {t("Sau khi Ã¡ÂºÂ¥n hoÃƒÂ n tÃ¡ÂºÂ¥t thanh toÃƒÂ¡n, quÃ¡ÂºÂ§y bÃ¡ÂºÂ¿p 01 & quÃ¡ÂºÂ§y nÃ†Â°Ã¡Â»â€ºc 03 sÃ¡ÂºÂ½ lÃ¡ÂºÂ­p tÃ¡Â»Â©c nhÃ¡ÂºÂ­n vÃƒÂ© Ã„â€˜iÃ¡Â»â€¡n tÃ¡Â»Â­ Ã„â€˜Ã¡Â»Æ’ chuÃ¡ÂºÂ©n bÃ¡Â»â€¹ thÃ¡Â»Â©c Ã„Æ’n nÃƒÂ³ng sÃ¡Â»â€˜t kÃ¡Â»â€¹p thÃ¡Â»Âi cho bÃ¡ÂºÂ¡n.")}
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
