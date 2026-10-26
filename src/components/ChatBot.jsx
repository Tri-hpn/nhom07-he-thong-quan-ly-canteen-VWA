// ============================================================
// CHATBOT.JS — Logic keyword matching gợi ý món ăn (V3 - FIXED + i18n)
// ============================================================
// V3 (2026-10):
//   - 🔧 FIX #32: regex greeting không match "chào mừng", "chào bạn", v.v.
//                 - Dùng word boundary + negative lookahead
//                 - Chỉ match khi greeting là TOÀN BỘ message HOẶC đứng đầu + space
//   - Giữ nguyên logic còn lại
// ============================================================

const DEFAULT_SETTINGS = {
  hotline: "1900 6868",
  address: "68 Nguyễn Chí Thanh, Phường Láng, Hà Nội",
  openHours: "6:30 — 18:30 hàng ngày",
};

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
  vegetarianEmpty:
    "Hiện chưa có món chay trong thực đơn. Bạn xem món khác nhé!",
  drinks: "🥤 Đồ uống tại Canteen:",
  drinksEmpty: "Hiện chưa có đồ uống trong thực đơn.",
  spicy: "🌶️ Món cay bạn có thể thử:",
  spicyFallback: "Các món đậm vị tại Canteen:",
  spicyEmpty: "Hiện chưa có món cay. Bạn xem thực đơn nhé!",
  rice: "🍚 Món cơm tại Canteen:",
  riceEmpty: "Hiện chưa có món cơm trong thực đơn.",
  budget: "💰 Món dưới {price}đ cho bạn đây:",
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
    const total = thousands * 1000 + rest;
    return total > 0 ? total : null;
  }

  const kMatch = t.match(/(\d+)\s*(k|nghin|ngan|ngàn|nghìn)/);
  if (kMatch) {
    const val = parseInt(kMatch[1], 10) * 1000;
    return val > 0 ? val : null;
  }

  const dMatch = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(d|đ)?/);
  if (dMatch) {
    const val = parseInt(dMatch[1].replace(/[.,]/g, ""), 10);
    return val > 0 ? val : null;
  }

  return null;
}

function pickWithFallback(list, prefix, emptyMsg, limit = 3) {
  const picked = list.slice(0, limit);
  if (!picked.length) return { text: emptyMsg, items: [] };
  return { text: prefix, items: picked };
}

// ============================================================
// 🔧 FIX #32: INTENT REGEX — tinh chỉnh greeting
// ============================================================
// Vấn đề cũ: /^(chao|hi|hello|hey|xin chao)\s*[!,.]?/
//   → Match "chào mừng đến Canteen" (vì "chao" là prefix)
//   → Nhưng user thực sự muốn hỏi về "chào mừng"
//
// Fix: Yêu cầu greeting phải là TOÀN BỘ message (^\s*...\s*$)
//   HOẶC greeting + dấu câu kết thúc ($)
//   KHÔNG match nếu sau greeting còn chữ khác.
// ============================================================

const INTENT_REGEX = {
  // Greeting: chỉ match khi toàn bộ message là greeting + optional dấu câu
  greeting: /^\s*(chao|hi|hello|hey|xin chao|chao ban|chao shop|chao ad|alo)\s*[!,.]?\s*$/,

  openHours: /\b(gio mo|mo cua|dong cua|may gio mo|gio lam)\b/,

  address: /\b(dia chi|o dau|duong nao|dia diem|cho nao)\b/,

  hotline: /\b(hotline|so dien thoai|sdt|lien he|goi dien)\b/,

  order: /\b(dat mon|dat hang|order|thanh toan|tra tien|mua hang)\b/,

  voucher: /\b(doi diem|voucher|khuyen mai|giam gia|uu dai|ma giam)\b/,

  bestSeller: /\b(ban chay|ngon nhat|hot|pho bien|best|top)\b/,

  vegetarian: /\b(chay|khong thit|ko thit|an chay|mon chay)\b/,

  drinks: /\b(nuoc|uong|tra|ca phe|sinh to|nuoc ep|tra sua|giai khat)\b/,

  spicy: /\b(cay|spicy|sa te|nong)\b/,

  rice: /\b(com|com rang|com ga|com suon|com tam)\b/,

  wantsCheap: /\b(gia re|re nhat|duoi|it tien|sinh vien|tiet kiem|binh dan|pho thong)\b/,

  random: /\b(goi y|random|ngau nhien|an gi|mon gi|nen an)\b/,
};

