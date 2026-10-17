// ============================================================
// CUSTOMERCHECKOUT.JSX — Thanh toán (V5 - FINAL + i18n)
// ============================================================
// V5 (2026-10):
//   - 🔧 FIX #28: EMPTY_ARRAY module-scoped constant, không re-create
//                 mỗi render ◠’ useCrossTabSync không bỗ¹ re-init
//   - Giữ nguyên toàn bộ logic khác
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

  // 🔧 FIX #28: EMPTY_ARRAY là module-scoped frozen constant,
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
          t("Voucher không còn hợp lỗ¡ do thay ė˜ỗ¢i ė˜ơn hàng"),
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
        toast(t("Vui lòng nhập mã voucher"), "error");
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
          `${t("Đã áp dụng voucher")}: -${money(res.value)}`,
          "success"
        );
      } catch (e) {
        if (myReqId !== voucherReqIdRef.current) return;
        toast(e.message || t("Mã voucher không hợp lỗ¡"), "error");
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
        t("Bạn cần ít nhất {n} ė˜iểm ė˜ể ė˜ỗ¢i").replace(
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
        `${t("Đỗ¢i thành công voucher")} ${voucher.code} — ${money(voucher.value)}`,
        "success"
      );

      await reloadVouchersAndPoints();
      await applyVoucher(voucher.code);
    } catch (e) {
      toast(e.message || t("Không ė˜ỗ¢i ė˜ược voucher"), "error");
    } finally {
      setRedeemLoading(false);
    }
  };

  const validate = () => {
    const errs = {};

    if (!name.trim()) errs.name = t("Vui lòng nhập họ tên");

    if (!phone.trim()) {
      errs.phone = t("Vui lòng nhập SĐT");
    } else if (!/^[0-9]{10,11}$/.test(phone.trim())) {
      errs.phone = t("SĐT phải 10-11 sỗ˜");
    }

    if (!pickupTime.trim()) {
      errs.pickupTime = t("Vui lòng chọn giờ nhận");
    } else if (isSlotInPast(pickupTime)) {
      errs.pickupTime = t("Khung giờ này ė˜ã qua");
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
    if (pickupTime) noteParts.push(`${t("Nhận hàng:")} ${pickupTime}`);
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
        t("Chỗ° có thể sử dụng voucher hoặc Green Points cho một ė˜ơn hàng."),
        "warning"
      );
      return null;
    }

    if (pointsToRedeem < MIN_ORDER_POINTS_REDEEM) {
      toast(
        t("Cần tỗ˜i thiểu 10 ė˜iểm và ė˜ơn hàng từ 1.000 ė˜ ė˜ể sử dụng Green Points."),
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
        t("Không xác minh ė˜ược voucher ė˜ỗ¢i ė˜iểm. Vui lòng kiểm tra lại voucher trong tài khoản.")
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
        toast(t("Giỏ hàng trỗ˜ng"), "error");
        return;
      }
      if (!validate()) {
        toast(t("Kiểm tra lại thông tin"), "error");
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
          `${t("Đặt hàng thành công!")} ${t("Mã ė˜ơn")}: ${order.code}`,
          "success"
        );

        navigate("/customer/success", { state: { order } });
      } catch (e) {
        toast(e.message || t("Không ė˜ặt ė˜ược hàng"), "error");
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
        toast(t("Giỏ hàng trỗ˜ng"), "error");
        return;
      }
      if (!validate()) {
        toast(t("Kiểm tra lại thông tin"), "error");
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
          `${t("Đặt hàng thành công!")} ${t("Mã ė˜ơn")}: ${order.code}`,
          "success"
        );
        setPaymentOrder(null);

        navigate("/customer/success", { state: { order } });
      } catch (e) {
        toast(e.message || t("Không ė˜ặt ė˜ược hàng"), "error");
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
      toast(t("Đã sao chép"), "success");
    } catch {
      toast(t("Không sao chép ė˜ược"), "error");
    }
  };

  if (!lines.length) {
    return (
      <div className="checkout-v2-empty">
        <ShoppingBag size={60} />
        <h3>{t("Giỏ hàng ė˜ang trỗ˜ng")}</h3>
        <Link to="/customer/menu" className="checkout-v2-empty__btn">
          <Utensils size={16} />
          {t("Khám phá thực ė˜ơn")}
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
      toast(t("Chưa có mã QR ė˜ể tải xuỗ˜ng"), "error");
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
      toast(t("Đã tải ảnh mã QR xuỗ˜ng máy"), "success");
    } catch (error) {
      console.error("Download VietQR failed:", error);
      toast(
        t("Không tải ė˜ược ảnh QR tự ė˜ộng. Vui lòng kiểm tra kết nỗ˜i và thử lại."),
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
              {t("Giỏ hàng")}
            </Link>
            <ChevronRight size={14} className="checkout-breadcrumb__sep" />
            <span className="checkout-breadcrumb__current">
              {t("Thanh toán ė˜ơn hàng")}
            </span>
          </nav>

          <div className="checkout-timer">
            <Timer size={16} className="checkout-timer__icon" />
            <span>{t("Giữ suất & giá ưu ė˜ãi trong:")}</span>
            <b>{countdownStr}</b>
          </div>
        </div>

        <div className="checkout-stepper">
          <div className="checkout-stepper__item checkout-stepper__item--done">
            <div className="checkout-stepper__icon">
              <Check size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BƯỚC 1")}</span>
              <b>{t("Chọn món")}</b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--done">
            <div className="checkout-stepper__icon">
              <Check size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BƯỚC 2")}</span>
              <b>{t("Giỏ & Tùy chọn")}</b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--active">
            <div className="checkout-stepper__icon checkout-stepper__icon--active">
              <CreditCard size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label checkout-stepper__label--active">
                {t("BƯỚC 3")}
              </span>
              <b className="checkout-stepper__label--active">
                {t("Thanh toán")}
              </b>
            </div>
          </div>

          <div className="checkout-stepper__item checkout-stepper__item--pending">
            <div className="checkout-stepper__icon">
              <Store size={16} />
            </div>
            <div>
              <span className="checkout-stepper__label">{t("BƯỚC 4")}</span>
              <b>{t("Nhận tại quầy")}</b>
            </div>
          </div>
        </div>
      </section>

      <div className="checkout-grid">
        <div className="checkout-left">
          <div className="checkout-method-header">
            <div>
              <h1>{t("Phương thức thanh toán")}</h1>
              <p>
                {t("Chọn 1 trong 4 hình thức thanh toán thuận tiỗ¡n cho sinh viên & giảng viên")}
              </p>
            </div>
            <span className="checkout-method-header__badge">
              <Zap size={14} />
              {t("Xử lý tự ė˜ộng 24/7")}
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
                    <h3>{t("Ví Điỗ¡n Tử Canteen VWA Pay")}</h3>
                    <span>{t("Tài khoản thanh toán nội bộ học viỗ¡n")}</span>
                  </div>
                </div>
                <span className="checkout-panel__tag checkout-panel__tag--blue">
                  {t("HoҠn")} {(ptsCfg?.earn?.rate_points || 1) / ((ptsCfg?.earn?.rate_amount || 10000) / 100)}% Green Points
                </span>
              </div>

              <div className="checkout-wallet-balance">
                <div>
                  <span className="checkout-wallet-balance__label">
                    {t("Sỗ˜ dư khả dụng trong ví:")}
                  </span>
                  <div className="checkout-wallet-balance__value">
                    <b>{money(walletBalance).replace("Ä—˜", "")}</b>
                    <span>Ä—˜</span>
                    <span className="checkout-wallet-balance__badge">
                      {total <= walletBalance
                        ? t("Đủ thanh toán")
                        : t("Không ė˜ủ")}
                    </span>
                  </div>
                </div>
                <Link
                  to="/customer/wallet"
                  className="checkout-wallet-balance__btn"
                >
                  <Plus size={16} />
                  {t("Nạp thêm tiền")}
                </Link>
              </div>

              <label className="checkout-points-option">
                <input
                  type="checkbox"
                  checked={usePoints}
                  onChange={(e) => {
                    if (e.target.checked && appliedVoucher) {
                      toast(t("Chỗ° có thể sử dụng voucher hoặc Green Points cho một ė˜ơn hàng."), "warning");
                      return;
                    }
                    setUsePoints(e.target.checked);
                  }}
                />
                <div className="checkout-points-option__body">
                  <div className="checkout-points-option__head">
                    <b>{t("Sử dụng ė˜iểm sinh viên Green Points")}</b>
                    <span className="checkout-points-option__discount">
                      -{money(pointsDiscount)}
                    </span>
                  </div>
                  <p>
                    {t("Bạn ė˜ang có {points} ė˜iểm tích lũy. Quy ė˜ỗ¢i tỗ˜i ė˜a 2.500 ė˜ cho suất ăn này.")
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
                {t("Xác nhận trừ ví & Hoàn tất ė˜ơn")} ({money(total)})
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
                    <h3>{t("Quét mã VietQR / Ngân hàng")}</h3>
                    <span>
                      {t("Tương thích vỗºi hơn 45+ App Ngân Hàng & Momo, VNPay")}
                    </span>
                  </div>
                </div>
                <span className="checkout-panel__live">
                  <span className="checkout-panel__live-dot" />
                  {t("Tự ė˜ộng ė˜ỗ˜i soát")}
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
                      <span>{t("ĐƠN VỊ THỤ HƯỞNG")}</span>
                      <b>{bankAccountName}</b>
                      <small>
                        {t("Ngân hàng:")} {bankCode}
                      </small>
                    </div>
                  </div>

                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("SỐ TÀI KHOẢN")}</span>
                      <b className="mono">{bankAccount || "—"}</b>
                    </div>
                    {bankAccount && (
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(bankAccount.replace(/\s/g, ""))
                        }
                      >
                        <Copy size={14} />
                        {t("Sao chép")}
                      </button>
                    )}
                  </div>

                  <div className="checkout-qr-info__row">
                    <div>
                      <span>{t("NỘI DUNG CHUYỗšN KHOẢN")}</span>
                      <b className="mono blue">{transferContent}</b>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(transferContent)}
                    >
                      <Copy size={14} />
                      {t("Sao chép")}
                    </button>
                  </div>

                  <div className="checkout-qr-info__row checkout-qr-info__row--amount">
                    <div>
                      <span>{t("SỐ TIỀN CHÍNH XÁC")}</span>
                      <b className="mono blue large">{money(total)}</b>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => copyToClipboard(String(total))}
                    >
                      <Copy size={14} />
                      {t("Sao chép")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="checkout-qr-sync">
                <div className="checkout-qr-sync__icon">
                  <RefreshCw size={18} className="checkout-spin" />
                </div>
                <div>
                  <b>{t("Đang chờ nhận tiền từ tài khoản...")}</b>
                  <p>
                    {t("Hỗ¡ thỗ˜ng sẽ tự ė˜ộng xác nhận ė˜ơn trong 2 - 5 giây ngay sau khi giao dỗ¹ch thành công.")}
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
                {t("Tôi ė˜ã chuyển khoản / Hoàn tất")}
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
                    <h3>{t("Thẻ Sinh Viên Liên Kết / Chạm POS")}</h3>
                    <span>
                      {t("Thẻ chip contactless BIDV / Agribank tích hợp thẻ sinh viên HVPNVN")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="checkout-card-info">
                <div className="checkout-card-info__icon">
                  <Wifi size={32} />
                </div>
                <div>
                  <b>{t("Hưỗºng dẫn thanh toán tại quầy")}</b>
                  <p>
                    {t("Khi ė˜ến Quầy 01 (Cơm) ė˜ể nhận suất, bạn chỗ° cần ė˜ưa thẻ sinh viên chạm nhẹ vào Kiosk tự phục vụ hoặc máy POS di ė˜ộng của nhân viên ė˜ể hoàn tất trừ tiền trong tích tắc.")}
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
                    {t("Đang xử lý...")}
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    {t("Xác nhận ė˜ặt suất & Chạm thẻ khi nhận món")}
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
                      {t("Thanh toán cho nhân viên thu ngân tại Quầy 01 khi lấy cơm")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="checkout-cash-info">
                <div className="checkout-cash-info__head">
                  <Info size={18} />
                  <b>{t("Lưu ý khi thanh toán tiền mặt")}</b>
                </div>
                <p>
                  {t("Vui lòng chuẩn bỗ¹ sẵn ė˜úng hoặc gần ė˜ủ sỗ˜ tiền")}{" "}
                  <b>{money(total)}</b>{" "}
                  {t("ė˜ể giúp quầy phục vụ trưa nhanh chóng, tránh ùn tắc hàng chờ trong giờ cao ė˜iểm của học viỗ¡n.")}
                </p>

                <div className="checkout-cash-info__denoms">
                  <span>{t("Mỗ¡nh giá tiền dự kiến ė˜ưa:")}</span>
                  <div className="checkout-cash-info__denoms-row">
                    <button type="button">
                      {t("Đúng")} {money(total)}
                    </button>
                    <button type="button">
                      {t("Đưa 50.000 ė˜ (Thỗ˜i 15k)")}
                    </button>
                    <button type="button">{t("Đưa 100.000 ė˜")}</button>
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
                    {t("Đang xử lý...")}
                  </>
                ) : (
                  <>
                    <Check size={20} />
                    {t("Xác nhận ė˜ặt ė˜ơn & Trả tiền mặt tại quầy")}
                  </>
                )}
              </button>
            </div>
          )}

          <div className="checkout-security">
            <div className="checkout-security__left">
              <Shield size={26} />
              <div>
                <b>{t("Thanh toán bảo mật chuẩn SSL / PCI-DSS")}</b>
                <span>
                  {t("Cam kết hoàn tiền 100% tự ė˜ộng nếu quầy tạm hết món hoặc phát sinh lỗi")}
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
                  <b>{user?.name || t("Sinh viên")}</b>
                  <span>K21 CNTT</span>
                </div>
                <div className="checkout-student__meta">
                  {t("MSSV:")} 2151010088 ââ‚¬¢ {t("Trợ giá SV 2025")}
                </div>
              </div>
            </div>
            <BadgeCheck size={22} className="checkout-student__verified" />
          </div>

          <div className="checkout-verify">
            <div className="checkout-verify__head">
              <div className="checkout-verify__title">
                <BadgeCheck size={20} />
                <b>{t("Xác minh thông tin nhận món")}</b>
              </div>
              <span className="checkout-verify__badge">
                <Shield size={12} />
                {t("Bắt buộc trưỗºc khi ė˜ặt")}
              </span>
            </div>

            <div className="checkout-verify__grid">
              <label
                className={`checkout-field${errors.name ? " has-error" : ""}`}
              >
                <span className="checkout-field__label">
                  <User size={13} /> {t("Họ tên người nhận")}
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
                  <Phone size={13} /> {t("Sỗ˜ ė˜iỗ¡n thoại nhận món")}
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
                  <Clock size={13} /> {t("Giờ nhận món")}
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
                      ? t("-- Đang tải khung giờ --")
                      : t("-- Chọn khung giờ nhận --")}
                  </option>
                  {timeSlots.map((slot) => {
                    const past = isSlotInPast(slot);
                    return (
                      <option key={slot} value={slot} disabled={past}>
                        {slot}
                        {past ? ` (${t("ė˜ã qua")})` : ""}
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
                  {t("Ghi chú cho bếp (không bắt buộc)")}
                </span>
                <textarea
                  className="checkout-field__input checkout-field__input--area"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("VD: ít cay, không hành, gọi trưỗºc khi tỗºi quầy..."
                  )}
                />
              </label>

              {/* SỐNG XANH HỌC ĐƯỜNG */}
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
                    {t("Tôi mang bình nưỗºc / hộp cơm riêng")}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    {t("Sỗ˜ng Xanh Học Đường — cộng")} {ptsCfg?.earn?.green_points || 10} {t("ė˜iểm sau khi nhân viên duyỗ¡t")}
                  </span>
                </span>
              </label>
            </div>

            <p className="checkout-verify__hint">
              <Info size={14} />
              {t("Thông tin này dùng ė˜ể liên hỗ¡ khi món ė˜ã sẵn sàng và ė˜ể in phiếu bếp KDS."
              )}
            </p>
          </div>

          <div className="checkout-summary">
            <div className="checkout-summary__head">
              <div>
                <Utensils size={20} />
                <b>
                  {t("Tóm tắt ė˜ơn hàng")} ({lines.length} {t("mҳn")})
                </b>
              </div>

            </div>

            <div className="checkout-pickup-badge">
              <div>
                <Store size={18} />
                <b>{t("Quầy 01 (Cơm) & Quầy 03 (Nước)")}</b>
              </div>
              <span>
                {t("Ca Trưa")} ââ‚¬¢ {t("Nhận tại quầy")}
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
                          {t("Trợ giá")}
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
                <strong style={{ color: "#173b8f" }}>Voucher giảm giá</strong>
              </div>

              {appliedVoucher ? (
                <div style={{
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0"
                }}>
                  <div style={{ color: "#047857", fontWeight: 700 }}>
                    ✓ Đã áp dụng mã {appliedVoucher.code}
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
                    Bỏ áp dụng
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
                      {applyingVoucher ? "Đang kiểm tra..." : "ҁp dụng"}
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
                            {v.code} — Giảm {money(Number(v.value) || 0)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {myVouchers.filter((v) => !v.used).length === 0 && (
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 0" }}>
                      Bạn chưa có voucher ė˜ã lưu. Hãy nhập mã voucher hợp lỗ¡.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="checkout-summary__costs">
              <div className="checkout-cost-row">
                <span>{t("Tạm tính:")}</span>
                <b>{money(subtotal)}</b>
              </div>

              {discount > 0 && (
                <div className="checkout-cost-row checkout-cost-row--discount">
                  <span>
                    <Tag size={14} />
                    {t("Mã giảm giá")}
                    {appliedVoucher?.code && ` (${appliedVoucher.code})`}:
                  </span>
                  <b>-{money(discount)}</b>
                </div>
              )}

              {pointsDiscount > 0 && (
                <div className="checkout-cost-row checkout-cost-row--discount">
                  <span>
                    <Sparkles size={14} />
                    {t("Điểm Green Points:")}
                  </span>
                  <b>-{money(pointsDiscount)}</b>
                </div>
              )}

              <div className="checkout-summary__total">
                <div>
                  <span>{t("TỔNG TIỀN THANH TOÁN")}</span>
                  <small>
                    {t("Đã bao gồm VAT & trợ giá học ė˜ường")}
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
                    ? t("Ví sẽ bỗ¹ trừ ngay khi bạn xác nhận ė˜ơn hàng.")
                    : t("Vui lòng hoàn tất chuyển khoản, sau ė˜ó ấn xác nhận.")}
                </span>
              </div>
            )}

            <Link
              to={isBuyNow ? "/customer/menu" : "/customer/cart"}
              className="checkout-summary__back"
            >
              {isBuyNow ? t("Quay lại thực ė˜ơn") : t("Quay lại giỏ hàng chỗ°nh sửa")}
            </Link>
          </div>

          <div className="checkout-kds-note">
            <Microwave size={20} />
            <div>
              <b>{t("Quy trình chuyển bếp KDS tự ė˜ộng:")}</b>
              <p>
                {t("Sau khi ấn hoàn tất thanh toán, quầy bếp 01 & quầy nưỗºc 03 sẽ lập tức nhận vé ė˜iỗ¡n tử ė˜ể chuẩn bỗ¹ thức ăn nóng sỗ˜t kỗ¹p thời cho bạn.")}
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
