// ============================================================
// CHATBOT.JS — Logic keyword matching gợi ý món ăn
// ============================================================
// Nhận thêm tham số `t` (i18n) để dịch text trả về.
// Nếu không truyền `t` → fallback dùng tiếng Việt (backward compat).
// ============================================================

const DEFAULT_SETTINGS = {
  hotline: "0328 866 959",
  address: "68 Nguyễn Chí Thanh, Phường Láng, Hà Nội",
  openHours: "6:30 — 18:30 hàng ngày",
};

// Fallback tiếng Việt (khi không truyền t)
const FALLBACK_TEXT = {
  greeting:
    "Xin chào! 👋 Mình là trợ lý Canteen VWA.\n" +
    "Bạn có thể hỏi mình:\n" +
    '• "dưới 30k" — món rẻ\n' +
    '• "chay" — món chay\n' +
    '• "nước" — đồ uống\n' +
    '• "cay" — món cay\n' +
    '• "bán chạy" — top món hot\n' +
    '• "cơm" — các món cơm\n' +
    '• "gợi ý" — món ngẫu nhiên',
  openHours: `🕐 Canteen VWA mở cửa ${DEFAULT_SETTINGS.openHours}.`,
  address: `📍 Canteen VWA ở ${DEFAULT_SETTINGS.address}.`,
  hotline: `☎️ Hotline Canteen VWA: ${DEFAULT_SETTINGS.hotline}. Gọi khi cần hỗ trợ nhé!`,
  order:
    "🛒 Để đặt món:\n" +
    '1. Vào "Thực đơn" chọn món\n' +
    "2. Thêm vào giỏ\n" +
    '3. Vào giỏ → "Đặt hàng"\n' +
    "Thanh toán: Tiền mặt · VietQR · Ví Canteen.",
  voucher:
    "🎁 Bạn có thể:\n" +
    '• Xem điểm tích lũy ở trang "Khuyến mãi"\n' +
    "• Đổi 100 điểm → voucher 10.000đ\n" +
    "• Nhận voucher toàn hệ thống",
  bestSeller: "🔥 Top 3 món bán chạy nhất tại Canteen:",
  bestSellerEmpty: "Hiện chưa có dữ liệu bán chạy. Bạn xem thực đơn nhé!",
  vegetarian: "🥗 Món chay ngon tại Canteen:",
  vegetarianEmpty: "Hiện chưa có món chay trong thực đơn. Bạn xem món khác nhé!",
  drinks: "🥤 Đồ uống tại Canteen:",
  drinksEmpty: "Hiện chưa có đồ uống trong thực đơn.",
  spicy: "🌶️ Món cay bạn có thể thử:",
  spicyFallback: "Các món đậm vị tại Canteen:",
  spicyEmpty: "Hiện chưa có món cay. Bạn xem thực đơn nhé!",
  rice: "🍚 Món cơm tại Canteen:",
  riceEmpty: "Hiện chưa có món cơm trong thực đơn.",
  budget: '💰 Món dưới {price}đ cho bạn đây:',
  budgetEmpty: "Không có món nào dưới {price}đ. Bạn thử ngân sách khác nhé!",
  random: "🎲 Mình gợi ý bạn thử món này nhé:",
  randomEmpty: "Hiện chưa có thực đơn. Bạn xem sau nhé!",
  fallback:
    "Mình chưa hiểu câu hỏi này. 🤔\n" +
    'Bạn thử hỏi: "dưới 30k", "chay", "nước", "cay", "bán chạy", "cơm", "gợi ý".',
};

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function parsePrice(text) {
  const t = normalize(text);

  const shortK = t.match(/(\d+)k(\d+)/);
  if (shortK) {
    const thousands = parseInt(shortK[1], 10);
    const rest = parseInt(shortK[2].padEnd(3, "0").slice(0, 3), 10);
    return thousands * 1000 + rest;
  }

  const kMatch = t.match(/(\d+)\s*(k|nghin|ngan|ngàn|nghìn)/);
  if (kMatch) return parseInt(kMatch[1], 10) * 1000;

  const dMatch = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(d|đ)?/);
  if (dMatch) return parseInt(dMatch[1].replace(/[.,]/g, ""), 10);

  return null;
}

