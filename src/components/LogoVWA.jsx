// ============================================================
// LOGOVWA.JSX — Logo SVG chính thức Canteen VWA
// ============================================================
// 2 variants:
//   - full: 240x60 với chữ "CANTEEN VWA" + tagline
//   - compact: chỉ icon vuông (dùng cho sidebar, mobile)
// ============================================================

export function LogoVWA({ width = 240, height = 60, className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 60"
      width={width}
      height={height}
      className={className}
      fill="none"
      aria-label="Canteen VWA"
    >
      {/* Icon khối vuông */}
      <rect x="4" y="8" width="44" height="44" rx="12" fill="#2563EB" />

      {/* Nắp đậy / tách */}
      <path
        d="M20 22C20 18.6863 22.6863 16 26 16C29.3137 16 32 18.6863 32 22V36C32 37.1046 31.1046 38 30 38H22C20.8954 38 20 37.1046 20 36V22Z"
        fill="#FFFFFF"
        fillOpacity="0.9"
      />
      <path
        d="M24 19V30M28 19V30"
        stroke="#2563EB"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Tay cầm tách */}
      <path
        d="M34 18C34 18 36 21 36 25C36 28 34.5 30 33 30.5V38"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Chấm cam */}
      <circle cx="38" cy="18" r="3" fill="#F59E0B" />

      {/* Text CANTEEN */}
      <text
        x="60"
        y="32"
        fontFamily="'Plus Jakarta Sans', sans-serif"
        fontSize="20"
        fontWeight="800"
        fill="#0F172A"
        letterSpacing="-0.5"
      >
        CANTEEN
      </text>

      {/* Text VWA */}
      <text
        x="162"
        y="32"
        fontFamily="'Plus Jakarta Sans', sans-serif"
        fontSize="20"
        fontWeight="900"
        fill="#2563EB"
      >
        VWA
      </text>

      {/* Tagline */}
      <text
        x="60"
        y="46"
        fontFamily="'Plus Jakarta Sans', sans-serif"
        fontSize="10"
        fontWeight="600"
        fill="#64748B"
        letterSpacing="1.5"
      >
        CAMPUS SMART DINING
      </text>
    </svg>
  );
}

export function LogoVWACompact({ size = 44, className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 52 52"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-label="Canteen VWA"
    >
      <rect x="0" y="0" width="52" height="52" rx="14" fill="#2563EB" />
      <path
        d="M17 22C17 18.6863 19.6863 16 23 16C26.3137 16 29 18.6863 29 22V36C29 37.1046 28.1046 38 27 38H19C17.8954 38 17 37.1046 17 36V22Z"
        fill="#FFFFFF"
        fillOpacity="0.9"
      />
      <path
        d="M21 19V30M25 19V30"
        stroke="#2563EB"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M31 18C31 18 33 21 33 25C33 28 31.5 30 30 30.5V38"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="35" cy="18" r="3" fill="#F59E0B" />
    </svg>
  );
}

export default LogoVWA;