// ============================================================
// bannerSlides.js — Config banner (đa ngôn ngữ + fallback VI)
// ============================================================

export const DEFAULT_BANNER_OVERLAY =
  "linear-gradient(120deg, rgba(10,15,30,0.15) 0%, rgba(10,15,30,0.08) 55%, rgba(10,15,30,0) 100%)";

export const bannerSlides = [
  // SLIDE 1 — Đổi điểm nhận voucher
  {
    id: "voucher",
    titleKey: "banner.1.title",
    title: "Đổi điểm – Nhận Voucher",
    descKey: "banner.1.desc",
    description: "Tích điểm mỗi lần mua hàng và đổi lấy ưu đãi hấp dẫn.",
    badgeKey: "banner.1.badge",
    badge: "🏆 Tích điểm mỗi đơn",
    chips: [
      { icon: "gift", textKey: "banner.1.chip1", text: "1 điểm = 100đ" },
      { icon: "sparkles", textKey: "banner.1.chip2", text: "Đổi từ 100 điểm" },
    ],
    buttonTextKey: "banner.1.btn",
    buttonText: "Đổi voucher ngay",
    buttonLink: "/customer/promotions",
    image: "/banners/slide1.jpg",
    overlay: DEFAULT_BANNER_OVERLAY,
  },

  // SLIDE 2 — Món Signature (✅ FIX: dùng anchor thay vì route)
  {
    id: "signature",
    titleKey: "banner.2.title",
    title: "Món Signature",
    descKey: "banner.2.desc",
    description: "Khám phá những món ăn đặc trưng được yêu thích tại Canteen VWA.",
    badgeKey: "banner.2.badge",
    badge: "⭐ Đặc sản Canteen",
    chips: [
      { icon: "utensils", textKey: "banner.2.chip1", text: "Món chọn lọc" },
      { icon: "sparkles", textKey: "banner.2.chip2", text: "Yêu thích nhất" },
    ],
    buttonTextKey: "banner.2.btn",
    buttonText: "Xem món Signature",
    buttonLink: "#signature-section", // ✅ FIX: scroll xuống
    image: "/banners/slide2.jpg",
    overlay: DEFAULT_BANNER_OVERLAY,
  },

  // SLIDE 3 — Ưu đãi hôm nay
  {
    id: "promotion",
    titleKey: "banner.3.title",
    title: "Ưu đãi hôm nay",
    descKey: "banner.3.desc",
    description: "Những món ngon đang có ưu đãi đặc biệt – đừng bỏ lỡ!",
    badgeKey: "banner.3.badge",
    badge: "🔥 Combo tiết kiệm",
    chips: [
      { icon: "sparkles", textKey: "banner.3.chip1", text: "Giảm đến 20%" },
      { icon: "utensils", textKey: "banner.3.chip2", text: "Nhiều combo mỗi ngày" },
    ],
    buttonTextKey: "banner.3.btn",
    buttonText: "Xem ưu đãi",
    buttonLink: "/customer/promotions",
    image: "/banners/slide3.jpg",
    overlay: DEFAULT_BANNER_OVERLAY,
  },
];