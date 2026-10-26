// ============================================================
// POINTS ENGINE — Pure functions cho tích/đổi xu VWA
// ============================================================

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
    rate_points: 1,
    rate_value: 1,
    min_points: 1,
    max_unused_vouchers: 50,
    tiers: [
      { points: 100, value: 100 },
      { points: 200, value: 200 },
      { points: 500, value: 500 },
      { points: 1000, value: 1000 },
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

export function calcEarnPoints(total, config) {
  return 100; // Luôn trả về đúng 100 Xu
}

export function calcGreenBonus(config) {
  return 200; // Luôn trả về đúng 200 Xu
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

export function canRedeem(userPoints, points, activeVoucherCount, config) {
  const cfg = mergeConfig(config);
  const min = Number(cfg.redeem.min_points) || 100;
  const max = Number(cfg.redeem.max_unused_vouchers) || 50;
  const p = Number(points) || 0;

  if (p < min) return { ok: false, reason: "Cần ít nhất " + min + " xu" };
  if (p > (Number(userPoints) || 0)) return { ok: false, reason: "Không đủ xu" };
  if (Number(activeVoucherCount) >= max)
    return { ok: false, reason: "Đã có " + activeVoucherCount + "/" + max + " voucher chưa dùng" };

  const { value, tier } = calcRedeemValue(p, cfg);
  if (value <= 0) return { ok: false, reason: "Giá trị voucher không hợp lệ" };
  return { ok: true, value, tier };
}
