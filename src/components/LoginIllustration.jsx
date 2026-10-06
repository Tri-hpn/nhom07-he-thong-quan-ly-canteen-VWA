// ============================================================
// LOGINILLUSTRATION.JSX — Illustration cho trang Login (V2)
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX #65: useBlink cleanup không clear timer khi unmount giữa chừng
//                 → track timeout IDs trong mảng + clear hết khi unmount
//   - Giữ nguyên toàn bộ illustration
// ============================================================

import { useEffect, useState } from "react";

// ============================================================
// HOOK: useBlink (V2 - FIXED)
// ============================================================

function useBlink(disabled) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (disabled) {
      setBlinking(false);
      return;
    }

    // 🔧 FIX #65: track tất cả timer IDs để clear đúng cách
    const timers = [];
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      const t1 = setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        const t2 = setTimeout(() => {
          if (cancelled) return;
          setBlinking(false);
          schedule();
        }, 180);
        timers.push(t2);
      }, 1500 + Math.random() * 4000);
      timers.push(t1);
    };

    schedule();

    return () => {
      cancelled = true;
      // 🔧 FIX #65: clear hết timers
      timers.forEach((id) => clearTimeout(id));
      timers.length = 0;
    };
  }, [disabled]);

  return blinking;
}

// ============================================================
// BACKGROUND — Trường VWA
// ============================================================

function VWASchool() {
  return (
    <g opacity="0.4">
      <g transform="translate(120, 280)">
        <rect x="-5" y="-40" width="10" height="50" fill="#78350F" />
        <circle cx="0" cy="-60" r="32" fill="#16A34A" />
        <circle cx="-20" cy="-45" r="22" fill="#22C55E" />
        <circle cx="20" cy="-45" r="22" fill="#22C55E" />
        <circle cx="0" cy="-80" r="22" fill="#22C55E" />
      </g>

      <g transform="translate(680, 280)">
        <rect x="-5" y="-40" width="10" height="50" fill="#78350F" />
        <circle cx="0" cy="-60" r="32" fill="#16A34A" />
        <circle cx="-20" cy="-45" r="22" fill="#22C55E" />
        <circle cx="20" cy="-45" r="22" fill="#22C55E" />
        <circle cx="0" cy="-80" r="22" fill="#22C55E" />
      </g>

      <g transform="translate(240, 260)">
        <rect x="-2" y="-110" width="4" height="120" fill="#D1D5DB" />
        <polygon points="2,-108 48,-98 2,-88" fill="#DC2626" />
        <polygon points="10,-102 10,-94 18,-98" fill="#FCD34D" />
      </g>

      <g transform="translate(560, 260)">
        <rect x="-2" y="-110" width="4" height="120" fill="#D1D5DB" />
        <polygon points="2,-108 48,-98 2,-88" fill="#DC2626" />
        <polygon points="10,-102 10,-94 18,-98" fill="#FCD34D" />
      </g>

      <g transform="translate(400, 240)">
        <polygon points="-140,-50 0,-100 140,-50" fill="#DC2626" />
        <polygon points="-140,-50 -130,-42 130,-42 140,-50" fill="#991B1B" />

        <rect x="-130" y="-42" width="260" height="110" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />

        <rect x="-110" y="-25" width="26" height="26" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" />
        <rect x="-75" y="-25" width="26" height="26" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" />
        <rect x="49" y="-25" width="26" height="26" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" />
        <rect x="84" y="-25" width="26" height="26" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" />

        <rect x="-110" y="-70" width="26" height="22" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" />
        <rect x="-75" y="-70" width="26" height="22" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" />
        <rect x="49" y="-70" width="26" height="22" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" />
        <rect x="84" y="-70" width="26" height="22" fill="#93C5FD" stroke="#1E40AF" strokeWidth="1.5" />

        <rect x="-22" y="15" width="44" height="53" fill="#7C2D12" />
        <rect x="-22" y="15" width="22" height="53" fill="#92400E" />
        <circle cx="14" cy="45" r="2.5" fill="#FBBF24" />

        <rect x="-55" y="-38" width="110" height="12" fill="#1F2937" rx="2" />
        <text
          x="0"
          y="-29"
          textAnchor="middle"
          fontSize="8"
          fill="#FCD34D"
          fontWeight="bold"
          fontFamily="Arial, sans-serif"
        >
          CANTEEN VWA
        </text>
      </g>
    </g>
  );
}

