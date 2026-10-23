// ============================================================
// useVoiceAnnouncer.js — Hook quản lý giọng đọc TTS
// ============================================================
// V3 (2026-10):
//   - 🔧 FIX: recursive speak() dùng speakRef — tránh dùng closure
//     cũ (pickVoice stale khi voices cập nhật async).
//   - 🔧 FIX: dùng chung 1 AudioContext (module-level) thay vì tạo
//     mới mỗi lần playChime (Chrome giới hạn 6 context).
//   - Giữ fix L14: tách startTimerRef / repeatTimerRef.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

const LS_VOICE_CONFIG = "vwa_voice_config";

const DEFAULT_CONFIG = {
  enabled: true,
  voiceName: "",
  rate: 0.9,
  pitch: 1.0,
  volume: 1.0,
  chime: true,
  repeatAfter: 30,
  lang: "vi-VN",
};

// ---------- Helpers ----------
function loadConfig() {
  try {
    const raw = localStorage.getItem(LS_VOICE_CONFIG);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch { return DEFAULT_CONFIG; }
}
function saveConfig(cfg) {
  try { localStorage.setItem(LS_VOICE_CONFIG, JSON.stringify(cfg)); } catch {}
}
function isSpeechSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

// 🔧 Dùng chung 1 AudioContext cho mọi lần chime
let sharedAudioCtx = null;
function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    try { sharedAudioCtx = new AC(); } catch { return null; }
  }
  return sharedAudioCtx;
}

function playChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Autoplay policy: cần resume nếu suspended
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const notes = [
      { freq: 1046.5, time: 0 },
      { freq: 1318.5, time: 0.18 },
    ];

    notes.forEach(({ freq, time }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + time);
      gain.gain.exponentialRampToValueAtTime(0.3, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + time + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + time);
      osc.stop(now + time + 0.4);
    });
  } catch (e) {
    console.warn("[Voice] Chime error:", e.message);
  }
}

// ---------- Main hook ----------
export function useVoiceAnnouncer() {
  const [config, setConfigState] = useState(loadConfig);
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(isSpeechSupported);

  const configRef = useRef(config);
  const startTimerRef = useRef(null);
  const repeatTimerRef = useRef(null);
  const utteranceRef = useRef(null);
  // 🔧 Ref cho speak để đệ quy an toàn
  const speakRef = useRef(null);

  useEffect(() => { configRef.current = config; }, [config]);

  // Load voices
  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => {
      try { setVoices(window.speechSynthesis.getVoices() || []); } catch {}
    };
    loadVoices();
    try { window.speechSynthesis.onvoiceschanged = loadVoices; } catch {}
    return () => {
      try { window.speechSynthesis.onvoiceschanged = null; } catch {}
    };
  }, [supported]);

  const pickVoice = useCallback(() => {
    if (!voices.length) return null;
    const cfg = configRef.current;
    if (cfg.voiceName) {
      const found = voices.find((v) => v.name === cfg.voiceName);
      if (found) return found;
    }
    const viVoices = voices.filter((v) =>
      String(v.lang || "").toLowerCase().startsWith("vi")
    );
    if (viVoices.length) {
      const female = viVoices.find((v) => /linh|hoai|female|nu/i.test(v.name));
      return female || viVoices[0];
    }
    return voices[0];
  }, [voices]);

  const cancelTimers = useCallback(() => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    if (repeatTimerRef.current) {
      clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (!supported) return;
    cancelTimers();
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  }, [supported, cancelTimers]);

  const speak = useCallback(
    (text, { repeat = true } = {}) => {
      if (!supported || !text) return;
      if (!configRef.current.enabled) return;

      cancelTimers();
      try { window.speechSynthesis.cancel(); } catch {}

      const cfg = configRef.current;
      if (cfg.chime) playChime();
      const delay = cfg.chime ? 480 : 0;

      startTimerRef.current = setTimeout(() => {
        startTimerRef.current = null;

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = cfg.lang || "vi-VN";
        utter.rate = Math.max(0.1, Math.min(2, cfg.rate || 0.9));
        utter.pitch = Math.max(0, Math.min(2, cfg.pitch || 1));
        utter.volume = Math.max(0, Math.min(1, cfg.volume ?? 1));

        const voice = pickVoice();
        if (voice) utter.voice = voice;

        utter.onstart = () => setSpeaking(true);
        utter.onend = () => {
          setSpeaking(false);
          const after = Number(cfg.repeatAfter) || 0;
          if (repeat && after > 0) {
            repeatTimerRef.current = setTimeout(() => {
              repeatTimerRef.current = null;
              // 🔧 FIX: dùng speakRef — luôn là speak mới nhất
              if (speakRef.current) speakRef.current(text, { repeat: true });
            }, after * 1000);
          }
        };
        utter.onerror = (e) => {
          setSpeaking(false);
          console.warn("[Voice] Speech error:", e.error);
        };

        utteranceRef.current = utter;
        try {
          window.speechSynthesis.speak(utter);
        } catch (e) {
          console.warn("[Voice] speak error:", e.message);
          setSpeaking(false);
        }
      }, delay);
    },
    [supported, pickVoice, cancelTimers]
  );

  // 🔧 Cập nhật ref mỗi khi speak thay đổi
  useEffect(() => { speakRef.current = speak; }, [speak]);

  const setConfig = useCallback((updater) => {
    setConfigState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      saveConfig(next);
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfigState(DEFAULT_CONFIG);
    saveConfig(DEFAULT_CONFIG);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelTimers();
      try { window.speechSynthesis.cancel(); } catch {}
    };
  }, [cancelTimers]);

  return {
    supported,
    speaking,
    voices,
    config,
    setConfig,
    resetConfig,
    speak,
    stop,
    playChime,
  };
}

export default useVoiceAnnouncer;