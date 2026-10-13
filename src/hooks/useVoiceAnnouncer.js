// ============================================================
// useVoiceAnnouncer.js — Hook quản lý giọng đọc TTS
// ============================================================
// V1 (2026-10):
//   - Quản lý speechSynthesis API
//   - Chọn giọng theo lang (vi-VN ưu tiên)
//   - Queue: chờ đọc xong mới đọc câu tiếp
//   - Âm thanh chuông "ting ting" trước khi đọc
//   - Cấu hình: rate, pitch, volume, voice
//   - Persist vào localStorage
//   - Check browser support
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

const LS_VOICE_CONFIG = "vwa_voice_config";

const DEFAULT_CONFIG = {
  enabled: true,
  voiceName: "",        // rỗng = auto chọn vi-VN
  rate: 0.9,            // tốc độ 0.1 → 10 (0.9 = hơi chậm)
  pitch: 1.0,           // cao độ 0 → 2
  volume: 1.0,          // âm lượng 0 → 1
  chime: true,          // có chuông trước không
  repeatAfter: 30,      // 0 = không lặp, giây
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

/**
 * Sinh âm thanh "ting ting" bằng Web Audio API
 * Không cần file mp3
 */
function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // 2 nốt "ting ting" (nốt C6 rồi E6)
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

    // Auto close sau 1s
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

  // Ref để tránh stale closure trong timeout
  const configRef = useRef(config);
  const repeatTimerRef = useRef(null);
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

    // Chrome cần đợi event onvoiceschanged
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

    // 1. Nếu user chọn voice cụ thể
    if (cfg.voiceName) {
      const found = voices.find((v) => v.name === cfg.voiceName);
      if (found) return found;
    }

    // 2. Ưu tiên voice vi-VN
    const viVoices = voices.filter((v) =>
      String(v.lang || "").toLowerCase().startsWith("vi")
    );
    if (viVoices.length) {
      // Ưu tiên nữ trước
      const female = viVoices.find((v) =>
        /linh|hoai|female|nu/i.test(v.name)
      );
      return female || viVoices[0];
    }

    // 3. Fallback: bất kỳ voice nào
    return voices[0];
  }, [voices]);

  // ---------- Cancel repeat timer ----------
  const cancelRepeat = useCallback(() => {
    if (repeatTimerRef.current) {
      clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  // ---------- Cancel all ----------
  const stop = useCallback(() => {
    if (!supported) return;
    cancelRepeat();
    try {
      window.speechSynthesis.cancel();
    } catch {}
    setSpeaking(false);
  }, [supported, cancelRepeat]);

  // ---------- Speak core ----------
  const speak = useCallback(
    (text, { repeat = true } = {}) => {
      if (!supported || !text) return;
      if (!configRef.current.enabled) return;

      // Cancel utterance cũ
      try {
        window.speechSynthesis.cancel();
      } catch {}

      const cfg = configRef.current;

      // 1. Phát chuông trước
      if (cfg.chime) {
        playChime();
      }

      // 2. Đợi chuông xong mới đọc (~450ms)
      const delay = cfg.chime ? 480 : 0;

      const mainTimer = setTimeout(() => {
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

          // 3. Tự động đọc lại sau N giây
          const after = Number(cfg.repeatAfter) || 0;
          if (repeat && after > 0) {
            repeatTimerRef.current = setTimeout(() => {
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

      // Lưu timer vào ref để cancel được
      repeatTimerRef.current = mainTimer;
    },
    [supported, pickVoice]
  );

  // ---------- Update config ----------
  const setConfig = useCallback((updater) => {
    setConfigState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
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
      cancelRepeat();
      try {
        window.speechSynthesis.cancel();
      } catch {}
    };
  }, [cancelRepeat]);

  return {
    supported,
    speaking,
    voices,
    config,
    setConfig,
    resetConfig,
    speak,
    stop,
    // Tiện ích
    playChime,
  };
}

export default useVoiceAnnouncer;