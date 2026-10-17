// ============================================================
// CUSTOMERCHECKOUT.JSX ââ‚¬” Thanh toÃƒ¡n (V5 - FINAL + i18n)
// ============================================================
// V5 (2026-10):
//   - ðÅ¸”§ FIX #28: EMPTY_ARRAY module-scoped constant, khÃƒ´ng re-create
//                 mỗi render â— ’ useCrossTabSync khÃƒ´ng bá»—¹ re-init
//   - Giữ nguyÃƒªn toÃƒ n bá»â„¢ logic khÃƒ¡c
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

// ðŸ§ FIX #28: Module-scoped frozen constant
const EMPTY_ARRAY = Object.freeze([]);

const MIN_REDEEM_POINTS = 100;
const REDEEM_PER_POINT = 100;
const REDEEM_MAX_AMOUNT = 2500;
const MIN_ORDER_POINTS_REDEEM = 10;
const COUNTDOWN_START = 585;

const SELECTED_CART_KEY = "canteen_cart_selected";
const CART_KEY = "canteen_cart";

const PAYMENT_METHODS = [
  { id: "wallet", label: "Vҭ VWA Pay",    icon: Wallet },
  { id: "qr",     label: "Mң VietQR",     icon: QrCode },
  { id: "card",   label: "Thẻ Sinh ViҪn", icon: CreditCard },
  { id: "cash",   label: "Tiền mặt",      icon: Banknote },
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

  // ðÅ¸”§ FIX #28: EMPTY_ARRAY lÃƒ  module-scoped frozen constant,
  // khÃƒ´ng phải re-create mỗi render
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
          t("Voucher khÃƒ´ng cÃƒ²n hợp lá»—¡ do thay Ä—˜á»—¢i Ä—˜ơn hÃƒ ng"),
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
        toast(t("Vui lҲng nhập mң voucher"), "error");
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
          `${t("Ã„ÂÃƒ£ Ãƒ¡p dụng voucher")}: -${money(res.value)}`,
          "success"
        );
      } catch (e) {
        if (myReqId !== voucherReqIdRef.current) return;
        toast(e.message || t("MÃƒ£ voucher khÃƒ´ng hợp lá»—¡"), "error");
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
        t("Bạn cần Ãƒ­t nhất {n} Ä—˜iểm Ä—˜á»ƒ Ä—˜á»—¢i").replace(
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
        `${t("Ã„ÂÃ¡Â»—¢i thÃƒ nh cÃƒ´ng voucher")} ${voucher.code} ââ‚¬” ${money(voucher.value)}`,
        "success"
      );

      await reloadVouchersAndPoints();
      await applyVoucher(voucher.code);
    } catch (e) {
      toast(e.message || t("KhÃƒ´ng Ä—˜á»—¢i Ä—˜ược voucher"), "error");
    } finally {
      setRedeemLoading(false);
    }
  };

  const validate = () => {
    const errs = {};

    if (!name.trim()) errs.name = t("Vui lҲng nhập họ tҪn");

    if (!phone.trim()) {
      errs.phone = t("Vui lÃƒ²ng nhập SÃ„ÂT");
    } else if (!/^[0-9]{10,11}$/.test(phone.trim())) {
      errs.phone = t("SÃ„ÂT phải 10-11 sỗ˜");
    }

    if (!pickupTime.trim()) {
      errs.pickupTime = t("Vui lҲng chọn giờ nhận");
    } else if (isSlotInPast(pickupTime)) {
      errs.pickupTime = t("Khung giờ nÃƒ y Ä—˜Ãƒ£ qua");
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
    if (pickupTime) noteParts.push(`${t("Nhận hҠng:")} ${pickupTime}`);
    return noteParts.join(" · ");
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
        t("Chá»—° cÃƒ³ thể sử dụng voucher hoặc Green Points cho má»â„¢t Ä—˜ơn hÃƒ ng."),
        "warning"
      );
      return null;
    }

    if (pointsToRedeem < MIN_ORDER_POINTS_REDEEM) {
      toast(
        t("Cần tỗ˜i thiểu 10 Ä—˜iểm vÃƒ  Ä—˜ơn hÃƒ ng từ 1.000 Ä—˜ Ä—˜á»ƒ sử dụng Green Points."),
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
        t("KhÃƒ´ng xÃƒ¡c minh Ä—˜ược voucher Ä—˜á»—¢i Ä—˜iểm. Vui lÃƒ²ng kiểm tra lại voucher trong tÃƒ i khoản.")
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
        toast(t("Giỏ hÃƒ ng trỗ˜ng"), "error");
        return;
      }
      if (!validate()) {
        toast(t("Kiểm tra lại thÃƒ´ng tin"), "error");
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
          `${t("Ã„ÂÃ¡ÂºÂ·t hÃƒ ng thÃƒ nh cÃƒ´ng!")} ${t("MÃƒ£ Ä—˜ơn")}: ${order.code}`,
          "success"
        );

        navigate("/customer/success", { state: { order } });
      } catch (e) {
        toast(e.message || t("KhÃƒ´ng Ä—˜ặt Ä—˜ược hÃƒ ng"), "error");
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
        toast(t("Giỏ hÃƒ ng trỗ˜ng"), "error");
        return;
      }
      if (!validate()) {
        toast(t("Kiểm tra lại thÃƒ´ng tin"), "error");
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
          `${t("Ã„ÂÃ¡ÂºÂ·t hÃƒ ng thÃƒ nh cÃƒ´ng!")} ${t("MÃƒ£ Ä—˜ơn")}: ${order.code}`,
          "success"
        );
        setPaymentOrder(null);

        navigate("/customer/success", { state: { order } });
      } catch (e) {
        toast(e.message || t("KhÃƒ´ng Ä—˜ặt Ä—˜ược hÃƒ ng"), "error");
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
      toast(t("Ã„ÂÃƒ£ sao chÃƒ©p"), "success");
    } catch {
      toast(t("KhÃƒ´ng sao chÃƒ©p Ä—˜ược"), "error");
    }
  };

  if (!lines.length) {
    return (
      <div className="checkout-v2-empty">
        <ShoppingBag size={60} />
        <h3>{t("Giỏ hÃƒ ng Ä—˜ang trỗ˜ng")}</h3>
        <Link to="/customer/menu" className="checkout-v2-empty__btn">
          <Utensils size={16} />
          {t("KhÃƒ¡m phÃƒ¡ thực Ä—˜ơn")}
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
      toast(t("Chưa cÃƒ³ mÃƒ£ QR Ä—˜á»ƒ tải xuỗ˜ng"), "error");
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
      toast(t("Ã„ÂÃƒ£ tải ảnh mÃƒ£ QR xuỗ˜ng mÃƒ¡y"), "success");
    } catch (error) {
      console.error("Download VietQR failed:", error);
      toast(
        t("KhÃƒ´ng tải Ä—˜ược ảnh QR tự Ä—˜á»â„¢ng. Vui lÃƒ²ng kiểm tra kết nỗ˜i vÃƒ  thử lại."),
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
              {t("Trang chủ")}
            </Link>
            <ChevronRight size={14} className="checkout-breadcrumb__sep" />
            <Link to="/customer/cart" className="checkout-breadcrumb__link">
              {t("Giỏ hҠng")}
            </Link>
            <ChevronRight size={14} className="checkout-breadcrumb__sep" />
            <span className="checkout-breadcrumb__current">
              {t("Thanh toÃƒ¡n Ä—˜ơn hÃƒ ng")}
            </span>
          </nav>

          <div className="checkout-timer">
            <Timer size={16} className="checkout-timer__icon" />
            <span>{t("Giữ suất & giÃƒ¡ ưu Ä—˜Ãƒ£i trong:")}</span>
            <b>{countdownStr}</b>
          </div>
        </div>

        <div className="checkout-stepper">
          <div className="checkout-stepper__item checkout-stepper__item--done">
            <div className="checkout-stepper__icon">
              <Check size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÆ¯á»Å¡C 1")}</span>
              <b>{t("Chọn mҳn")}</b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--done">
            <div className="checkout-stepper__icon">
              <Check size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÆ¯á»Å¡C 2")}</span>
              <b>{t("Giỏ & Tҹy chọn")}</b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--active">
            <div className="checkout-stepper__icon checkout-stepper__icon--active">
              <CreditCard size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label checkout-stepper__label--active">
                {t("BÆ¯á»Å¡C 3")}
              </span>
              <b className="checkout-stepper__label--active">
                {t("Thanh toҡn")}
              </b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--pending">
            <div className="checkout-stepper__icon">
              <Store size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BÆ¯á»Å¡C 4")}</span>
              <b>{t("Nhận tại quầy")}</b>
            </div>
          </div>
        </div>
      </section>

      <div className="checkout-grid">
        <div className="checkout-left">
          <div className="checkout-method-header">
            <div>
              <h1>{t("Phương thức thanh toÃƒ¡n")}</h1>
              <p>
                {t("Chọn 1 trong 4 hÃƒ¬nh thức thanh toÃƒ¡n thuận tiá»—¡n cho sinh viÃƒªn & giảng viÃƒªn")}
              </p>
            </div>
            <span className="checkout-method-header__badge">
              <Zap size={14} />
              {t("Xử lÃƒ½ tự Ä—˜á»â„¢ng 24/7")}
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
                    <h3>{t("VÃƒ­ Ã„Âiá»—¡n Tử Canteen VWA Pay")}</h3>
                    <span>{t("TÃƒ i khoản thanh toÃƒ¡n ná»â„¢i bá»â„¢ học viá»—¡n")}</span>
                  </div>
                </div>
                <span className="checkout-panel__tag checkout-panel__tag--blue">
                  {t("HoҠn")} {(ptsCfg?.earn?.rate_points || 1) / ((ptsCfg?.earn?.rate_amount || 10000) / 100)}% Green Points
                </span>
              </div>

              <div className="checkout-wallet-balance">
                <div>
                  <span className="checkout-wallet-balance__label">
                    {t("Sỗ˜ dư khả dụng trong vÃƒ­:")}
                  </span>
                  <div className="checkout-wallet-balance__value">
                    <b>{money(walletBalance).replace("Ä—˜", "")}</b>
                    <span>Ä—˜</span>
                    <span className="checkout-wallet-balance__badge">
                      {total <= walletBalance
                        ? t("Ã„ÂÃ¡Â»Â§ thanh toÃƒ¡n")
                        : t("KhÃƒ´ng Ä—˜ủ")}
                    </span>
                  </div>
                </div>
                <Link
                  to="/customer/wallet"
                  className="checkout-wallet-balance__btn"
                >
                  <Plus size={16} />
                  {t("Nạp thҪm tiền")}
                </Link>
              </div>

              <label className="checkout-points-option">
                <input
                  type="checkbox"
                  checked={usePoints}
                  onChange={(e) => {
                    if (e.target.checked && appliedVoucher) {
                      toast(t("Chá»—° cÃƒ³ thể sử dụng voucher hoặc Green Points cho má»â„¢t Ä—˜ơn hÃƒ ng."), "warning");
                      return;
                    }
                    setUsePoints(e.target.checked);
                  }}
                />
                <div className="checkout-points-option__body">
                  <div className="checkout-points-option__head">
                    <b>{t("Sử dụng Ä—˜iểm sinh viÃƒªn Green Points")}</b>
                    <span className="checkout-points-option__discount">
                      -{money(pointsDiscount)}
                    </span>
                  </div>
                  <p>
                    {t("Bạn Ä—˜ang cÃƒ³ {points} Ä—˜iểm tÃƒ­ch lũy. Quy Ä—˜á»—¢i tỗ˜i Ä—˜a 2.500 Ä—˜ cho suất ăn nÃƒ y.")
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
                {t("XÃƒ¡c nhận trừ vÃƒ­ & HoÃƒ n tất Ä—˜ơn")} ({money(total)})
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
                    <h3>{t("Quҩt mң VietQR / NgҢn hҠng")}</h3>
                    <span>
                      {t("Tương thÃƒ­ch vá»—ºi hơn 45+ App NgÃƒ¢n HÃƒ ng & Momo, VNPay")}
                    </span>
                  </div>
                </div>
                <span className="checkout-panel__live">
                  <span className="checkout-panel__live-dot" />
                  {t("Tự Ä—˜á»â„¢ng Ä—˜ỗ˜i soÃƒ¡t")}
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
                      {t("Lưu ảnh QR")}
                    </button>
                  </div>
                </div>

                <div className="checkout-qr-info">
                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("Ã„ÂÃ†Â N Vá»Å  THỤ HÆ¯á»Å¾NG")}</span>
                      <b>{bankAccountName}</b>
                      <small>
                        {t("NgҢn hҠng:")} {bankCode}
                      </small>
                    </div>
                  </div>

                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("SỐ TÀI KHOẢN")}</span>
                      <b className="mono">{bankAccount || "ââ‚¬”"}</b>
                    </div>
                    {bankAccount && (
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(bankAccount.replace(/\s/g, ""))
                        }
                      >
                        <Copy size={14} />
                        {t("Sao chҩp")}
                      </button>
                    )}
                  </div>

                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("Ná»ËœI DUNG CHUYỗšN KHOẢN")}</span>
                      <b className="mono blue">{transferContent}</b>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(transferContent)}
                    >
                      <Copy size={14} />
                      {t("Sao chҩp")}
                    </button>
                  </div>

                  <div className="checkout-qr-info__row checkout-qr-info__row--amount">
                    <div>
                      <span>{t("SỐ TIá»â‚¬N CHÃƒÂNH XÃƒÂC")}</span>
                      <b className="mono blue large">{money(total)}</b>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => copyToClipboard(String(total))}
                    >
                      <Copy size={14} />
                      {t("Sao chҩp")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="checkout-qr-sync">
                <div className="checkout-qr-sync__icon">
                  <RefreshCw size={18} className="checkout-spin" />
                </div>
                <div>
                  <b>{t("Ã„Âang chờ nhận tiền từ tÃƒ i khoản...")}</b>
                  <p>
                    {t("Há»—¡ thỗ˜ng sẽ tự Ä—˜á»â„¢ng xÃƒ¡c nhận Ä—˜ơn trong 2 - 5 giÃƒ¢y ngay sau khi giao dá»—¹ch thÃƒ nh cÃƒ´ng.")}
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
                {t("TÃƒ´i Ä—˜Ãƒ£ chuyển khoản / HoÃƒ n tất")}
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
                    <h3>{t("Thẻ Sinh ViҪn LiҪn Kết / Chạm POS")}</h3>
                    <span>
                      {t("Thẻ chip contactless BIDV / Agribank tҭch hợp thẻ sinh viҪn HVPNVN")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="checkout-card-info">
                <div className="checkout-card-info__icon">
                  <Wifi size={32} />
                </div>
                <div>
                  <b>{t("HÆ°á»—ºng dẫn thanh toÃƒ¡n tại quầy")}</b>
                  <p>
                    {t("Khi Ä—˜ến Quầy 01 (Cơm) Ä—˜á»ƒ nhận suất, bạn chá»—° cần Ä—˜ưa thẻ sinh viÃƒªn chạm nhẹ vÃƒ o Kiosk tự phục vụ hoặc mÃƒ¡y POS di Ä—˜á»â„¢ng của nhÃƒ¢n viÃƒªn Ä—˜á»ƒ hoÃƒ n tất trừ tiền trong tÃƒ­ch tắc.")}
                  </p>
                </div>
              </div>

              <div className="checkout-card-user">
                <div className="checkout-card-user__left">
                  <CreditCard size={18} />
                  <span>
                    {t("Thẻ SV:")} {user?.name || "Nguyễn Văn A"} (K21 - CNTT)
                  </span>
                </div>
                <span className="checkout-card-user__num">ââ‚¬¢ââ‚¬¢ââ‚¬¢ââ‚¬¢ 8098</span>
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
                    {t("Ã„Âang xử lÃƒ½...")}
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    {t("XÃƒ¡c nhận Ä—˜ặt suất & Chạm thẻ khi nhận mÃƒ³n")}
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
                    <h3>{t("Tiền Mặt Trực Tiếp Tại Quầy")}</h3>
                    <span>
                      {t("Thanh toÃƒ¡n cho nhÃƒ¢n viÃƒªn thu ngÃƒ¢n tại Quầy 01 khi lấy cơm")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="checkout-cash-info">
                <div className="checkout-cash-info__head">
                  <Info size={18} />
                  <b>{t("Lưu Ãƒ½ khi thanh toÃƒ¡n tiền mặt")}</b>
                </div>
                <p>
                  {t("Vui lÃƒ²ng chuẩn bá»—¹ sẵn Ä—˜Ãƒºng hoặc gần Ä—˜ủ sỗ˜ tiền")}{" "}
                  <b>{money(total)}</b>{" "}
                  {t("Ä—˜á»ƒ giÃƒºp quầy phục vụ trưa nhanh chÃƒ³ng, trÃƒ¡nh Ãƒ¹n tắc hÃƒ ng chờ trong giờ cao Ä—˜iểm của học viá»—¡n.")}
                </p>

                <div className="checkout-cash-info__denoms">
                  <span>{t("Má»—¡nh giÃƒ¡ tiền dự kiến Ä—˜ưa:")}</span>
                  <div className="checkout-cash-info__denoms-row">
                    <button type="button">
                      {t("Ã„ÂÃƒºng")} {money(total)}
                    </button>
                    <button type="button">
                      {t("Ã„ÂÃ†Â°a 50.000 Ä—˜ (Thỗ˜i 15k)")}
                    </button>
                    <button type="button">{t("Ã„ÂÃ†Â°a 100.000 Ä—˜")}</button>
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
                    {t("Ã„Âang xử lÃƒ½...")}
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    {t("XÃƒ¡c nhận Ä—˜ặt Ä—˜ơn & Trả tiền mặt tại quầy")}
                  </>
                )}
              </button>
            </div>
          )}

          <div className="checkout-security">
            <div className="checkout-security__left">
              <Shield size={26} />
              <div>
                <b>{t("Thanh toҡn bảo mật chuẩn SSL / PCI-DSS")}</b>
                <span>
                  {t("Cam kết hoÃƒ n tiền 100% tự Ä—˜á»â„¢ng nếu quầy tạm hết mÃƒ³n hoặc phÃƒ¡t sinh lỗi")}
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
                  <b>{user?.name || t("Sinh viҪn")}</b>
                  <span>K21 CNTT</span>
                </div>
                <div className="checkout-student__meta">
                  {t("MSSV:")} 2151010088 ââ‚¬¢ {t("Trợ giÃƒ¡ SV 2025")}
                </div>
              </div>
            </div>
            <BadgeCheck size={22} className="checkout-student__verified" />
          </div>

          <div className="checkout-verify">
            <div className="checkout-verify__head">
              <div className="checkout-verify__title">
                <BadgeCheck size={20} />
                <b>{t("Xҡc minh thҴng tin nhận mҳn")}</b>
              </div>
              <span className="checkout-verify__badge">
                <Shield size={12} />
                {t("Bắt buá»â„¢c trÆ°á»—ºc khi Ä—˜ặt")}
              </span>
            </div>

            <div className="checkout-verify__grid">
              <label
                className={`checkout-field${errors.name ? " has-error" : ""}`}
              >
                <span className="checkout-field__label">
                  <User size={13} /> {t("Họ tÃƒªn ngÃ†Â°Ã¡Â»Âi nhận")}
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
                  placeholder={t("Nguyễn Văn A")}
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
                  <Phone size={13} /> {t("Sỗ˜ Ä—˜iá»—¡n thoại nhận mÃƒ³n")}
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
                  <Clock size={13} /> {t("Giờ nhận mҳn")}
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
                      ? t("-- Ã„Âang tải khung giờ --")
                      : t("-- Chọn khung giờ nhận --")}
                  </option>
                  {timeSlots.map((slot) => {
                    const past = isSlotInPast(slot);
                    return (
                      <option key={slot} value={slot} disabled={past}>
                        {slot}
                        {past ? ` (${t("Ä—˜Ãƒ£ qua")})` : ""}
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
                  {t("Ghi chÃƒº cho bếp (khÃƒ´ng bắt buá»â„¢c)")}
                </span>
                <textarea
                  className="checkout-field__input checkout-field__input--area"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t(
                    "VD: Ãƒ­t cay, khÃƒ´ng hÃƒ nh, gọi trÆ°á»—ºc khi tá»—ºi quầy..."
                  )}
                />
              </label>

              {/* SỐNG XANH Há»Å’C Ã„ÂÃ†Â¯Ã¡Â»Å“NG */}
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
                    {t("TÃƒ´i mang bÃƒ¬nh nÆ°á»—ºc / há»â„¢p cơm riÃƒªng")}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    {t("Sỗ˜ng Xanh Học Ã„ÂÃ†Â°Ã¡Â»Âng ââ‚¬” cá»â„¢ng")} {ptsCfg?.earn?.green_points || 10} {t("Ä—˜iểm sau khi nhÃƒ¢n viÃƒªn duyá»—¡t")}
                  </span>
                </span>
              </label>
            </div>

            <p className="checkout-verify__hint">
              <Info size={14} />
              {t(
                "ThÃƒ´ng tin nÃƒ y dÃƒ¹ng Ä—˜á»ƒ liÃƒªn há»—¡ khi mÃƒ³n Ä—˜Ãƒ£ sẵn sÃƒ ng vÃƒ  Ä—˜á»ƒ in phiếu bếp KDS."
              )}
            </p>
          </div>

          <div className="checkout-summary">
            <div className="checkout-summary__head">
              <div>
                <Utensils size={20} />
                <b>
                  {t("TÃƒ³m tắt Ä—˜ơn hÃƒ ng")} ({lines.length} {t("mҳn")})
                </b>
              </div>

            </div>

            <div className="checkout-pickup-badge">
              <div>
                <Store size={18} />
                <b>{t("Quầy 01 (Cơm) & Quầy 03 (NÆ°á»—ºc)")}</b>
              </div>
              <span>
                {t("Ca Trưa")} ââ‚¬¢ {t("Ä—šn tại quầy")}
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
                      <span>Quầy 01</span>
                      <span>ââ‚¬¢</span>
                      <span>SL: {m.qty}</span>
                      {m.discount_percent > 0 && (
                        <span className="checkout-summary-item__tag">
                          {t("Trợ giҡ")}
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
                <strong style={{ color: "#173b8f" }}>Voucher giảm giҡ</strong>
              </div>

              {appliedVoucher ? (
                <div style={{
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0"
                }}>
                  <div style={{ color: "#047857", fontWeight: 700 }}>
                    âÅ““ Ã„ÂÃƒ£ Ãƒ¡p dụng mÃƒ£ {appliedVoucher.code}
                  </div>
                  <div style={{ color: "#047857", fontSize: "13px", marginTop: "5px" }}>
                    Giảm {money(discount)} cho Ä—˜ơn hÃƒ ng
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
                    Bỏ ҡp dụng
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
                      placeholder="Nhập mң voucher"
                      aria-label="Mң voucher"
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
                      {applyingVoucher ? "Ã„Âang kiểm tra..." : "Òp dụng"}
                    </button>
                  </div>

                  {myVouchers.filter((v) => !v.used).length > 0 && (
                    <div style={{ marginTop: "10px" }}>
                      <label style={{ display: "block", fontSize: "12px", color: "#475569", marginBottom: "5px" }}>
                        Hoặc chọn voucher Ä—˜Ãƒ£ lưu
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
                        <option value="">-- Chọn voucher --</option>
                        {myVouchers.filter((v) => !v.used).map((v) => (
                          <option key={v.id || v.code} value={v.code}>
                            {v.code} ââ‚¬” Giảm {money(Number(v.value) || 0)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {myVouchers.filter((v) => !v.used).length === 0 && (
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 0" }}>
                      Bạn chưa cÃƒ³ voucher Ä—˜Ãƒ£ lưu. HÃƒ£y nhập mÃƒ£ voucher hợp lá»—¡.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="checkout-summary__costs">
              <div className="checkout-cost-row">
                <span>{t("Tạm tҭnh:")}</span>
                <b>{money(subtotal)}</b>
              </div>

              {discount > 0 && (
                <div className="checkout-cost-row checkout-cost-row--discount">
                  <span>
                    <Tag size={14} />
                    {t("Mң giảm giҡ")}
                    {appliedVoucher?.code && ` (${appliedVoucher.code})`}:
                  </span>
                  <b>-{money(discount)}</b>
                </div>
              )}

              {pointsDiscount > 0 && (
                <div className="checkout-cost-row checkout-cost-row--discount">
                  <span>
                    <Sparkles size={14} />
                    {t("Ã„Âiểm Green Points:")}
                  </span>
                  <b>-{money(pointsDiscount)}</b>
                </div>
              )}

              <div className="checkout-summary__total">
                <div>
                  <span>{t("TỔNG TIá»â‚¬N THANH TOÃƒÂN")}</span>
                  <small>
                    {t("Ã„ÂÃƒ£ bao gồm VAT & trợ giÃƒ¡ học Ä—˜Ã†Â°Ã¡Â»Âng")}
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
                    ? t("VÃƒ­ sẽ bá»—¹ trừ ngay khi bạn xÃƒ¡c nhận Ä—˜ơn hÃƒ ng.")
                    : t("Vui lÃƒ²ng hoÃƒ n tất chuyển khoản, sau Ä—˜Ãƒ³ ấn xÃƒ¡c nhận.")}
                </span>
              </div>
            )}

            <Link
              to={isBuyNow ? "/customer/menu" : "/customer/cart"}
              className="checkout-summary__back"
            >
              {isBuyNow ? t("Quay lại thực Ä—˜ơn") : t("Quay lại giỏ hÃƒ ng chá»—°nh sửa")}
            </Link>
          </div>

          <div className="checkout-kds-note">
            <Microwave size={20} />
            <div>
              <b>{t("Quy trÃƒ¬nh chuyển bếp KDS tự Ä—˜á»â„¢ng:")}</b>
              <p>
                {t("Sau khi ấn hoÃƒ n tất thanh toÃƒ¡n, quầy bếp 01 & quầy nÆ°á»—ºc 03 sẽ lập tức nhận vÃƒ© Ä—˜iá»—¡n tử Ä—˜á»ƒ chuẩn bá»—¹ thức ăn nÃƒ³ng sỗ˜t ká»—¹p thời cho bạn.")}
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