function SkyBackground() {
  return (
    <g>
      <defs>
        <linearGradient id="loginSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#DBEAFE" />
          <stop offset="100%" stopColor="#E0F2FE" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="800" height="360" fill="url(#loginSky)" />

      <circle cx="730" cy="55" r="32" fill="#FEF3C7" opacity="0.6" />
      <circle cx="730" cy="55" r="22" fill="#FCD34D" opacity="0.9" />

      <g fill="#FFFFFF" opacity="0.8">
        <ellipse cx="120" cy="55" rx="42" ry="18" />
        <ellipse cx="150" cy="48" rx="30" ry="22" />
        <ellipse cx="88" cy="60" rx="28" ry="14" />
      </g>
      <g fill="#FFFFFF" opacity="0.75">
        <ellipse cx="600" cy="75" rx="36" ry="16" />
        <ellipse cx="628" cy="68" rx="26" ry="20" />
      </g>
      <g fill="#FFFFFF" opacity="0.7">
        <ellipse cx="380" cy="40" rx="30" ry="12" />
        <ellipse cx="400" cy="36" rx="22" ry="16" />
      </g>

      <rect x="0" y="360" width="800" height="60" fill="#BBF7D0" />
      <rect x="0" y="360" width="800" height="3" fill="#86EFAC" />
    </g>
  );
}

// ============================================================
// CHARACTERS
// ============================================================

function getEyeMode(mode, blinking) {
  if (mode === "idle") {
    return blinking ? "closed" : "open";
  }
  return mode;
}

