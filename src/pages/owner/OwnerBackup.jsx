// ============================================================
// OWNERBACKUP.JSX — Sao lưu / Phục hồi / Reset database
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download, Upload, AlertTriangle, Database, RefreshCw, HardDrive, CheckCircle2, Loader2, X,
} from "lucide-react";
import { api, getToken } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { SkeletonStats } from "../../components/Skeleton";

// ============================================================
// CONSTANTS
// ============================================================

// Các trường quan trọng hiển thị to trên grid 4 cột
const PRIMARY_STATS = [
  { key: "users",       color: "#2634d5" },
  { key: "menu_items",  color: "#18a967" },
  { key: "orders",      color: "#f59e0b" },
  { key: "inventory",   color: "#8b5cf6" },
  { key: "toppings",    color: "#ec4899" },
  { key: "reviews",     color: "#14b8a6" },
  { key: "vouchers",    color: "#f97316" },
  { key: "attendances", color: "#06b6d4" },
  { key: "imports",     color: "#84cc16" },
  { key: "price_history", color: "#a855f7" },
  { key: "notifications", color: "#ef4444" },
  { key: "messages",    color: "#3b82f6" },
];

const CONFIRM_PHRASE = "RESET";   // Phải gõ đúng để reset
const MAX_FILE_SIZE = 10 * 1024 * 1024;   // 10MB

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerBackup() {
  const { t } = useI18n();

  // Labels dịch — useMemo vì phụ thuộc t
  const STAT_LABELS = useMemo(
    () => ({
      users:               t("Người dùng"),
      customers:           t("Khách hàng"),
      employees:           t("Nhân viên"),
      menu_items:          t("Món ăn"),
      orders:              t("Đơn hàng"),
      inventory:           t("Kho hàng"),
      toppings:            t("Topping"),
      sizes:               t("Kích cỡ"),
      reviews:             t("Đánh giá"),
      vouchers:            t("Voucher"),
      notifications:       t("Thông báo"),
      messages:            t("Tin nhắn"),
      attendances:         t("Chấm công"),
      imports:             t("Nhập kho"),
      price_history:       t("Lịch sử giá"),
      categories:          t("Danh mục"),
      wallets:             t("Ví"),
      wallet_transactions: t("Giao dịch ví"),
      shifts:              t("Ca làm"),
    }),
    [t]
  );

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Loading riêng cho từng action
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Preview dữ liệu trước khi import
  const [importPreview, setImportPreview] = useState(null);
  const [importStats, setImportStats] = useState(null);

  // Reset modal
  const [resetModal, setResetModal] = useState(false);
  const [resetInput, setResetInput] = useState("");

  const fileRef = useRef();

  // ---------- Load stats ----------

  const loadStats = async () => {
  // 🔧 FIX: guard chống 401 spam khi session hết hạn
  if (!getToken()) {
    setStatsLoading(false);
    return;
  }
  setStatsLoading(true);
  try {
    const data = await api.backup.stats();
    setStats(data);
  } catch {
    // Không hiện toast để tránh spam khi mở trang
  } finally {
    setStatsLoading(false);
  }
  };

  useEffect(() => {
    loadStats();
  }, []);

  // Đóng reset modal bằng ESC
  useEffect(() => {
    if (!resetModal) return;
    const handler = (e) => {
      if (e.key === "Escape" && !resetting) closeResetModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resetModal, resetting]);

  // ---------- Handlers ----------

  const closeResetModal = () => {
    setResetModal(false);
    setResetInput("");
  };

  // ============================================================
  // EXPORT
  // ============================================================

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const backup = await api.backup.export();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `canteen-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast(t("Đã xuất file backup"), "success");
    } catch (e) {
      toast(e.message || t("Không xuất được file"), "error");
    } finally {
      setExporting(false);
    }
  };

  // ============================================================
  // IMPORT
  // ============================================================

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast(t("Chỉ chấp nhận file .json"), "error");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast(t("File quá lớn (tối đa 10MB)"), "error");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const data = parsed.data || parsed;

        if (!data || typeof data !== "object") {
          throw new Error(t("File không phải JSON hợp lệ"));
        }
        if (!data.users || !Array.isArray(data.users)) {
          throw new Error(t("File thiếu trường 'users'"));
        }
        if (!data.menu_items || !Array.isArray(data.menu_items)) {
          throw new Error(t("File thiếu trường 'menu_items'"));
        }

        setImportPreview({
          data,
          fileName: file.name,
          fileSize: file.size,
          counts: {
            users: data.users?.length || 0,
            menu_items: data.menu_items?.length || 0,
            orders: data.orders?.length || 0,
            inventory: data.inventory?.length || 0,
          },
        });
      } catch (err) {
        toast(`${t("File không hợp lệ:")} ${err.message}`, "error");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!importPreview || importing) return;
    setImporting(true);
    try {
      const res = await api.backup.import({
        data: importPreview.data,
      });
      setImportStats(res.stats || importPreview.counts);
      setImportPreview(null);
      toast(t("Import thành công! Dữ liệu đã được khôi phục."), "success");
      loadStats();
    } catch (e) {
      toast(e.message || t("Import thất bại"), "error");
    } finally {
      setImporting(false);
    }
  };

  // ============================================================
  // RESET
  // ============================================================

  const handleReset = async () => {
    if (resetInput.trim().toUpperCase() !== CONFIRM_PHRASE) {
      toast(`${t("Vui lòng gõ")} "${CONFIRM_PHRASE}" ${t("để xác nhận")}`, "error");
      return;
    }
    if (resetting) return;

    setResetting(true);
    try {
      await api.backup.reset(CONFIRM_PHRASE);
      toast(t("Đã reset database về dữ liệu mẫu"), "success");
      closeResetModal();
      setImportStats(null);
      loadStats();
    } catch (e) {
      toast(e.message || t("Reset thất bại"), "error");
    } finally {
      setResetting(false);
    }
  };

  // ---------- Utils ----------

  const fmtSize = (bytes) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div>
      {/* CẢNH BÁO AN TOÀN */}
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          color: "#92400e",
          padding: "16px 20px",
          borderRadius: 12,
          marginBottom: 18,
        }}
      >
        <AlertTriangle size={22} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <b style={{ fontSize: 14, display: "block", marginBottom: 4 }}>
            ⚠️ {t("Lưu ý về backup")}
          </b>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, opacity: 0.95 }}>
            {t("File backup chứa")} <b>{t("toàn bộ dữ liệu")}</b>: {t("users (có mật khẩu đã hash), thực đơn, đơn hàng, kho, tin nhắn... Chỉ dùng để")}{" "}
            <b>{t("khôi phục trên server của bạn")}</b> — {t("không chia sẻ công khai.")}
          </div>
        </div>
      </div>

      {/* 3 ACTION CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <ActionCard
          icon={<Download size={28} />}
          title={t("Xuất backup")}
          desc={t("Tải file JSON toàn bộ dữ liệu về máy")}
          color="#18a967"
          onClick={handleExport}
          loading={exporting}
          buttonText={t("Tải xuống")}
          t={t}
        />
        <ActionCard
          icon={<Upload size={28} />}
          title={t("Import backup")}
          desc={t("Khôi phục dữ liệu từ file JSON có sẵn")}
          color="#2634d5"
          onClick={() => fileRef.current?.click()}
          loading={importing}
          buttonText={t("Chọn file")}
          t={t}
        />
        <ActionCard
          icon={<RefreshCw size={28} />}
          title={t("Reset database")}
          desc={t("Xoá hết và tạo lại dữ liệu mẫu ban đầu")}
          color="#ef4444"
          onClick={() => setResetModal(true)}
          loading={resetting}
          buttonText={t("Reset")}
          danger
          t={t}
        />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* DATABASE STATS */}
      <div
        style={{
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              margin: 0,
              color: "var(--text-primary, #172033)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Database size={20} /> {t("Dung lượng database")}
          </h3>
          <button
            onClick={loadStats}
            disabled={statsLoading}
            style={{
              padding: "6px 12px",
              background: "var(--bg-tertiary, #f5f7fb)",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 6,
              cursor: statsLoading ? "not-allowed" : "pointer",
              fontSize: 12,
              color: "var(--text-primary, #172033)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              opacity: statsLoading ? 0.6 : 1,
            }}
          >
            <RefreshCw
              size={13}
              style={{
                animation: statsLoading ? "spin 1s linear infinite" : "none",
              }}
            />
            {statsLoading ? t("Đang tải...") : t("Làm mới")}
          </button>
        </div>

        {/* Skeleton khi loading */}
        {statsLoading && !stats && (
          <SkeletonStats count={4} columns="repeat(auto-fit, minmax(140px, 1fr))" />
        )}

        {/* Empty state */}
        {!stats && !statsLoading && (
          <div
            style={{
              textAlign: "center",
              padding: 30,
              color: "var(--text-light, #8993a3)",
              fontSize: 13,
            }}
          >
            {t("Không tải được thông tin database")}
          </div>
        )}

        {stats && (
          <>
            {/* Hero card */}
            <div
              style={{
                background: "linear-gradient(135deg, #2634d5, #20c779)",
                color: "#fff",
                borderRadius: 12,
                padding: 20,
                marginBottom: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ fontSize: 13, opacity: 0.9 }}>
                  {t("Tổng dung lượng")}
                </span>
                <div style={{ fontSize: 32, fontWeight: 800, margin: "6px 0" }}>
                  {fmtSize(stats.db_size_bytes)}
                </div>
              </div>
              <HardDrive size={48} style={{ opacity: 0.3 }} />
            </div>

            {/* Grid thống kê */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
              }}
            >
              {PRIMARY_STATS.map(({ key, color }) => (
                <StatItem
                  key={key}
                  label={STAT_LABELS[key] || key}
                  value={stats[key] ?? 0}
                  sub={
                    key === "users" && stats.customers !== undefined
                      ? `${stats.customers} ${t("KH")} · ${stats.employees} ${t("NV")}`
                      : null
                  }
                  color={color}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* IMPORT RESULT */}
      {importStats && (
        <div
          style={{
            background: "rgba(24, 169, 103, 0.1)",
            border: "1px solid rgba(24, 169, 103, 0.3)",
            borderRadius: 12,
            padding: 20,
            marginTop: 20,
          }}
        >
          <h3
            style={{
              marginTop: 0,
              color: "#18a967",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 15,
            }}
          >
            <CheckCircle2 size={20} /> {t("Import thành công")}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 12,
              fontSize: 13,
            }}
          >
            {Object.entries(importStats).map(([key, value]) => (
              <div
                key={key}
                style={{
                  background: "var(--bg-tertiary, #f8fafc)",
                  padding: 10,
                  borderRadius: 8,
                  color: "var(--text-primary, #172033)",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-light, #8993a3)",
                  }}
                >
                  {STAT_LABELS[key] || key}
                </span>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setImportStats(null)}
            style={{
              marginTop: 12,
              background: "transparent",
              border: 0,
              color: "#18a967",
              cursor: "pointer",
              fontSize: 12,
              textDecoration: "underline",
            }}
          >
            {t("Ẩn kết quả")}
          </button>
        </div>
      )}

      {/* IMPORT PREVIEW MODAL */}
      {importPreview && (
        <div
          onClick={() => !importing && setImportPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("Xác nhận import")}
          style={modalOverlayStyle}
        >
          <div onClick={(e) => e.stopPropagation()} style={modalBoxStyle}>
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>
                <Upload size={20} /> {t("Xác nhận import")}
              </h3>
              <button
                onClick={() => !importing && setImportPreview(null)}
                style={modalCloseStyle}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                background: "var(--bg-tertiary, #f5f7fb)",
                padding: 14,
                borderRadius: 10,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <b>{t("File:")}</b> {importPreview.fileName}
              </div>
              <div style={{ color: "var(--text-muted, #64748b)" }}>
                {t("Kích thước:")} {fmtSize(importPreview.fileSize)}
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-muted, #64748b)",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {t("Dữ liệu trong file")}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 10,
                marginBottom: 16,
              }}
            >
              {Object.entries(importPreview.counts).map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    padding: 10,
                    background: "var(--bg-tertiary, #f8fafc)",
                    borderRadius: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-light, #8993a3)",
                      display: "block",
                    }}
                  >
                    {STAT_LABELS[key] || key}
                  </span>
                  <b style={{ fontSize: 16 }}>{value}</b>
                </div>
              ))}
            </div>

            <div
              style={{
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                padding: 12,
                borderRadius: 8,
                fontSize: 12.5,
                color: "#92400e",
                marginBottom: 16,
              }}
            >
              ⚠️ {t("Dữ liệu hiện tại sẽ được")} <b>{t("backup tự động")}</b> {t("trước khi thay thế.")}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setImportPreview(null)}
                disabled={importing}
                style={btnCancelStyle}
              >
                {t("Hủy")}
              </button>
              <button
                onClick={confirmImport}
                disabled={importing}
                style={btnPrimaryStyle(importing)}
              >
                {importing ? (
                  <>
                    <Loader2
                      size={14}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    {t("Đang import...")}
                  </>
                ) : (
                  <>
                    <Upload size={14} /> {t("Xác nhận import")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET MODAL */}
      {resetModal && (
        <div
          onClick={() => !resetting && closeResetModal()}
          role="dialog"
          aria-modal="true"
          aria-label={t("Xác nhận reset")}
          style={modalOverlayStyle}
        >
          <div onClick={(e) => e.stopPropagation()} style={modalBoxStyle}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
              }}
            >
              <AlertTriangle size={30} />
            </div>

            <h3
              style={{
                marginTop: 0,
                marginBottom: 8,
                textAlign: "center",
                color: "var(--text-primary, #172033)",
              }}
            >
              {t("Xác nhận Reset Database")}
            </h3>

            <p
              style={{
                color: "var(--text-muted, #64748b)",
                fontSize: 13,
                textAlign: "center",
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              {t("Tất cả dữ liệu sẽ bị")} <b style={{ color: "#ef4444" }}>{t("XÓA VĨNH VIỄN")}</b>{" "}
              {t("và thay thế bằng dữ liệu mẫu ban đầu.")}
            </p>

            <div
              style={{
                background: "var(--bg-tertiary, #f5f7fb)",
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 12,
                color: "var(--text-muted, #64748b)",
              }}
            >
              💡 {t("File backup tự động sẽ được lưu trước khi reset.")}
            </div>

            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-muted, #475569)",
                marginBottom: 6,
              }}
            >
              {t("Gõ")} <b style={{ color: "#ef4444" }}>{CONFIRM_PHRASE}</b> {t("để xác nhận")}
            </label>
            <input
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoFocus
              disabled={resetting}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "2px solid var(--border-color, #e5e9ef)",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                textAlign: "center",
                letterSpacing: 3,
                fontFamily: "monospace",
                outline: "none",
                marginBottom: 16,
                background: "var(--bg-secondary, #fff)",
                color: "var(--text-primary, #172033)",
                textTransform: "uppercase",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#ef4444";
                e.target.style.boxShadow = "0 0 0 4px rgba(239, 68, 68, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--border-color, #e5e9ef)";
                e.target.style.boxShadow = "none";
              }}
              onKeyDown={(e) => e.key === "Enter" && handleReset()}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={closeResetModal}
                disabled={resetting}
                style={btnCancelStyle}
              >
                {t("Hủy")}
              </button>
              <button
                onClick={handleReset}
                disabled={
                  resetting ||
                  resetInput.trim().toUpperCase() !== CONFIRM_PHRASE
                }
                style={{
                  ...btnPrimaryStyle(resetting),
                  background:
                    resetInput.trim().toUpperCase() === CONFIRM_PHRASE
                      ? "#ef4444"
                      : "#94a3b8",
                }}
              >
                {resetting ? (
                  <>
                    <Loader2
                      size={14}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    {t("Đang reset...")}
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} /> {t("Reset ngay")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: ActionCard
// ============================================================

function ActionCard({
  icon, title, desc, color, onClick,
  loading, buttonText, danger = false, t,
}) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        padding: 20,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: color + "20",
          color,
          display: "grid",
          placeItems: "center",
          marginBottom: 14,
        }}
      >
        {icon}
      </div>
      <h4
        style={{
          margin: "0 0 6px",
          color: "var(--text-primary, #172033)",
          fontSize: 15,
        }}
      >
        {title}
      </h4>
      <p
        style={{
          margin: "0 0 14px",
          color: "var(--text-muted, #64748b)",
          fontSize: 12,
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        {desc}
      </p>
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          width: "100%",
          padding: 10,
          background: color,
          color: "#fff",
          border: 0,
          borderRadius: 8,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {loading ? (
          <>
            <Loader2
              size={14}
              style={{ animation: "spin 1s linear infinite" }}
            />
            {t("Đang xử lý...")}
          </>
        ) : danger ? (
          <>
            <AlertTriangle size={14} /> {buttonText}
          </>
        ) : (
          buttonText
        )}
      </button>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: StatItem
// ============================================================

function StatItem({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: "var(--bg-tertiary, #f8fafc)",
        borderRadius: 10,
        padding: 12,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--text-light, #8993a3)",
          display: "block",
        }}
      >
        {label}
      </span>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color,
          marginTop: 2,
        }}
      >
        {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: "var(--text-light, #8993a3)",
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SHARED STYLES
// ============================================================

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  display: "grid",
  placeItems: "center",
  zIndex: 2147483600,
  padding: 20,
  overflowY: "auto",
};

const modalBoxStyle = {
  background: "var(--card-bg, #fff)",
  borderRadius: 14,
  padding: 24,
  width: "100%",
  maxWidth: 480,
  maxHeight: "90vh",
  overflowY: "auto",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const modalTitleStyle = {
  margin: 0,
  color: "var(--text-primary, #172033)",
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const modalCloseStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 4,
  display: "grid",
  placeItems: "center",
};

const btnCancelStyle = {
  flex: 1,
  padding: 12,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  background: "var(--card-bg, #fff)",
  cursor: "pointer",
  color: "var(--text-primary, #172033)",
  fontWeight: 600,
  fontSize: 13,
};

const btnPrimaryStyle = (loading) => ({
  flex: 1,
  padding: 12,
  background: "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 600,
  cursor: loading ? "not-allowed" : "pointer",
  opacity: loading ? 0.6 : 1,
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
});