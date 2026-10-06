// ============================================================
// LOGOVWA.JSX — Logo chính thức Canteen VWA (V2)
// ============================================================
// ✅ V2: Dùng icon.svg trong public/ thay vì SVG inline
// ============================================================

export function LogoVWA({
  width = 240,
  height = 60,
  className = "",
  alt = "Canteen VWA",
}) {
  return (
    <img
      src="/icon.svg"
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{
        display: "block",
        width,
        height: "auto",
        objectFit: "contain",
      }}
    />
  );
}

export function LogoVWACompact({
  size = 44,
  className = "",
  alt = "Canteen VWA",
}) {
  return (
    <img
      src="/icon.svg"
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
        objectFit: "contain",
      }}
    />
  );
}

export default LogoVWA;