function detectIntent(normalizedText) {
  const tt = normalizedText;

  if (INTENT_REGEX.greeting.test(tt)) return "greeting";
  if (INTENT_REGEX.openHours.test(tt)) return "openHours";
  if (INTENT_REGEX.address.test(tt)) return "address";
  if (INTENT_REGEX.hotline.test(tt)) return "hotline";
  if (INTENT_REGEX.order.test(tt)) return "order";
  if (INTENT_REGEX.voucher.test(tt)) return "voucher";
  if (INTENT_REGEX.bestSeller.test(tt)) return "bestSeller";
  if (INTENT_REGEX.vegetarian.test(tt)) return "vegetarian";
  if (INTENT_REGEX.drinks.test(tt)) return "drinks";
  if (INTENT_REGEX.spicy.test(tt) && !INTENT_REGEX.vegetarian.test(tt)) {
    return "spicy";
  }
  if (INTENT_REGEX.rice.test(tt)) return "rice";
  if (INTENT_REGEX.random.test(tt)) return "random";

  return null;
}

export function getBotReply(userText, menuItems = [], settings = null, t = null) {
  const raw = (userText || "").trim();
  if (!raw) return null;

  const tt = normalize(raw);
  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const menu = Array.isArray(menuItems) ? menuItems : [];

  const T = (key, vars) => {
    let out;
    if (t) {
      try {
        out = t(key);
      } catch {
        out = FALLBACK_TEXT[key] || key;
      }
    } else {
      out = FALLBACK_TEXT[key] || key;
    }

    if (vars) {
      for (const k of Object.keys(vars)) {
        out = out.replace(
          new RegExp(`\\{${k}\\}`, "g"),
          String(vars[k])
        );
      }
    }
    return out;
  };

  const intent = detectIntent(tt);

  switch (intent) {
    case "greeting":
      return {
        text: T("greeting"),
        items: [],
      };

    case "openHours":
      return {
        text: `🕐 ${T("openHours").replace(/^🕐\s*/, "")}`.replace(
          DEFAULT_SETTINGS.openHours,
          cfg.openHours
        ),
        items: [],
      };

    case "address":
      return {
        text: `📍 ${T("address").replace(/^📍\s*/, "")}`.replace(
          DEFAULT_SETTINGS.address,
          cfg.address
        ),
        items: [],
      };

    case "hotline":
      return {
        text: `☎️ ${T("hotline").replace(/^☎️\s*/, "")}`.replace(
          DEFAULT_SETTINGS.hotline,
          cfg.hotline
        ),
        items: [],
      };

    case "order":
      return {
        text: T("order"),
        items: [],
      };

    case "voucher":
      return {
        text: T("voucher"),
        items: [],
      };

    case "bestSeller": {
      const top = [...menu]
        .sort((a, b) => (b.sold || 0) - (a.sold || 0))
        .slice(0, 3);
      return pickWithFallback(
        top,
        T("bestSeller"),
        T("bestSellerEmpty")
      );
    }

    case "vegetarian": {
      const chay = menu.filter((m) => m.category === "Món chay");
      return pickWithFallback(
        chay,
        T("vegetarian"),
        T("vegetarianEmpty")
      );
    }

    case "drinks": {
      const drinks = menu.filter((m) => m.category === "Đồ uống");
      return pickWithFallback(
        drinks,
        T("drinks"),
        T("drinksEmpty")
      );
    }

    case "spicy": {
      const cay = menu.filter((m) => {
        const n = normalize(m.name || "");
        return /\b(bun bo|hue|sa te|spicy|cay)\b/.test(n);
      });
      if (cay.length) {
        return {
          text: T("spicy"),
          items: cay.slice(0, 3),
        };
      }

      const man = menu.filter((m) => m.category === "Món mặn");
      return pickWithFallback(
        man,
        T("spicyFallback"),
        T("spicyEmpty")
      );
    }

    case "rice": {
      const com = menu.filter((m) => m.category === "Cơm");
      return pickWithFallback(
        com,
        T("rice"),
        T("riceEmpty")
      );
    }

    case "random": {
      if (!menu.length) {
        return { text: T("randomEmpty"), items: [] };
      }
      const rand = menu[Math.floor(Math.random() * menu.length)];
      return {
        text: T("random"),
        items: [rand],
      };
    }

    default:
      break;
  }

  const price = parsePrice(tt);
  const wantsCheap = INTENT_REGEX.wantsCheap.test(tt);

  if (price !== null || wantsCheap) {
    const maxPrice = price !== null ? price : 30000;
    const priceStr = maxPrice.toLocaleString("vi-VN");

    const cheap = menu
      .filter((m) => Number(m.price) <= maxPrice)
      .sort((a, b) => Number(a.price) - Number(b.price))
      .slice(0, 3);

    if (!cheap.length) {
      return {
        text: T("budgetEmpty").replace("{price}", priceStr),
        items: [],
      };
    }

    return {
      text: T("budget").replace("{price}", priceStr),
      items: cheap,
    };
  }

  return {
    text: T("fallback"),
    items: [],
  };
}

export default getBotReply;