// ============================================================
// STAFFKPICARD.JSX — KPI card có progress bar + sub-stats
// ============================================================

import {
  TrendingUp, TrendingDown,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";

export default function StaffKPICard({
  icon,
  label,
  value,
  unit,
  colorVariant = "default", // default | success | primary | tertiary
  delta, // { pct, isUp } | null
  // Multi-segment progress: [{ pct, variant: 'success'|'warning'|'primary'|'info' }]
  progressSegments,
  // Row dưới progress bar: [{ label, value, bold }]
  legendRows,
  badge, // { icon, text, variant }
  hint, // string | JSX
}) {
  const { t } = useI18n();

  return (
    <div className="staff-kpi-card">
      {/* Top */}
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

      {/* Bottom */}
      <div className="staff-kpi-card__bottom">
        {/* Delta hoặc legend row 1 */}
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
              {delta.isUp ? "↑" : "↓"} {delta.pct}%
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

        {/* Progress bar */}
        {progressSegments && progressSegments.length > 0 && (
          <div className="staff-kpi-progress">
            {progressSegments.map((seg, i) => (
              <div
                key={i}
                className={`staff-kpi-progress__seg staff-kpi-progress__seg--${seg.variant}`}
                style={{ width: `${seg.pct}%` }}
                title={seg.title}
              />
            ))}
          </div>
        )}

        {/* Legend row bottom */}
        {legendRows && legendRows.length > 0 && (
          <div className="staff-kpi-card__legend">
            {legendRows.map((row, i) => (
              <span key={i}>
                {row.label} <b>{row.value}</b>
              </span>
            ))}
          </div>
        )}

        {/* BadgeCheck */}
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

        {/* Hint */}
        {hint && <span className="staff-kpi-card__hint">{hint}</span>}
      </div>
    </div>
  );
}