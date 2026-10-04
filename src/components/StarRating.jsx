// ============================================================
// STARRATING.JSX — Đánh giá sao (1-5)
// ============================================================

import { useState, useMemo, useCallback, useRef } from "react";
import {
  Star,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";

const STARS = [1, 2, 3, 4, 5];
const FILL_COLOR = "#f59e0b";
const EMPTY_COLOR = "#cbd5e1";

function clampRating(n) {
  const num = Number(n);
  if (!isFinite(num)) return 0;
  return Math.max(0, Math.min(5, Math.round(num)));
}

export default function StarRating({
  value = 0,
  onChange,
  size = 20,
  readonly = false,
}) {
  const { t } = useI18n();
  const [hover, setHover] = useState(0);
  const containerRef = useRef(null);

  const safeValue = useMemo(() => clampRating(value), [value]);
  const safeHover = useMemo(() => clampRating(hover), [hover]);

  const displayValue = useMemo(() => {
    if (readonly) return safeValue;
    return safeHover || safeValue;
  }, [readonly, safeValue, safeHover]);

  const handleSelect = useCallback(
    (star) => {
      if (readonly) return;
      onChange?.(star);
    },
    [readonly, onChange]
  );

  const handleMouseEnter = useCallback(
    (star) => {
      if (readonly) return;
      setHover(star);
    },
    [readonly]
  );

  const handleMouseLeave = useCallback(() => {
    if (readonly) return;
    setHover(0);
  }, [readonly]);

  const handleKeyDown = useCallback(
    (e) => {
      if (readonly) return;

      const current = safeHover || safeValue;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowUp":
          e.preventDefault();
          handleSelect(Math.min(5, current + 1 || 1));
          break;

        case "ArrowLeft":
        case "ArrowDown":
          e.preventDefault();
          handleSelect(Math.max(1, current - 1));
          break;

        case "Home":
          e.preventDefault();
          handleSelect(1);
          break;

        case "End":
          e.preventDefault();
          handleSelect(5);
          break;

        case " ":
        case "Enter":
          e.preventDefault();
          handleSelect(safeValue || 5);
          break;

        default:
          break;
      }
    },
    [readonly, safeHover, safeValue, handleSelect]
  );

  const containerTabIndex = readonly ? -1 : 0;

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={t("rating.ariaGroup")}
      aria-readonly={readonly}
      tabIndex={containerTabIndex}
      onKeyDown={handleKeyDown}
      onMouseLeave={handleMouseLeave}
      style={{
        display: "inline-flex",
        gap: 2,
        outline: "none",
      }}
      onFocus={(e) => {
        if (!readonly) {
          e.currentTarget.style.borderRadius = "6px";
          e.currentTarget.style.boxShadow =
            "0 0 0 3px rgba(38, 52, 213, 0.15)";
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {STARS.map((star) => {
        const filled = star <= displayValue;

        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === safeValue}
            aria-label={t("rating.starAria").replace("{n}", star)}
            disabled={readonly}
            tabIndex={-1}
            onClick={() => handleSelect(star)}
            onMouseEnter={() => handleMouseEnter(star)}
            style={{
              background: "none",
              border: 0,
              cursor: readonly ? "default" : "pointer",
              padding: 0,
              display: "grid",
              placeItems: "center",
              transition: "transform 0.15s ease",
              transform:
                !readonly && star === safeHover ? "scale(1.15)" : "scale(1)",
            }}
          >
            <Star
              size={size}
              fill={filled ? FILL_COLOR : "none"}
              color={filled ? FILL_COLOR : EMPTY_COLOR}
              strokeWidth={2}
            />
          </button>
        );
      })}
    </div>
  );
}