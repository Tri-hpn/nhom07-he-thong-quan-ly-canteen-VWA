// ============================================================
// AUTHLAYOUT.JSX — Wrapper chung cho Login / Register / Forgot
// ============================================================
// V1 (2026-10):
//   - Background ảnh trường VWA + overlay tối
//   - Card trắng centered, shadow lớn
//   - CSS scope .v10-* — không xung đột styles.css
// ============================================================

const CURRENT_YEAR = new Date().getFullYear();

export default function AuthLayout({
  children,
  maxWidth = 440,
  bgImage = "/vwa-campus.jpg",
}) {
  return (
    <div className="v10-auth-page">
      <div
        className="v10-auth-bg"
        style={{ backgroundImage: `url("${bgImage}")` }}
        aria-hidden="true"
      />
      <div className="v10-auth-overlay" aria-hidden="true" />

      <div className="v10-auth-content">
        <div className="v10-auth-card" style={{ maxWidth }}>
          {children}
        </div>
        <div className="v10-auth-copyright">
          © {CURRENT_YEAR} Canteen VWA · Học viện Phụ nữ Việt Nam
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
/* ============ PAGE ============ */
.v10-auth-page {
  position: relative;
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  overflow-x: hidden;
}

/* ============ BACKGROUND ============ */
.v10-auth-bg {
  position: fixed;
  inset: 0;
  background-size: cover;
  background-position: center 35%;
  background-repeat: no-repeat;
  background-color: #0f172a;
  filter: brightness(0.85) saturate(1.05);
  z-index: -2;
}
.v10-auth-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(15, 23, 42, 0.55) 0%,
    rgba(15, 23, 42, 0.30) 50%,
    rgba(38, 52, 213, 0.30) 100%
  );
  z-index: -1;
}

/* ============ CONTENT ============ */
.v10-auth-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.v10-auth-card {
  width: 100%;
  background: #ffffff;
  border-radius: 24px;
  padding: 40px 32px 32px;
  box-sizing: border-box;
  box-shadow:
    0 25px 70px rgba(0, 0, 0, 0.35),
    0 8px 24px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: #0f172a;
}

.v10-auth-copyright {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.3px;
  font-weight: 500;
}

/* ============ LOGO ============ */
.v10-auth-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

/* ============ TITLE ============ */
.v10-auth-title {
  font-size: 26px;
  font-weight: 800;
  color: #0f172a;
  margin: 20px 0 6px;
  text-align: center;
  letter-spacing: -0.5px;
  line-height: 1.2;
}
.v10-auth-subtitle {
  font-size: 13.5px;
  color: #64748b;
  margin: 0 0 22px;
  text-align: center;
  line-height: 1.5;
}

/* ============ ERROR ============ */
.v10-auth-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 14px;
  animation: v10AuthShake 0.4s ease;
}
@keyframes v10AuthShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

/* ============ LABEL ============ */
.v10-auth-label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
  margin: 14px 0 6px;
  word-break: normal;
  white-space: normal;
}

/* ============ FIELD ============ */
.v10-auth-field {
  display: flex !important;
  align-items: center !important;
  flex-wrap: nowrap !important;
  gap: 10px !important;
  padding: 12px 14px !important;
  background: #f8fafc !important;
  border: 1.5px solid #e2e8f0 !important;
  border-radius: 12px !important;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s !important;
  box-sizing: border-box !important;
}
.v10-auth-field:focus-within {
  background: #ffffff !important;
  border-color: #2634d5 !important;
  box-shadow: 0 0 0 4px rgba(38, 52, 213, 0.1) !important;
}
.v10-auth-field-icon {
  color: #94a3b8 !important;
  flex-shrink: 0 !important;
}
.v10-auth-field:focus-within .v10-auth-field-icon {
  color: #2634d5 !important;
}
.v10-auth-field input,
.v10-auth-field input:hover,
.v10-auth-field input:focus {
  flex: 1 1 0% !important;
  width: auto !important;
  max-width: none !important;
  min-width: 0 !important;
  border: 0 !important;
  outline: 0 !important;
  background: transparent !important;
  font-size: 14px !important;
  color: #0f172a !important;
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
  -webkit-appearance: none !important;
  appearance: none !important;
}
.v10-auth-field input::placeholder {
  color: #cbd5e1 !important;
  opacity: 1 !important;
}

