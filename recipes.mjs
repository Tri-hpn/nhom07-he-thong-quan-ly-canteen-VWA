// ============================================================
// RECIPES.MJS — Bảng quy đổi món → nguyên liệu
// ============================================================
// Đơn vị:
//   - Đa số: gram (g) — 1000g = 1kg
//   - Trứng/Xúc xích/Bánh mì: CÁI (sẽ trừ trực tiếp)
//   - Sữa đặc: gram (quy đổi từ hộp ~380g)
//   - Nước mắm/Dầu ăn/Cà phê/Trà: gram
// ============================================================

export const RECIPES = {
  // ==================== CƠM (8 món) ====================
  "Cơm gà sốt tiêu": [
    { code: "NL001", gram: 200 },   // Gạo
    { code: "NL002", gram: 250 },   // Thịt gà
    { code: "NL011", gram: 10 },    // Hành
    { code: "NL012", gram: 20 },    // Dầu ăn
    { code: "NL013", gram: 5 },     // Nước mắm
  ],
  "Cơm gà nướng mật ong": [
    { code: "NL001", gram: 200 },
    { code: "NL002", gram: 250 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 20 },
    { code: "NL013", gram: 5 },
  ],
  "Cơm gà phôi mai trứng nướng": [
    { code: "NL001", gram: 200 },
    { code: "NL002", gram: 200 },
    { code: "NL008", gram: 1 },     // 1 cái trứng
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 20 },
  ],
  "Cơm sườn nướng": [
    { code: "NL001", gram: 200 },
    { code: "NL005", gram: 250 },   // Thịt heo
    { code: "NL009", gram: 50 },    // Rau
    { code: "NL010", gram: 30 },    // Cà chua
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 20 },
    { code: "NL013", gram: 10 },
  ],
  "Cơm chiên Dương Châu": [
    { code: "NL001", gram: 200 },
    { code: "NL005", gram: 50 },
    { code: "NL008", gram: 1 },
    { code: "NL009", gram: 50 },
    { code: "NL019", gram: 1 },     // 1 cái xúc xích
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 20 },
    { code: "NL013", gram: 5 },
  ],
  "Cơm bò xào bông cải": [
    { code: "NL001", gram: 200 },
    { code: "NL003", gram: 200 },   // Thịt bò
    { code: "NL009", gram: 100 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 20 },
    { code: "NL013", gram: 10 },
  ],
  "Cơm thịt kho tàu trứng cút": [
    { code: "NL001", gram: 200 },
    { code: "NL005", gram: 200 },
    { code: "NL008", gram: 2 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 15 },
    { code: "NL013", gram: 10 },
  ],
  "Cơm chay thập cẩm": [
    { code: "NL001", gram: 200 },
    { code: "NL009", gram: 100 },
    { code: "NL018", gram: 100 },   // Đậu hũ
    { code: "NL010", gram: 50 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 20 },
    { code: "NL013", gram: 10 },
  ],

  // ==================== BÚN / PHỞ / CHÁO (14 món) ====================
  "Bún bò Huế": [
    { code: "NL004", gram: 150 },   // Bún
    { code: "NL003", gram: 200 },
    { code: "NL009", gram: 50 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 10 },
    { code: "NL013", gram: 15 },
  ],
  "Bún chả Hà Nội": [
    { code: "NL004", gram: 150 },
    { code: "NL005", gram: 200 },
    { code: "NL009", gram: 50 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 10 },
    { code: "NL013", gram: 15 },
  ],
  "Bún bò Nam Bộ": [
    { code: "NL004", gram: 150 },
    { code: "NL003", gram: 200 },
    { code: "NL009", gram: 80 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 10 },
    { code: "NL013", gram: 15 },
  ],
  "Bún chả chay": [
    { code: "NL004", gram: 150 },
    { code: "NL009", gram: 100 },
    { code: "NL018", gram: 100 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 10 },
    { code: "NL013", gram: 10 },
  ],
  "Bún thập cẩm": [
    { code: "NL004", gram: 150 },
    { code: "NL005", gram: 150 },
    { code: "NL009", gram: 50 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 10 },
    { code: "NL013", gram: 15 },
  ],
  "Bún cá cay": [
    { code: "NL004", gram: 150 },
    { code: "NL009", gram: 50 },
    { code: "NL010", gram: 30 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 10 },
    { code: "NL013", gram: 15 },
  ],
  "Phở bò": [
    { code: "NL006", gram: 150 },   // Phở
    { code: "NL003", gram: 200 },
    { code: "NL009", gram: 50 },
    { code: "NL011", gram: 15 },
    { code: "NL012", gram: 5 },
    { code: "NL013", gram: 10 },
  ],
  "Phở bò tái nạm": [
    { code: "NL006", gram: 150 },
    { code: "NL003", gram: 200 },
    { code: "NL009", gram: 50 },
    { code: "NL011", gram: 15 },
    { code: "NL012", gram: 5 },
    { code: "NL013", gram: 10 },
  ],
  "Phở gà xé lá chanh": [
    { code: "NL006", gram: 150 },
    { code: "NL002", gram: 200 },
    { code: "NL009", gram: 50 },
    { code: "NL011", gram: 15 },
    { code: "NL012", gram: 5 },
    { code: "NL013", gram: 10 },
  ],
  "Phở chay": [
    { code: "NL006", gram: 150 },
    { code: "NL009", gram: 100 },
    { code: "NL018", gram: 100 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 10 },
    { code: "NL013", gram: 10 },
  ],
  "Mì xào chay": [
    { code: "NL007", gram: 150 },   // Mì
    { code: "NL009", gram: 100 },
    { code: "NL010", gram: 30 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 15 },
    { code: "NL013", gram: 10 },
  ],
  "Cháo thịt bằm": [
    { code: "NL001", gram: 100 },
    { code: "NL005", gram: 100 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 5 },
    { code: "NL013", gram: 5 },
  ],
  "Cháo trai": [
    { code: "NL001", gram: 100 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 5 },
    { code: "NL013", gram: 5 },
  ],

  // ==================== BÁNH MÌ / XÔI (6 món) ====================
  "Bánh mì thịt xá xíu": [
    { code: "NL015", gram: 1 },     // 1 cái bánh mì
    { code: "NL005", gram: 100 },
    { code: "NL009", gram: 30 },
    { code: "NL013", gram: 5 },
  ],
  "Bánh mì chảo": [
    { code: "NL015", gram: 1 },
    { code: "NL005", gram: 100 },
    { code: "NL008", gram: 2 },
    { code: "NL009", gram: 30 },
    { code: "NL010", gram: 30 },
    { code: "NL012", gram: 10 },
    { code: "NL013", gram: 5 },
  ],
  "Bánh mì Sài Gòn": [
    { code: "NL015", gram: 1 },
    { code: "NL005", gram: 100 },
    { code: "NL008", gram: 1 },
    { code: "NL009", gram: 30 },
    { code: "NL012", gram: 5 },
    { code: "NL013", gram: 5 },
  ],
  "Xôi thịt kho trứng": [
    { code: "NL001", gram: 200 },
    { code: "NL005", gram: 200 },
    { code: "NL008", gram: 2 },
    { code: "NL011", gram: 5 },
    { code: "NL012", gram: 5 },
    { code: "NL013", gram: 10 },
  ],
  "Xôi pate trứng ruốc": [
    { code: "NL001", gram: 200 },
    { code: "NL005", gram: 100 },
    { code: "NL008", gram: 1 },
    { code: "NL011", gram: 5 },
    { code: "NL012", gram: 5 },
  ],
  "Bánh bao": [
    { code: "NL005", gram: 100 },
    { code: "NL008", gram: 1 },
  ],

  // ==================== ĐỒ UỐNG (5 món) ====================
  "Cà phê sữa đá": [
    { code: "NL014", gram: 20 },    // Cà phê
    { code: "NL016", gram: 30 },    // Sữa đặc
  ],
  "Cà phê đen đá": [
    { code: "NL014", gram: 20 },
  ],
  "Trà đào cam sả": [
    { code: "NL017", gram: 10 },    // Trà
  ],
  "Trà sữa trân châu": [
    { code: "NL017", gram: 15 },
    { code: "NL016", gram: 30 },
  ],
  "Trà chanh sả đá": [
    { code: "NL017", gram: 10 },
  ],

  // ==================== ĂN VẶT (5 món) ====================
  "Khoai tây chiên": [
    { code: "NL020", gram: 200 },   // Khoai tây
    { code: "NL012", gram: 100 },
  ],
  "Gà rán sốt cay Hàn Quốc": [
    { code: "NL002", gram: 250 },
    { code: "NL011", gram: 5 },
    { code: "NL012", gram: 50 },
    { code: "NL013", gram: 5 },
  ],
  "Gà giòn rôm rốp": [
    { code: "NL002", gram: 250 },
    { code: "NL011", gram: 5 },
    { code: "NL012", gram: 50 },
    { code: "NL013", gram: 5 },
  ],
  "Xúc xích": [
    { code: "NL019", gram: 2 },
    { code: "NL012", gram: 10 },
  ],
  "Kimbap": [
    { code: "NL001", gram: 150 },
    { code: "NL008", gram: 1 },
    { code: "NL009", gram: 50 },
    { code: "NL019", gram: 1 },
    { code: "NL011", gram: 5 },
    { code: "NL012", gram: 5 },
  ],

  // ==================== ĐỒ CHAY (3 món) ====================
  "Đậu hũ sốt cà": [
    { code: "NL018", gram: 200 },
    { code: "NL010", gram: 100 },
    { code: "NL011", gram: 10 },
    { code: "NL012", gram: 20 },
    { code: "NL013", gram: 10 },
  ],
  "Gỏi cuốn chay": [
    { code: "NL009", gram: 100 },
    { code: "NL018", gram: 100 },
    { code: "NL013", gram: 5 },
  ],
  "Bánh xèo chay": [
    { code: "NL001", gram: 100 },
    { code: "NL009", gram: 100 },
    { code: "NL018", gram: 50 },
    { code: "NL012", gram: 10 },
  ],

  // ==================== ĐỒ ĂN NHANH (2 món) ====================
  "Burger gà giòn": [
    { code: "NL002", gram: 200 },
    { code: "NL015", gram: 1 },
    { code: "NL009", gram: 30 },
    { code: "NL012", gram: 50 },
  ],
  "Sandwich thịt nguội": [
    { code: "NL005", gram: 100 },
    { code: "NL015", gram: 1 },
    { code: "NL009", gram: 30 },
  ],
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Lấy công thức của món theo tên
 * @param {string} menuItemName - tên món (VD: "Cơm gà sốt tiêu")
 * @returns {Array<{code: string, gram: number}> | null}
 */
