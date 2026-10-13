// ============================================================
// useVoiceAnnouncer.js — Hook quản lý giọng đọc TTS
// ============================================================
// V1 (2026-10): Quản lý speechSynthesis API
// V2 (2026-10):
//   - 🔧 FIX L14: tách startTimerRef (delay khởi tạo) và
//     repeatTimerRef (auto-repeat) — trước đây dùng chung 1 ref
//     nên stop() chỉ clear được 1 trong 2, gây đọc lặp ngoài ý muốn.
//   - stop() clear cả 2 timer.
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

// ============================================================
// HELPERS
// ============================================================

function loadConfig() {
  try {
    const raw = localStorage.getItem(LS_VOICE_CONFIG);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(cfg) {
  try {
    localStorage.setItem(LS_VOICE_CONFIG, JSON.stringify(cfg));
  } catch {}
}

function isSpeechSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
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

    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch (e) {
    console.warn("[Voice] Chime error:", e.message);
  }
}

// ============================================================
// MAIN HOOK
// ============================================================

export function useVoiceAnnouncer() {
  const [config, setConfigState] = useState(loadConfig);
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(isSpeechSupported);

  const configRef = useRef(config);
  // 🔧 FIX L14: tách 2 timer
  const startTimerRef = useRef(null);   // delay trước khi bắt đầu đọc (chờ chuông)
  const repeatTimerRef = useRef(null);  // auto-repeat sau khi đọc xong
  const utteranceRef = useRef(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // ---------- Load voices ----------
  useEffect(() => {
    if (!supported) return;

    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices() || [];
      setVoices(list);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      try {
        window.speechSynthesis.onvoiceschanged = null;
      } catch {}
    };
  }, [supported]);

  // ---------- Chọn voice phù hợp ----------
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
      const female = viVoices.find((v) =>
        /linh|hoai|female|nu/i.test(v.name)
      );
      return female || viVoices[0];
    }

    return voices[0];
  }, [voices]);

  // 🔧 FIX L14: clear cả 2 timer
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

  // ---------- Cancel all ----------
  const stop = useCallback(() => {
    if (!supported) return;
    cancelTimers();
    try {
      window.speechSynthesis.cancel();
    } catch {}
    setSpeaking(false);
  }, [supported, cancelTimers]);

  // ---------- Speak core ----------
  const speak = useCallback(
    (text, { repeat = true } = {}) => {
      if (!supported || !text) return;
      if (!configRef.current.enabled) return;

      // Clear timer cũ trước khi bắt đầu
      cancelTimers();

      try {
        window.speechSynthesis.cancel();
      } catch {}

      const cfg = configRef.current;

      if (cfg.chime) {
        playChime();
      }

      const delay = cfg.chime ? 480 : 0;

      // 🔧 FIX L14: dùng startTimerRef riêng
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
            // 🔧 FIX L14: dùng repeatTimerRef riêng
            repeatTimerRef.current = setTimeout(() => {
              repeatTimerRef.current = null;
              speak(text, { repeat: true });
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

  // ---------- Update config ----------
  const setConfig = useCallback((updater) => {
    setConfigState((prev) => {
      const next =
        typeof updater === "function"
          ? updater(prev)
          : { ...prev, ...updater };
      saveConfig(next);
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfigState(DEFAULT_CONFIG);
    saveConfig(DEFAULT_CONFIG);
  }, []);

  // ---------- Cleanup on unmount ----------
  useEffect(() => {
    return () => {
      cancelTimers();
      try {
        window.speechSynthesis.cancel();
      } catch {}
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