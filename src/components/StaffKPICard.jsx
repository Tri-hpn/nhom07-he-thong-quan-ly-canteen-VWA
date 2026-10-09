// ============================================================
// STAFFKPICARD.JSX — KPI card có progress bar + sub-stats
// ============================================================
// V2 (2026-10):
//   - ✅ FIX #15: Clamp seg.pct về [0, 100] — không còn tràn progress bar
//   - ✅ FIX #40 (giữ): delta.pct guard Number.isFinite
// ============================================================

import { TrendingUp, TrendingDown } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

// ✅ FIX #15: helper clamp pct về [0, 100]
function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default function StaffKPICard({
  icon,
  label,
  value,
  unit,
  colorVariant = "default",
  delta,
  progressSegments,
  legendRows,
  badge,
  hint,
}) {
  const { t } = useI18n();

  const rawPct = Number(delta?.pct);
  const safePct = Number.isFinite(rawPct) ? rawPct : 0;

  return (
    <div className="staff-kpi-card">
      <div className="staff-kpi-card__top">
        <div style={{ minWidth: 0 }}>
          <span className="staff-kpi-card__label">{label}</span>
          <div className="staff-kpi-card__value-row">
            <span
              className={`staff-kpi-card__value ${
                colorVariant !== "default"
                  ? `staff-kpi-card__value--${colorVariant}`
                  : ""
              }`}
            >
              {value}
            </span>
            {unit && <span className="staff-kpi-card__unit">{unit}</span>}
          </div>
        </div>

        {icon && (
          <div
            className={`staff-kpi-card__icon staff-kpi-card__icon--${
              colorVariant === "default" ? "primary" : colorVariant
            }`}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="staff-kpi-card__bottom">
        {delta && (
          <div className="staff-kpi-card__sub">
            <span
              className={`staff-kpi-card__delta ${
                delta.isUp
                  ? "staff-kpi-card__delta--up"
                  : "staff-kpi-card__delta--down"
              }`}
            >
              {delta.isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {delta.isUp ? "↑" : "↓"} {safePct}%
            </span>
            {legendRows?.[0] && (
              <span style={{ color: "var(--st-text-muted)", fontSize: 12 }}>
                {legendRows[0].label}
              </span>
            )}
            {legendRows?.[0]?.value !== undefined && (
              <b>{legendRows[0].value}</b>
            )}
          </div>
        )}

        {/* ✅ FIX #15: clamp pct từng segment */}
        {progressSegments && progressSegments.length > 0 && (
          <div className="staff-kpi-progress">
            {progressSegments.map((seg, i) => (
              <div
                key={i}
                className={`staff-kpi-progress__seg staff-kpi-progress__seg--${seg.variant}`}
                style={{ width: `${clampPct(seg.pct)}%` }}
                title={seg.title}
              />
            ))}
          </div>
        )}

        {legendRows && legendRows.length > 0 && (
          <div className="staff-kpi-card__legend">
            {legendRows.map((row, i) => (
              <span key={i}>
                {row.label} <b>{row.value}</b>
              </span>
            ))}
          </div>
        )}

        {badge && (
          <span
            className={`staff-kpi-card__badge ${
              badge.variant ? `staff-kpi-card__badge--${badge.variant}` : ""
            }`}
          >
            {badge.icon}
            {badge.text}
          </span>
        )}

        {hint && <span className="staff-kpi-card__hint">{hint}</span>}
      </div>
    </div>
  );
}