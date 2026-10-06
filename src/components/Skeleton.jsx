// ============================================================
// SKELETON.JSX — Placeholder loading với shimmer effect
// ============================================================
// Không có text hiển thị → KHÔNG cần i18n.
// 🔧 FIX #39: SkeletonCard dùng aspect-ratio thay vì height 160px cứng
//             → responsive mobile, không méo tỷ lệ.
// ============================================================

import { useMemo } from "react";

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
  style = {},
}) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonText({ width = "100%", height = 12, style = {} }) {
  return <Skeleton width={width} height={height} radius={4} style={style} />;
}

export function SkeletonCircle({ size = 40, style = {} }) {
  return (
    <Skeleton
      width={size}
      height={size}
      radius="50%"
      style={{ flexShrink: 0, ...style }}
    />
  );
}

export function SkeletonCard({ style = {} }) {
  return (
    <div
      aria-hidden="true"
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e5e9ef)",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {/*
        🔧 FIX #39: dùng aspect-ratio 1/1 thay vì height 160px cứng.
        - Trên desktop: khối ảnh rộng ~300px → cao ~300px (gần giống cũ)
        - Trên mobile 320px: khối ảnh rộng ~150px → cao ~150px (không méo)
        - Có thể override bằng prop style={{ aspectRatio: "..." }}
      */}
      <Skeleton
        width="100%"
        height="auto"
        radius={0}
        style={{ aspectRatio: "1 / 1" }}
      />

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <Skeleton width="40%" height={10} />
        <Skeleton width="85%" height={14} />
        <Skeleton width="60%" height={14} />

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton width="45%" height={18} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Skeleton height={34} radius={9} />
            <Skeleton height={34} radius={9} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonTableRow({ columns = 5 }) {
  const widths = useMemo(
    () =>
      Array.from({ length: columns }).map(
        (_, i) => `${60 + ((i * 13) % 30)}%`
      ),
    [columns]
  );

  return (
    <tr
      aria-hidden="true"
      style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}
    >
      {widths.map((w, i) => (
        <td key={i} style={{ padding: 11 }}>
          <Skeleton width={w} height={14} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonList({ style = {} }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        background: "var(--bg-tertiary, #f8fafc)",
        borderRadius: 10,
        border: "1px solid var(--border-color, #eef2f7)",
        ...style,
      }}
    >
      <Skeleton width={44} height={44} radius={12} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <Skeleton width="35%" height={13} />
        <Skeleton width="70%" height={11} />
      </div>

      <Skeleton width={80} height={18} />
    </div>
  );
}

export function SkeletonTable({
  columns = 5,
  rows = 5,
  headers = [],
}) {
  return (
    <div style={{ overflowX: "auto" }} aria-hidden="true">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
            {Array.from({ length: columns }).map((_, i) => (
              <th
                key={i}
                style={{
                  padding: 11,
                  textAlign: "left",
                  fontSize: 12,
                  color: "var(--text-muted, #64748b)",
                  fontWeight: 600,
                }}
              >
                {headers[i] || <SkeletonText width="60%" height={11} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonStats({ count = 4, columns = "repeat(4, 1fr)" }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap: 12,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Skeleton width={26} height={26} radius={7} />
            <SkeletonText width="55%" height={11} />
          </div>
          <Skeleton width="60%" height={20} />
        </div>
      ))}
    </div>
  );
}