/* ============ EYE BUTTON ============ */
.v10-auth-eye {
  background: transparent !important;
  border: 0 !important;
  padding: 4px !important;
  cursor: pointer !important;
  color: #94a3b8 !important;
  display: grid !important;
  place-items: center !important;
  flex-shrink: 0 !important;
  border-radius: 6px !important;
}
.v10-auth-eye:hover {
  color: #0f172a !important;
  background: #f1f5f9 !important;
}

/* ============ SUBMIT ============ */
.v10-auth-submit {
  position: relative;
  overflow: hidden;
  width: 100% !important;
  background: linear-gradient(135deg, #2634d5 0%, #20c779 100%) !important;
  color: #fff !important;
  padding: 14px !important;
  border-radius: 12px !important;
  border: 0 !important;
  font-weight: 700 !important;
  font-size: 14.5px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  cursor: pointer !important;
  box-shadow: 0 8px 24px rgba(38, 52, 213, 0.28) !important;
  transition: transform 0.15s ease, box-shadow 0.2s ease !important;
  margin-top: 20px !important;
}
.v10-auth-submit::after {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  transition: left 0.6s ease;
  pointer-events: none;
}
.v10-auth-submit:hover:not(:disabled)::after { left: 100%; }
.v10-auth-submit:hover:not(:disabled) {
  transform: translateY(-1px) !important;
  box-shadow: 0 12px 32px rgba(38, 52, 213, 0.4) !important;
}
.v10-auth-submit:disabled {
  opacity: 0.6 !important;
  cursor: not-allowed !important;
}

/* ============ DIVIDER ============ */
.v10-auth-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 22px 0 14px;
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.v10-auth-divider::before,
.v10-auth-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

/* ============ SOCIALS ============ */
.v10-auth-socials {
  display: flex !important;
  gap: 10px !important;
  justify-content: center !important;
}
.v10-auth-social-btn {
  flex: 1 !important;
  height: 46px !important;
  border-radius: 12px !important;
  border: 1.5px solid #e2e8f0 !important;
  background: #fff !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  transition: border-color 0.18s, transform 0.15s, background 0.18s !important;
  padding: 0 !important;
}
.v10-auth-social-btn:hover {
  border-color: #2634d5 !important;
  background: #f8fafc !important;
  transform: translateY(-1px) !important;
}
.v10-auth-social-btn svg {
  width: 20px !important;
  height: 20px !important;
}

/* ============ ROW (remember + forgot) ============ */
.v10-auth-row {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  gap: 10px !important;
  margin: 14px 0 18px !important;
  font-size: 12.5px !important;
  flex-wrap: nowrap !important;
}
.v10-auth-row label {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  color: #475569 !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  margin: 0 !important;
  font-size: 12.5px !important;
  word-break: normal !important;
}
.v10-auth-row input[type="checkbox"] {
  width: 15px !important;
  height: 15px !important;
  accent-color: #2634d5 !important;
  flex-shrink: 0 !important;
  margin: 0 !important;
}
.v10-auth-row a {
  color: #2634d5 !important;
  font-weight: 600 !important;
  text-decoration: none !important;
  white-space: nowrap !important;
}
.v10-auth-row a:hover {
  text-decoration: underline !important;
}

/* ============ CHECK (register agree) ============ */
.v10-auth-check {
  display: flex !important;
  align-items: flex-start !important;
  gap: 8px !important;
  font-size: 12.5px !important;
  color: #475569 !important;
  cursor: pointer !important;
  margin-top: 14px !important;
  margin-bottom: 4px !important;
  user-select: none !important;
  line-height: 1.5 !important;
  word-break: normal !important;
  flex-wrap: nowrap !important;
}
.v10-auth-check input[type="checkbox"] {
  width: 16px !important;
  height: 16px !important;
  accent-color: #2634d5 !important;
  cursor: pointer !important;
  flex-shrink: 0 !important;
  margin: 2px 0 0 0 !important;
}

/* ============ BOTTOM TEXT ============ */
.v10-auth-bottom {
  text-align: center !important;
  font-size: 13px !important;
  color: #64748b !important;
  margin: 20px 0 0 !important;
}
.v10-auth-bottom a {
  color: #2634d5 !important;
  font-weight: 700 !important;
  text-decoration: none !important;
}
.v10-auth-bottom a:hover {
  text-decoration: underline !important;
}

/* ============ DEMO ============ */
.v10-auth-demo {
  margin-top: 18px !important;
  text-align: center !important;
}
.v10-auth-demo summary {
  cursor: pointer !important;
  font-size: 12px !important;
  color: #64748b !important;
  list-style: none !important;
  padding: 6px !important;
  user-select: none !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
}
.v10-auth-demo summary::-webkit-details-marker { display: none !important; }
.v10-auth-demo summary::before { content: "🔑" !important; }
.v10-auth-demo summary::after {
  content: "▾" !important;
  transition: transform 0.2s !important;
}
.v10-auth-demo[open] summary::after {
  transform: rotate(180deg) !important;
}
.v10-auth-demo-chips {
  display: flex !important;
  gap: 6px !important;
  margin-top: 8px !important;
  justify-content: center !important;
  flex-wrap: wrap !important;
}
.v10-auth-demo-chip {
  padding: 6px 12px !important;
  border-radius: 20px !important;
  background: #f1f5f9 !important;
  border: 1px solid #e2e8f0 !important;
  font-size: 11.5px !important;
  font-weight: 600 !important;
  color: #475569 !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}
.v10-auth-demo-chip:hover:not(:disabled) {
  background: #2634d5 !important;
  color: #fff !important;
  border-color: #2634d5 !important;
}

/* ============ FIELDSET (cho MSSV block) ============ */
.v10-auth-fieldset {
  border: 0 !important;
  padding: 0 !important;
  margin: 14px 0 0 !important;
  display: block !important;
  min-width: 0 !important;
}

/* ============ SPINNER ============ */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spin { animation: spin 1s linear infinite; }

/* ============ DARK MODE ============ */
html.dark-mode .v10-auth-card {
  background: #111a2b !important;
  border-color: #1e293b !important;
  box-shadow: 0 25px 70px rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.3) !important;
  color: #f1f5f9 !important;
}
html.dark-mode .v10-auth-title { color: #f1f5f9 !important; }
html.dark-mode .v10-auth-subtitle { color: #94a3b8 !important; }
html.dark-mode .v10-auth-label { color: #cbd5e1 !important; }
html.dark-mode .v10-auth-field {
  background: #0b1220 !important;
  border-color: #1e293b !important;
}
html.dark-mode .v10-auth-field input { color: #f1f5f9 !important; }
html.dark-mode .v10-auth-field:focus-within {
  background: #0b1220 !important;
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.15) !important;
}
html.dark-mode .v10-auth-field:focus-within .v10-auth-field-icon {
  color: #38bdf8 !important;
}
html.dark-mode .v10-auth-social-btn {
  background: #0b1220 !important;
  border-color: #1e293b !important;
}
html.dark-mode .v10-auth-social-btn:hover {
  border-color: #38bdf8 !important;
  background: #1e293b !important;
}
html.dark-mode .v10-auth-row label { color: #cbd5e1 !important; }
html.dark-mode .v10-auth-row a { color: #60a5fa !important; }
html.dark-mode .v10-auth-divider { color: #64748b !important; }
html.dark-mode .v10-auth-divider::before,
html.dark-mode .v10-auth-divider::after {
  background: #334155 !important;
}
html.dark-mode .v10-auth-bottom { color: #94a3b8 !important; }
html.dark-mode .v10-auth-bottom a { color: #60a5fa !important; }
html.dark-mode .v10-auth-demo-chip {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #cbd5e1 !important;
}
html.dark-mode .v10-auth-demo summary { color: #94a3b8 !important; }
html.dark-mode .v10-auth-check { color: #cbd5e1 !important; }

/* ============ MOBILE ============ */
@media (max-width: 480px) {
  .v10-auth-page { padding: 16px; }
  .v10-auth-card {
    padding: 28px 22px 24px !important;
    border-radius: 20px !important;
  }
  .v10-auth-title {
    font-size: 22px !important;
    margin-top: 16px !important;
  }
  .v10-auth-subtitle { margin-bottom: 16px !important; }
  .v10-auth-social-btn {
    height: 42px !important;
  }
  .v10-auth-social-btn svg {
    width: 18px !important;
    height: 18px !important;
  }}
`;