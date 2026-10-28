// ============================================================
// IMAGEUPLOADER.JSX — Upload ảnh với drag & drop (V2)
// ============================================================
// B7: bỏ namespace upload.* → source-text; replace() → object interpolation;
//     message 3MB qua t(); inline style thay global .spin class

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Image as ImageIcon, X, Loader2,
} from "lucide-react";
import { toast } from "./Effects";
import { useI18n } from "../hooks/useI18n";

const MAX_SIZE = 100 * 1024 * 1024;
const MAX_BASE64_SIZE = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const FALLBACK_PREVIEW =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
      <rect fill='#f5f7fb' width='100' height='100'/>
      <text x='50' y='58' font-size='40' text-anchor='middle'>🖼️</text>
    </svg>`
  );

const MAX_DIMENSION = 1280;
const QUALITY = 0.82;
const SKIP_COMPRESS_BELOW = 250 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("read-error"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode-error"));
    img.src = src;
  });
}

async function compressImageFile(file) {
  const original = await readFileAsDataUrl(file);
  if (typeof original !== "string") return original;

  const targetType =
    file.type === "image/png" || file.type === "image/webp"
      ? "image/webp"
      : "image/jpeg";

  try {
    const img = await loadImageElement(original);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return original;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
    if (scale === 1 && original.length < SKIP_COMPRESS_BELOW) return original;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return original;

    if (targetType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL(targetType, QUALITY);
    return out && out.startsWith("data:image/") && out.length < original.length
      ? out
      : original;
  } catch {
    return original;
  }
}

export default function ImageUploader({ value, onChange, label }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(value || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef(null);
  const mountedRef = useRef(true);

  const finalLabel = label || t("Tải ảnh lên");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setPreview(value || "");
    setError("");
  }, [value]);

  useEffect(() => {
    const handleBlur = () => setDragging(false);
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  const validateFile = useCallback(
    (file) => {
      if (!file) return { ok: false, msg: t("Vui lòng chọn một file ảnh") };

      const typeOk = ALLOWED_TYPES.includes(file.type);
      const extOk = ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

      if (!typeOk && !extOk) return { ok: false, msg: t("Chỉ chấp nhận ảnh JPG, PNG, WEBP") };

      if (file.size > MAX_SIZE) {
        const mb = (file.size / 1024 / 1024).toFixed(2);
        return { ok: false, msg: t("Ảnh quá lớn ({size}MB). Vui lòng chọn ảnh nhỏ hơn.", { size: mb }) };
      }
      return { ok: true };
    },
    [t]
  );

  const handleFile = useCallback(
    async (file) => {
      setError("");
      const check = validateFile(file);
      if (!check.ok) {
        setError(check.msg);
        toast(check.msg, "error");
        return;
      }

      setLoading(true);
      try {
        const dataUri = await compressImageFile(file);
        if (!mountedRef.current) return;

        if (typeof dataUri !== "string") {
          setError(t("Không đọc được file ảnh"));
          return;
        }

        // Chặn lỗi 413 Payload Too Large từ Vercel (body ~4.5MB)
        if (dataUri.length > MAX_BASE64_SIZE) {
          const mb = (dataUri.length / 1024 / 1024).toFixed(1);
          const msg = t("Ảnh sau khi nén vẫn quá lớn ({size}MB). Vui lòng chọn ảnh nhẹ hơn.", { size: mb });
          setError(msg);
          toast(msg, "error");
          return;
        }

        setPreview(dataUri);
        onChange?.(dataUri);
        toast(t("Tải ảnh thành công"), "success");
      } catch {
        if (!mountedRef.current) return;
        setError(t("Không đọc được file ảnh"));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [onChange, validateFile, t]
  );

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) toast(t("Chỉ chấp nhận 1 file. Đã chọn file đầu tiên."), "info");
    handleFile(files[0]);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    if (!dragging) setDragging(true);
  };

  const onDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragging(false);
  };

  const clear = () => {
    setPreview("");
    setError("");
    onChange?.("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const openPicker = () => {
    if (loading) return;
    inputRef.current?.click();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div style={{ margin: "10px 0 16px" }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-muted, #475569)" }}>
        {finalLabel}
      </label>

      <div
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        aria-label={preview ? t("Nhấn để đổi ảnh") : t("Chọn ảnh để tải lên")}
        style={{
          position: "relative",
          border: dragging ? "2px dashed #2634d5" : "2px dashed var(--border-color, #cbd5e1)",
          borderRadius: 12,
          padding: preview ? 0 : 24,
          textAlign: "center",
          cursor: loading ? "wait" : "pointer",
          background: dragging ? "rgba(38, 52, 213, 0.08)" : "var(--bg-tertiary, #f8fafc)",
          minHeight: 160,
          display: "grid",
          placeItems: "center",
          transition: "all 0.25s",
          overflow: "hidden",
          outline: "none",
        }}
        onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 4px rgba(38, 52, 213, 0.15)"; }}
        onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
      >
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "#2634d5" }}>
            <Loader2 size={28} style={{ animation: "imgUploaderSpin 1s linear infinite" }} />
            <span style={{ fontSize: 13 }}>{t("Đang xử lý ảnh...")}</span>
          </div>
        ) : preview ? (
          <>
            <img
              src={preview}
              alt={t("Xem trước ảnh")}
              onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_PREVIEW; }}
              style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 10, display: "block" }}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clear(); }}
              aria-label={t("Xóa ảnh")}
              title={t("Xóa ảnh")}
              style={{ position: "absolute", top: 8, right: 8, background: "#ef4444", color: "#fff", border: 0, width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 8px rgba(239, 68, 68, 0.4)", transition: "transform 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", color: "var(--text-muted, #64748b)" }}>
            <ImageIcon size={32} style={{ color: dragging ? "#2634d5" : "var(--text-light, #94a3b8)" }} />
            <b style={{ color: "var(--text-primary, #172033)", fontSize: 14 }}>{t("Kéo thả ảnh hoặc nhấn để chọn")}</b>
            <span style={{ fontSize: 12 }}>{t("JPG, PNG, WEBP · Tối đa 100MB")}</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onInputChange}
        aria-label={t("Chọn ảnh để tải lên")}
        tabIndex={-1}
        style={{ display: "none" }}
      />

      {error && (
        <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8, padding: "8px 12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <X size={14} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <style>{`
        @keyframes imgUploaderSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}