export function getRecipe(menuItemName) {
  return RECIPES[menuItemName] || null;
}

/**
 * Quy đổi gram → đơn vị trong kho
 * NL001-NL014, NL016-NL020: gram → kg (chia 1000)
 * NL008 (Trứng), NL015 (Bánh mì), NL019 (Xúc xích): cái (giữ nguyên)
 */
const UNIT_AS_GRAM = ["NL001", "NL002", "NL003", "NL004", "NL005", "NL006",
                      "NL007", "NL009", "NL010", "NL011", "NL012", "NL013",
                      "NL014", "NL016", "NL017", "NL018", "NL020"];

export function gramToUnit(code, gram) {
  if (UNIT_AS_GRAM.includes(code)) {
    return gram / 1000;   // gram → kg
  }
  return gram;            // Cái → cái
}

/**
 * Kiểm tra 1 món có đủ nguyên liệu trong kho không
 * @param {string} menuItemName
 * @param {Array<{code: string, qty: number}>} inventory - db.inventory
 * @param {number} qty - số phần cần làm
 * @returns {{ok: boolean, missing: Array}}
 */
export function checkStock(menuItemName, inventory, qty = 1) {
  const recipe = getRecipe(menuItemName);
  if (!recipe) return { ok: true, missing: [] };  // Không có công thức → bỏ qua

  const missing = [];
  for (const ing of recipe) {
    const need = gramToUnit(ing.code, ing.gram) * qty;
    const item = inventory.find(x => x.code === ing.code);
    if (!item) {
      missing.push({ code: ing.code, need, have: 0 });
    } else if (item.qty < need) {
      missing.push({ code: ing.code, name: item.name, need, have: item.qty, unit: item.unit });
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Trừ kho khi xác nhận đơn
 * @param {Array} inventory - db.inventory (sẽ bị mutate)
 * @param {Array} orderItems - order.items (mỗi item có name, qty)
 * @returns {{ok: boolean, logs: Array, missing: Array}}
 */
export function deductStock(inventory, orderItems) {
  const logs = [];
  const missing = [];

  // Gộp nguyên liệu cần cho toàn bộ đơn
  const needed = {};
  for (const oi of orderItems) {
    const recipe = getRecipe(oi.name);
    if (!recipe) continue;

    for (const ing of recipe) {
      const amount = gramToUnit(ing.code, ing.gram) * (oi.qty || 1);
      needed[ing.code] = (needed[ing.code] || 0) + amount;
    }
  }

  // Kiểm tra đủ hàng trước
  for (const [code, need] of Object.entries(needed)) {
    const item = inventory.find(x => x.code === code);
    if (!item) {
      missing.push({ code, need, have: 0 });
    } else if (item.qty < need) {
      missing.push({ code, name: item.name, need, have: item.qty, unit: item.unit });
    }
  }

  if (missing.length > 0) {
    return { ok: false, logs: [], missing };
  }

  // Trừ kho
  for (const [code, need] of Object.entries(needed)) {
    const item = inventory.find(x => x.code === code);
    if (item) {
      const before = item.qty;
      item.qty = Math.round((item.qty - need) * 1000) / 1000;  // tránh float
      logs.push({ code, name: item.name, deducted: need, before, after: item.qty });
    }
  }

  return { ok: true, logs, missing: [] };
}

/**
 * Hoàn kho khi hủy đơn
 */
export function refundStock(inventory, orderItems) {
  const logs = [];

  const needed = {};
  for (const oi of orderItems) {
    const recipe = getRecipe(oi.name);
    if (!recipe) continue;

    for (const ing of recipe) {
      const amount = gramToUnit(ing.code, ing.gram) * (oi.qty || 1);
      needed[ing.code] = (needed[ing.code] || 0) + amount;
    }
  }

  for (const [code, need] of Object.entries(needed)) {
    const item = inventory.find(x => x.code === code);
    if (item) {
      const before = item.qty;
      item.qty = Math.round((item.qty + need) * 1000) / 1000;
      logs.push({ code, name: item.name, refunded: need, before, after: item.qty });
    }
  }

  return { ok: true, logs };
}