// ============================================================
// POINTS ENGINE — Pure functions cho tích/đổi điểm VWA
// ============================================================
// B8: DEFAULT_POINTS_CONFIG.redeem khớp usePointsConfig (100 điểm = 10.000đ)
//     canRedeem nhận `t` tùy chọn để i18n

export const DEFAULT_POINTS_CONFIG = {
  earn: {
    rate_amount: 10000,
    rate_points: 1,
    green_enabled: true,
    green_points: 10,
    green_require_approval: true,
    review_enabled: true,
    review_points: 5,
  },
  redeem: {
    rate_points: 100,
    rate_value: 10000,
    min_points: 100,
    max_unused_vouchers: 50,
    tiers: [
      { points: 100, value: 10000 },
      { points: 200, value: 20000 },
      { points: 500, value: 50000 },
      { points: 1000, value: 100000 },
    ],
  },
};

export function mergeConfig(cfg) {
  const d = DEFAULT_POINTS_CONFIG;
  return {
    earn: { ...d.earn, ...(cfg?.earn || {}) },
    redeem: {
      ...d.redeem,
      ...(cfg?.redeem || {}),
      tiers:
        Array.isArray(cfg?.redeem?.tiers) && cfg.redeem.tiers.length > 0
          ? cfg.redeem.tiers.map((t) => ({ ...t }))
          : d.redeem.tiers.map((t) => ({ ...t })),
    },
  };
}

export function calcEarnPoints(totalAmount, config) {
  const cfg = mergeConfig(config);
  const amount = Number(totalAmount) || 0;
  const rateAmount = Number(cfg.earn.rate_amount) || 10000;
  const ratePoints = Number(cfg.earn.rate_points) || 1;
  if (amount <= 0 || rateAmount <= 0) return 0;
  return Math.floor(amount / rateAmount) * ratePoints;
}

export function calcGreenBonus(config) {
  const cfg = mergeConfig(config);
  if (!cfg.earn.green_enabled) return 0;
  return Number(cfg.earn.green_points) || 0;
}

export function calcReviewBonus(config) {
  const cfg = mergeConfig(config);
  if (!cfg.earn.review_enabled) return 0;
  return Number(cfg.earn.review_points) || 0;
}

export function calcRedeemValue(points, config) {
  const cfg = mergeConfig(config);
  const p = Number(points) || 0;
  const tier = cfg.redeem.tiers.find((t) => Number(t.points) === p);
  if (tier) return { value: Number(tier.value), tier };
  const ratePoints = Number(cfg.redeem.rate_points) || 100;
  const rateValue = Number(cfg.redeem.rate_value) || 10000;
  return { value: Math.floor(p / ratePoints) * rateValue, tier: null };
}

// 🔧 B8: nhận `t` tùy chọn (nếu không có → giữ tiếng Việt như cũ)
export function canRedeem(userPoints, points, activeVoucherCount, config, t) {
  const tr = typeof t === "function" ? t : (s) => s;
  const cfg = mergeConfig(config);
  const min = Number(cfg.redeem.min_points) || 100;
  const max = Number(cfg.redeem.max_unused_vouchers) || 50;
  const p = Number(points) || 0;

  if (p < min) {
    return {
      ok: false,
      reason: tr("Cần ít nhất {value} điểm để đổi", { value: min }),
    };
  }
  if (p > (Number(userPoints) || 0)) {
    return { ok: false, reason: tr("Không đủ điểm") };
  }
  if (Number(activeVoucherCount) >= max) {
    return {
      ok: false,
      reason: tr("Đã có {count}/{max} voucher chưa dùng", {
        count: activeVoucherCount,
        max,
      }),
    };
  }

  const { value, tier } = calcRedeemValue(p, cfg);
  if (value <= 0) {
    return { ok: false, reason: tr("Giá trị voucher không hợp lệ") };
  }
  return { ok: true, value, tier };
}