function Robot({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const closed = eyeState !== "open";
  const armsUp = eyeState === "che";

  return (
    <g transform="translate(70, 320)">
      <line x1="14" y1="0" x2="14" y2="-20" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <line x1="38" y1="0" x2="38" y2="-20" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="14" cy="2" rx="6" ry="3" fill="#10B981" />
      <ellipse cx="38" cy="2" rx="6" ry="3" fill="#10B981" />

      <rect x="0" y="-90" width="52" height="70" rx="10" fill="#3B82F6" />

      <line x1="26" y1="-90" x2="26" y2="-100" stroke="#1F2937" strokeWidth="2" />
      <circle cx="26" cy="-102" r="4" fill="#10B981" />

      {closed ? (
        <>
          <path d="M 10 -66 Q 16 -70 22 -66" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 30 -66 Q 36 -70 42 -66" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="16" cy="-65" r="5" fill="#fff" />
          <circle cx="36" cy="-65" r="5" fill="#fff" />
          <circle cx="16" cy="-65" r="2.5" fill="#1F2937" />
          <circle cx="36" cy="-65" r="2.5" fill="#1F2937" />
        </>
      )}

      <rect x="18" y="-48" width="16" height="4" rx="2" fill="#1F2937" />

      {armsUp ? (
        <>
          <line x1="0" y1="-60" x2="14" y2="-67" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="52" y1="-60" x2="38" y2="-67" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="0" y1="-60" x2="-15" y2="-35" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="52" y1="-60" x2="67" y2="-35" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function Cat({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const closed = eyeState !== "open";

  return (
    <g transform="translate(150, 320)">
      <line x1="-10" y1="0" x2="-10" y2="-18" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <line x1="10" y1="0" x2="10" y2="-18" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />

      <path d="M 22 -25 Q 42 -30 45 -55 Q 46 -70 38 -72" stroke="#F59E0B" strokeWidth="6" fill="none" strokeLinecap="round" />

      <ellipse cx="0" cy="-30" rx="24" ry="22" fill="#FBBF24" />

      <circle cx="0" cy="-70" r="26" fill="#FBBF24" />

      <polygon points="-22,-85 -18,-105 -6,-90" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5" />
      <polygon points="-18,-88 -15,-100 -8,-90" fill="#FCA5A5" />
      <polygon points="22,-85 18,-105 6,-90" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5" />
      <polygon points="18,-88 15,-100 8,-90" fill="#FCA5A5" />

      {closed ? (
        <>
          <path d="M -14 -72 Q -9 -76 -4 -72" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 4 -72 Q 9 -76 14 -72" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="-9" cy="-70" rx="3" ry="5" fill="#1F2937" />
          <ellipse cx="9" cy="-70" rx="3" ry="5" fill="#1F2937" />
        </>
      )}

      <polygon points="0,-62 -3,-59 3,-59" fill="#EC4899" />
      <path d="M 0 -59 Q -4 -54 -8 -56" stroke="#1F2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M 0 -59 Q 4 -54 8 -56" stroke="#1F2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      <line x1="-22" y1="-62" x2="-34" y2="-66" stroke="#1F2937" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="-22" y1="-59" x2="-34" y2="-59" stroke="#1F2937" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="22" y1="-62" x2="34" y2="-66" stroke="#1F2937" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="22" y1="-59" x2="34" y2="-59" stroke="#1F2937" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  );
}

function PinkSquare({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const closed = eyeState !== "open";
  const armsUp = eyeState === "che";

  return (
    <g transform="translate(230, 320)">
      <line x1="25" y1="0" x2="25" y2="-30" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <line x1="55" y1="0" x2="55" y2="-30" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="25" cy="2" rx="8" ry="4" fill="#10B981" />
      <ellipse cx="55" cy="2" rx="8" ry="4" fill="#10B981" />

      <rect x="0" y="-115" width="80" height="85" rx="35" fill="#F472B6" />

      <path d="M 5 -100 Q 15 -115 30 -107 Q 45 -120 60 -107 Q 75 -115 75 -95" fill="#047857" />

      {closed ? (
        <>
          <path d="M 19 -73 Q 25 -78 31 -73" stroke="#1F2937" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 49 -73 Q 55 -78 61 -73" stroke="#1F2937" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="25" cy="-73" r="4.5" fill="#1F2937" />
          <circle cx="55" cy="-73" r="4.5" fill="#1F2937" />
          <circle cx="26" cy="-74" r="1.5" fill="#fff" />
          <circle cx="56" cy="-74" r="1.5" fill="#fff" />
        </>
      )}

      <circle cx="15" cy="-60" r="5" fill="#FCA5A5" opacity="0.6" />
      <circle cx="65" cy="-60" r="5" fill="#FCA5A5" opacity="0.6" />

      <path d="M 30 -55 Q 40 -47 50 -55" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {armsUp ? (
        <>
          <line x1="0" y1="-85" x2="25" y2="-73" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="80" y1="-85" x2="55" y2="-73" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="0" y1="-85" x2="-12" y2="-60" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="80" y1="-85" x2="92" y2="-60" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function GreenBlob({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const isWink = eyeState === "nhay";
  const closed = eyeState !== "open" && !isWink;

  return (
    <g transform="translate(310, 320)">
      <ellipse cx="0" cy="-15" rx="8" ry="12" fill="#10B981" />
      <ellipse cx="70" cy="-15" rx="8" ry="12" fill="#10B981" />

      <ellipse cx="35" cy="-35" rx="38" ry="32" fill="#34D399" />

      {isWink ? (
        <>
          <path d="M 18 -38 Q 24 -42 30 -38" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <circle cx="46" cy="-38" r="3.5" fill="#1F2937" />
        </>
      ) : closed ? (
        <>
          <path d="M 18 -38 Q 24 -42 30 -38" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 40 -38 Q 46 -42 52 -38" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="24" cy="-38" r="3.5" fill="#1F2937" />
          <circle cx="46" cy="-38" r="3.5" fill="#1F2937" />
        </>
      )}

      <path d="M 28 -25 Q 35 -20 42 -25" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />

      {eyeState === "che" ? (
        <>
          <line x1="5" y1="-30" x2="24" y2="-38" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="65" y1="-30" x2="46" y2="-38" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="5" y1="-30" x2="-14" y2="-15" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="65" y1="-30" x2="84" y2="-15" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function OrangeCircle({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const isHalf = eyeState === "nua";
  const closed = eyeState !== "open" && !isHalf;

  return (
    <g transform="translate(390, 320)">
      <line x1="20" y1="0" x2="20" y2="-30" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <line x1="42" y1="0" x2="42" y2="-30" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="20" cy="2" rx="7" ry="3.5" fill="#10B981" />
      <ellipse cx="42" cy="2" rx="7" ry="3.5" fill="#10B981" />

      <circle cx="31" cy="-60" r="30" fill="#FB923C" />

      <path d="M 3 -75 Q 15 -88 31 -84 Q 47 -88 59 -75" fill="#1F2937" />

      {isHalf ? (
        <>
          <circle cx="20" cy="-60" r="3.5" fill="#1F2937" />
          <path d="M 37 -60 Q 42 -64 47 -60" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      ) : closed ? (
        <>
          <path d="M 15 -60 Q 20 -64 25 -60" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 37 -60 Q 42 -64 47 -60" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="20" cy="-60" r="3.5" fill="#1F2937" />
          <circle cx="42" cy="-60" r="3.5" fill="#1F2937" />
        </>
      )}

      <ellipse cx="31" cy="-44" rx="6" ry="5" fill="#1F2937" />

      {isHalf ? (
        <>
          <line x1="2" y1="-60" x2="20" y2="-60" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="60" y1="-60" x2="68" y2="-35" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : eyeState === "che" ? (
        <>
          <line x1="2" y1="-60" x2="20" y2="-60" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="60" y1="-60" x2="42" y2="-60" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="2" y1="-60" x2="-8" y2="-35" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="60" y1="-60" x2="70" y2="-35" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function Star({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const closed = eyeState !== "open";
  const armsUp = eyeState === "che";

  return (
    <g transform="translate(465, 320)">
      <line x1="18" y1="0" x2="18" y2="-56" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <line x1="42" y1="0" x2="42" y2="-56" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />

      <path
        d="M 30 -140 L 40 -110 L 72 -108 L 46 -88 L 55 -56 L 30 -74 L 5 -56 L 14 -88 L -12 -108 L 20 -110 Z"
        fill="#FBBF24"
        stroke="#F59E0B"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {closed ? (
        <>
          <path d="M 13 -108 Q 19 -113 25 -108" stroke="#1F2937" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 35 -108 Q 41 -113 47 -108" stroke="#1F2937" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="19" cy="-108" r="3" fill="#1F2937" />
          <circle cx="41" cy="-108" r="3" fill="#1F2937" />
        </>
      )}

      <path d="M 20 -95 Q 30 -85 40 -95" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {armsUp ? (
        <>
          <line x1="5" y1="-88" x2="19" y2="-108" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="55" y1="-88" x2="41" y2="-108" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="5" y1="-88" x2="-8" y2="-60" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="55" y1="-88" x2="68" y2="-60" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function PurpleTriangle({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const closed = eyeState !== "open";

  return (
    <g transform="translate(550, 320)">
      <line x1="15" y1="0" x2="15" y2="-20" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <line x1="45" y1="0" x2="45" y2="-20" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="15" cy="2" rx="6" ry="3" fill="#10B981" />
      <ellipse cx="45" cy="2" rx="6" ry="3" fill="#10B981" />

      <polygon points="30,-90 60,-20 0,-20" fill="#A78BFA" stroke="#8B5CF6" strokeWidth="2" strokeLinejoin="round" />

      {closed ? (
        <>
          <path d="M 17 -45 Q 22 -49 27 -45" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 33 -45 Q 38 -49 43 -45" stroke="#1F2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="22" cy="-45" r="3" fill="#1F2937" />
          <circle cx="38" cy="-45" r="3" fill="#1F2937" />
        </>
      )}

      <path d="M 25 -35 Q 30 -30 35 -35" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />

      {eyeState === "che" ? (
        <>
          <line x1="5" y1="-45" x2="22" y2="-45" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="55" y1="-45" x2="38" y2="-45" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="5" y1="-45" x2="0" y2="-30" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="55" y1="-45" x2="60" y2="-30" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function Dog({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const closed = eyeState !== "open";
  const armsUp = eyeState === "che";

  return (
    <g transform="translate(625, 320)">
      <line x1="-10" y1="0" x2="-10" y2="-20" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <line x1="10" y1="0" x2="10" y2="-20" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />

      <path d="M 22 -25 Q 35 -35 35 -50" stroke="#92400E" strokeWidth="6" fill="none" strokeLinecap="round" />

      <ellipse cx="0" cy="-30" rx="25" ry="22" fill="#D97706" />

      <circle cx="0" cy="-70" r="26" fill="#D97706" />

      <ellipse cx="-24" cy="-62" rx="8" ry="18" fill="#92400E" />
      <ellipse cx="24" cy="-62" rx="8" ry="18" fill="#92400E" />

      {closed ? (
        <>
          <path d="M -14 -72 Q -9 -76 -4 -72" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 4 -72 Q 9 -76 14 -72" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="-9" cy="-70" r="3" fill="#1F2937" />
          <circle cx="9" cy="-70" r="3" fill="#1F2937" />
        </>
      )}

      <ellipse cx="0" cy="-60" rx="4" ry="3" fill="#1F2937" />
      <path d="M 0 -57 L 0 -52" stroke="#1F2937" strokeWidth="1.5" />
      <path d="M -4 -52 Q 0 -46 4 -52" fill="#F472B6" stroke="#1F2937" strokeWidth="1" />

      {armsUp ? (
        <>
          <line x1="-22" y1="-45" x2="-9" y2="-70" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="22" y1="-45" x2="9" y2="-70" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="-22" y1="-45" x2="-30" y2="-22" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
          <line x1="22" y1="-45" x2="30" y2="-22" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function Cupcake({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const isHalf = eyeState === "nua";
  const closed = eyeState !== "open" && !isHalf;

  return (
    <g transform="translate(700, 320)">
      <polygon
        points="-25,-25 25,-25 18,0 -18,0"
        fill="#D97706"
        stroke="#92400E"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line x1="-22" y1="-18" x2="22" y2="-18" stroke="#B45309" strokeWidth="1" />
      <line x1="-20" y1="-11" x2="20" y2="-11" stroke="#B45309" strokeWidth="1" />

      <ellipse cx="0" cy="-30" rx="28" ry="14" fill="#F472B6" />
      <ellipse cx="0" cy="-42" rx="22" ry="12" fill="#F9A8D4" />
      <ellipse cx="0" cy="-52" rx="15" ry="9" fill="#FBCFE8" />

      <circle cx="0" cy="-63" r="6" fill="#DC2626" />
      <line x1="0" y1="-69" x2="3" y2="-75" stroke="#166534" strokeWidth="1.5" strokeLinecap="round" />

      {isHalf ? (
        <>
          <circle cx="-8" cy="-42" r="2.5" fill="#1F2937" />
          <path d="M 4 -42 Q 8 -45 12 -42" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : closed ? (
        <>
          <path d="M -11 -42 Q -8 -45 -5 -42" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 5 -42 Q 8 -45 11 -42" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="-8" cy="-42" r="2.5" fill="#1F2937" />
          <circle cx="8" cy="-42" r="2.5" fill="#1F2937" />
        </>
      )}

      <path d="M -5 -35 Q 0 -30 5 -35" stroke="#1F2937" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {isHalf ? (
        <>
          <line x1="-28" y1="-30" x2="-8" y2="-42" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="-30" x2="38" y2="-15" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : eyeState === "che" ? (
        <>
          <line x1="-28" y1="-30" x2="-8" y2="-42" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="-30" x2="8" y2="-42" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="-28" y1="-30" x2="-38" y2="-15" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="-30" x2="38" y2="-15" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function Ghost({ mode }) {
  const blinking = useBlink(mode !== "idle");
  const eyeState = getEyeMode(mode, blinking);
  const isWink = eyeState === "nhay";
  const closed = eyeState !== "open" && !isWink;

  return (
    <g transform="translate(200, 180)">
      <path
        d="M -18 20 Q -18 -8 0 -8 Q 18 -8 18 20 L 18 32 L 12 28 L 6 32 L 0 28 L -6 32 L -12 28 L -18 32 Z"
        fill="#1F2937"
      />

      {isWink ? (
        <>
          <circle cx="-6" cy="8" r="2.5" fill="#fff" />
          <path d="M 2 8 Q 5 5 8 8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : closed ? (
        <>
          <path d="M -8 8 Q -6 5 -4 8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M 4 8 Q 6 5 8 8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="-6" cy="8" r="2.5" fill="#fff" />
          <circle cx="6" cy="8" r="2.5" fill="#fff" />
        </>
      )}
    </g>
  );
}

// ============================================================
// WRAPPER
// ============================================================

export default function CuteCharacters({ peeking }) {
  const mode = (name) => (peeking ? name : "idle");

  return (
    <svg
      viewBox="0 0 800 420"
      width="100%"
      style={{ maxWidth: 800, display: "block" }}
      aria-hidden="true"
    >
      <SkyBackground />
      <VWASchool />

      <Ghost mode={mode("nhay")} />
      <Robot mode={mode("che")} />
      <Cat mode={mode("nham")} />
      <PinkSquare mode={mode("che")} />
      <GreenBlob mode={mode("nhay")} />
      <OrangeCircle mode={mode("nua")} />
      <Star mode={mode("che")} />
      <PurpleTriangle mode={mode("nham")} />
      <Dog mode={mode("che")} />
      <Cupcake mode={mode("nua")} />
    </svg>
  );
}