function pickWithFallback(list, prefix, emptyMsg, limit = 3) {
  const picked = list.slice(0, limit);
  if (!picked.length) return { text: emptyMsg, items: [] };
  return { text: prefix, items: picked };
}

export function getBotReply(userText, menuItems = [], settings = null, t = null) {
  const raw = (userText || "").trim();
  if (!raw) return null;

  const tt = normalize(raw);
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const menu = Array.isArray(menuItems) ? menuItems : [];

  // Helper: dùng t() nếu có, fallback FALLBACK_TEXT
  const T = (key, vars) => {
    if (t) {
      const params = vars || {};
      let out = t(key);
      for (const k of Object.keys(params)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, "g"), params[k]);
      }
      return out;
    }
    let out = FALLBACK_TEXT[key] || key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]);
      }
    }
    return out;
  };

  // ============================================================
  // INTENT: Chào hỏi
  // ============================================================
  if (/^(chao|hi|hello|hey|xin chao)\s*[!,.]?/.test(tt)) {
    return { text: T("Xin chào! 👋 Mình là trợ lý Canteen VWA.\nBạn có thể hỏi mình:\n• \"dưới 30k\" — món rẻ\n• \"chay\" — món chay\n• \"nước\" — đồ uống\n• \"cay\" — món cay\n• \"bán chạy\" — top món hot\n• \"cơm\" — các món cơm\n• \"gợi ý\" — món ngẫu nhiên"), items: [] };
  }

  // ============================================================
  // INTENT: Giờ mở cửa
  // ============================================================
  if (/\b(gio mo|mo cua|dong cua|may gio mo)\b/.test(tt)) {
    return {
      text: T("🕐 Canteen VWA mở cửa {hours}.").replace("{hours}", cfg.openHours),
      items: [],
    };
  }

  // ============================================================
  // INTENT: Địa chỉ
  // ============================================================
  if (/\b(dia chi|o dau|duong nao|dia diem)\b/.test(tt)) {
    return {
      text: T("📍 Canteen VWA ở {address}.").replace("{address}", cfg.address),
      items: [],
    };
  }

  // ============================================================
  // INTENT: Hotline
  // ============================================================
  if (/\b(hotline|so dien thoai|sdt|lien he)\b/.test(tt)) {
    return {
      text: T("☎️ Hotline Canteen VWA: {hotline}. Gọi khi cần hỗ trợ nhé!").replace("{hotline}", cfg.hotline),
      items: [],
    };
  }

  // ============================================================
  // INTENT: Đặt món / thanh toán
  // ============================================================
  if (/\b(dat mon|dat hang|order|thanh toan|tra tien)\b/.test(tt)) {
    return {
      text: T("🛒 Để đặt món:\n1. Vào \"Thực đơn\" chọn món\n2. Thêm vào giỏ\n3. Vào giỏ → \"Đặt hàng\"\nThanh toán: Tiền mặt · VietQR · Ví Canteen."),
      items: []
    };
  }

  // ============================================================
  // INTENT: Đổi điểm / voucher
  // ============================================================
  if (/\b(doi diem|voucher|khuyen mai|giam gia|uu dai)\b/.test(tt)) {
    return {
      text: T("🎁 Bạn có thể:\n• Xem điểm tích lũy ở trang \"Khuyến mãi\"\n• Đổi 100 điểm → voucher 10.000đ\n• Nhận voucher toàn hệ thống"),
      items: []
    };
  }

  // ============================================================
  // INTENT: Top bán chạy
  // ============================================================
  if (/\b(ban chay|ngon nhat|hot|pho bien|best)\b/.test(tt)) {
    const top = [...menu]
      .sort((a, b) => (b.sold || 0) - (a.sold || 0))
      .slice(0, 3);
    return pickWithFallback(
      top,
      T("🔥 Top 3 món bán chạy nhất tại Canteen:"),
      T("Hiện chưa có dữ liệu bán chạy. Bạn xem thực đơn nhé!")
    );
  }

  // ============================================================
  // INTENT: Món chay
  // ============================================================
  if (/\b(chay|khong thit|ko thit|an chay)\b/.test(tt)) {
    const chay = menu.filter((m) => m.category === "Món chay");
    return pickWithFallback(
      chay,
      T("🥗 Món chay ngon tại Canteen:"),
      T("Hiện chưa có món chay trong thực đơn. Bạn xem món khác nhé!")
    );
  }

  // ============================================================
  // INTENT: Đồ uống
  // ============================================================
  if (/\b(nuoc|uong|tra|ca phe|sinh to|nuoc ep|tra sua)\b/.test(tt)) {
    const drinks = menu.filter((m) => m.category === "Đồ uống");
    return pickWithFallback(
      drinks,
      T("🥤 Đồ uống tại Canteen:"),
      T("Hiện chưa có đồ uống trong thực đơn.")
    );
  }

  // ============================================================
  // INTENT: Món cay
  // ============================================================
  if (/\b(cay|spicy)\b/.test(tt) && !/\bchay\b/.test(tt)) {
    const cay = menu.filter((m) => {
      const n = normalize(m.name || "");
      return /\b(bun bo|hue|sa te|spicy|cay)\b/.test(n);
    });
    if (cay.length) {
      return {
        text: T("🌶️ Món cay bạn có thể thử:"),
        items: cay.slice(0, 3),
      };
    }

    const man = menu.filter((m) => m.category === "Món mặn");
    return pickWithFallback(
      man,
      T("Các món đậm vị tại Canteen:"),
      T("Hiện chưa có món cay. Bạn xem thực đơn nhé!")
    );
  }

  // ============================================================
  // INTENT: Món cơm
  // ============================================================
  if (/\b(com|com rang|com ga|com suon)\b/.test(tt)) {
    const com = menu.filter((m) => m.category === "Cơm");
    return pickWithFallback(
      com,
      T("🍚 Món cơm tại Canteen:"),
      T("Hiện chưa có món cơm trong thực đơn.")
    );
  }

  // ============================================================
  // INTENT: Giá theo ngân sách
  // ============================================================
  const price = parsePrice(tt);
  const wantsCheap = /\b(re|duoi|it tien|sinh vien|tiet kiem)\b/.test(tt);

  if (price !== null || wantsCheap) {
    const maxPrice = price !== null ? price : 30000;
    const priceStr = maxPrice.toLocaleString("vi-VN");

    const cheap = menu
      .filter((m) => Number(m.price) <= maxPrice)
      .sort((a, b) => Number(a.price) - Number(b.price))
      .slice(0, 3);

    if (!cheap.length) {
      return {
        text: T("Không có món nào dưới {price}đ. Bạn thử ngân sách khác nhé!").replace("{price}", priceStr),
        items: [],
      };
    }

    return {
      text: T("💰 Món dưới {price}đ cho bạn đây:").replace("{price}", priceStr),
      items: cheap,
    };
  }

  // ============================================================
  // INTENT: Gợi ý ngẫu nhiên
  // ============================================================
  if (/\b(goi y|random|ngau nhien|an gi|mon gi)\b/.test(tt)) {
    if (!menu.length) {
      return { text: T("Hiện chưa có thực đơn. Bạn xem sau nhé!"), items: [] };
    }
    const rand = menu[Math.floor(Math.random() * menu.length)];
    return {
      text: T("🎲 Mình gợi ý bạn thử món này nhé:"),
      items: [rand],
    };
  }

  // ============================================================
  // FALLBACK
  // ============================================================
  return {
    text: T("Mình chưa hiểu câu hỏi này. 🤔\nBạn thử hỏi: \"dưới 30k\", \"chay\", \"nước\", \"cay\", \"bán chạy\", \"cơm\", \"gợi ý\"."),
    items: []
  };
}

export default getBotReply;