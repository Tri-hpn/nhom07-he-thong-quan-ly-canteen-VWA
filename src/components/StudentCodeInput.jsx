// ============================================================
// STUDENTCODEINPUT.JSX — Ô nhập MSSV + preview ngành/khoa
// ============================================================
// B7: replace() → object interpolation

import { useEffect, useRef, useState } from "react";
import { GraduationCap, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { api } from "../api";
import { useI18n } from "../hooks/useI18n";

export default function StudentCodeInput({
  value = "",
  onChange,
  disabled = false,
  required = false,
  placeholder,
  showPreview = true,
  existingCode = "",
  label,
}) {
  const { t } = useI18n();

  const [localValue, setLocalValue] = useState(value);
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchIdRef = useRef(0);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const isLocked = !!existingCode && existingCode === localValue;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const clean = localValue.trim();

    if (!clean) {
      setParsed(null);
      setError("");
      setLoading(false);
      return;
    }

    if (!/^\d{10}$/.test(clean)) {
      setParsed(null);
      setError(
        clean.length === 10
          ? t("MSSV chỉ được chứa chữ số")
          : t("MSSV phải có đúng 10 chữ số (còn {n} ký tự)", {
              n: String(10 - clean.length),
            })
      );
      setLoading(false);
      return;
    }

    setError("");
    setLoading(true);

    const myId = ++fetchIdRef.current;

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.school.parseStudent(clean);

        if (fetchIdRef.current !== myId) return;

        if (res?.valid) {
          setParsed(res);
          setError("");
          if (onChange) onChange(clean, res);
        } else {
          setParsed(null);
          setError(res?.note || t("MSSV không hợp lệ"));
          if (onChange) onChange(clean, null);
        }
      } catch (e) {
        if (fetchIdRef.current !== myId) return;
        setParsed(null);
        setError(e.message || t("Không tra cứu được MSSV"));
      } finally {
        if (fetchIdRef.current === myId) {
          setLoading(false);
        }
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue]);

  const handleInput = (e) => {
    if (isLocked) return;
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    setLocalValue(raw);
    if (parsed) setParsed(null);
    if (onChange && !raw) onChange("", null);
  };

  const handleClear = () => {
    if (isLocked) return;
    setLocalValue("");
    setParsed(null);
    setError("");
    if (onChange) onChange("", null);
  };

  const labelText = label || t("Mã số sinh viên (MSSV)");
  const placeholderText = placeholder || t("VD: 2374820202");
  const showSuccess = parsed?.valid && parsed?.mapped;
  const showWarning = parsed?.valid && !parsed?.mapped;

  return (
    <div className="sc-input">
      <label className="sc-label" htmlFor="student-code-input">
        {labelText}
        {required && <span className="sc-required"> *</span>}
        {isLocked && (
          <span className="sc-locked">
            <CheckCircle2 size={12} /> {t("Đã liên kết")}
          </span>
        )}
      </label>

      <div
        className={`sc-input-wrap ${
          error ? "sc-input-wrap--error" : ""
        } ${showSuccess ? "sc-input-wrap--success" : ""} ${
          isLocked ? "sc-input-wrap--locked" : ""
        }`}
      >
        <GraduationCap size={16} className="sc-input-icon" />
        <input
          id="student-code-input"
          type="text"
          value={localValue}
          onChange={handleInput}
          placeholder={placeholderText}
          disabled={disabled || isLocked}
          inputMode="numeric"
          maxLength={10}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error}
        />

        {loading && (
          <Loader2 size={16} className="sc-spin" aria-label={t("Đang tra cứu")} />
        )}

        {!loading && localValue && !isLocked && (
          <button
            type="button"
            onClick={handleClear}
            className="sc-clear-btn"
            aria-label={t("Xóa MSSV")}
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        )}

        {!loading && showSuccess && (
          <CheckCircle2 size={16} className="sc-icon-success" />
        )}
      </div>

      {error && (
        <div className="sc-hint sc-hint--error">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {isLocked && (
        <div className="sc-hint sc-hint--info">
          <AlertCircle size={13} />{" "}
          {t("MSSV đã liên kết với tài khoản này. Liên hệ admin nếu cần thay đổi.")}
        </div>
      )}

      {showPreview && showSuccess && (
        <div className="sc-preview">
          <div className="sc-preview-row">
            <span className="sc-preview-label">{t("Ngành")}:</span>
            <span className="sc-preview-value">{parsed.major_name}</span>
          </div>
          {parsed.faculty && (
            <div className="sc-preview-row">
              <span className="sc-preview-label">{t("Khoa")}:</span>
              <span className="sc-preview-value">{parsed.faculty}</span>
            </div>
          )}
          {parsed.year_in && (
            <div className="sc-preview-row">
              <span className="sc-preview-label">{t("Nhập học")}:</span>
              <span className="sc-preview-value">{parsed.year_in}</span>
            </div>
          )}
          {parsed.major_code_full && (
            <div className="sc-preview-row">
              <span className="sc-preview-label">{t("Mã ngành")}:</span>
              <span className="sc-preview-value sc-preview-value--muted">
                {parsed.major_code_full}
              </span>
            </div>
          )}
        </div>
      )}

      {showPreview && showWarning && (
        <div className="sc-hint sc-hint--warning">
          <AlertCircle size={13} />{" "}
          {parsed.note || t("Chưa xác định được ngành của MSSV này")}
        </div>
      )}
    </div>
  );
}