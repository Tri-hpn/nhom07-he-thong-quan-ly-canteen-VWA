// ============================================================
// OWNERINVENTORY.JSX — Quản lý kho nguyên liệu (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// 🔧 FIX #88: import history dùng Intl.DateTimeFormat cố định (VN, 24h)
// ============================================================

import { SkeletonTable } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus, Search, Pencil, Trash2, AlertTriangle, Package, History, X, Loader2, AlertCircle, PackageX, Boxes, Edit,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";

// ============================================================
// CONSTANTS
// ============================================================

const UNITS = ["kg", "g", "lít", "ml", "chai", "hộp", "cái", "phần"];

// ✅ Định mức: 1 kg → bao nhiêu phần ăn
const YIELD_PER_KG = {
  "gao": 10, "thit ga": 4, "thit bo": 3, "thit heo": 4,
  "ca": 4, "tom": 6, "bun": 8, "pho": 8, "mi": 8,
  "trung": 10, "rau": 5, "cai": 4, "ca chua": 6,
  "hanh": 20, "toi": 30, "ot": 40, "dau an": 20,
  "nuoc mam": 25, "muoi": 40, "duong": 30, "tieu": 50,
  "sua": 8, "ca phe": 20, "tra": 30, "chanh": 15,
  "khoai": 4, "khoai tay": 4, "banh mi": 4, "xoi": 6,
  "chao": 8, "dau": 6, "nam": 5, "bap": 4, "suon": 3,
};

// ✅ Món dùng nguyên liệu
const DISHES_USING = {
  "gao":      ["Cơm gà", "Cơm tấm sườn", "Cơm chiên dương châu", "Cơm rang thập cẩm"],
  "thit ga":  ["Cơm gà", "Phở gà", "Cháo gà", "Gà rán"],
  "thit bo":  ["Bún bò Huế", "Phở bò", "Cơm bò xào"],
  "thit heo": ["Cơm tấm sườn", "Bún chả", "Thịt kho"],
  "ca":       ["Cơm cá", "Bún cá", "Cháo cá"],
  "tom":      ["Cơm tôm", "Bún tôm", "Cháo tôm"],
  "bun":      ["Bún bò Huế", "Bún chả", "Bún riêu", "Bún cá"],
  "pho":      ["Phở bò", "Phở gà"],
  "mi":       ["Mì xào", "Mì nước", "Hủ tiếu"],
  "trung":    ["Cơm chiên dương châu", "Bánh mì trứng", "Trứng chiên"],
  "rau":      ["Cơm chiên", "Phở", "Bún", "Canh rau"],
  "ca chua":  ["Cơm chiên", "Canh cà chua", "Sốt cà"],
  "hanh":     ["Phở", "Bún", "Cơm tấm"],
  "dau an":   ["Các món xào, chiên"],
  "nuoc mam": ["Nêm, chấm các món"],
  "banh mi":  ["Bánh mì thịt", "Bánh mì trứng", "Bánh mì chả"],
  "xoi":      ["Xôi gà", "Xôi đậu", "Xôi xéo"],
  "chao":     ["Cháo gà", "Cháo cá", "Cháo tôm"],
  "ca phe":   ["Cà phê đen", "Cà phê sữa"],
  "tra":      ["Trà đào", "Trà chanh", "Trà sữa"],
  "chanh":    ["Nước chanh", "Trà chanh"],
  "khoai tay": ["Khoai tây chiên", "Khoai tây nghiền"],
  "cai":      ["Canh cải", "Dưa cải"],
  "toi":      ["Nêm tất cả món"],
  "ot":       ["Nêm món cay"],
  "muoi":     ["Nêm tất cả món"],
  "duong":    ["Nêm, pha chế"],
  "tieu":     ["Nêm tất cả món"],
  "sua":      ["Cà phê sữa", "Trà sữa", "Sinh tố"],
  "nam":      ["Canh nấm", "Nấm xào"],
  "bap":      ["Canh bắp", "Bắp luộc"],
  "suon":     ["Cơm tấm sườn", "Sườn nướng"],
};

function normalizeIngName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function getYield(name) {
  return YIELD_PER_KG[normalizeIngName(name)] || null;
}

function getDishesUsing(name) {
  return DISHES_USING[normalizeIngName(name)] || [];
}

const MODAL_Z = 2147483600;
const IMPORT_HISTORY_LIMIT = 30;

// 🔧 FIX #88: formatter cố định VN timezone, 24h
const DATETIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerInventory() {
  const { t } = useI18n();

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [imports, setImports] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const [q, setQ] = useState("");
  const [dishModal, setDishModal] = useState(null);

  const [modal, setModal] = useState(null);
  const [importModal, setImportModal] = useState(null);
  const [importQtyPreview, setImportQtyPreview] = useState("");
  const [importUnitCostPreview, setImportUnitCostPreview] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.inventory.list();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || t("Không tải được danh sách kho"));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadImports = useCallback(async () => {
    try {
      const data = await api.inventory.imports();
      setImports(Array.isArray(data) ? data : []);
    } catch {
      setImports([]);
    }
  }, []);

  useEffect(() => {
    load();
    loadImports();
  }, [load, loadImports]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (importModal && !saving) setImportModal(null);
      else if (modal && !saving) setModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, importModal, saving]);

  const importItem = useMemo(() => {
    if (!importModal) return null;
    return list.find((x) => x.code === importModal.code) || importModal;
  }, [importModal, list]);

  const filtered = useMemo(() => {
    if (!q.trim()) return list;
    const s = q.toLowerCase().trim();
    return list.filter(
      (x) =>
        x.name?.toLowerCase().includes(s) ||
        x.code?.toLowerCase().includes(s)
    );
  }, [list, q]);

  const stats = useMemo(() => {
    const out = list.filter((x) => x.qty === 0);
    const critical = list.filter((x) => x.qty > 0 && x.qty <= 5);
    const low = list.filter((x) => x.qty > 5 && x.qty < x.min);
    const ok = list.filter((x) => x.qty >= x.min);

    return {
      total: list.length,
      criticalCount: critical.length,
      lowCount: low.length,
      outCount: out.length,
      okCount: ok.length,
      criticalItems: critical,
      lowItems: low,
      outItems: out,
    };
  }, [list]);

  const alertCount = stats.criticalCount + stats.lowCount + stats.outCount;

  /**
   * ✅ FIX: Generate mã từ MAX của số đứng sau prefix NL.
   */
  const generateNextCode = () => {
    if (!list.length) return "NL001";

    const maxNum = list.reduce((max, x) => {
      const code = String(x.code || "");
      const match = code.match(/^NL(\d+)/i);
      if (!match) return max;
      const n = parseInt(match[1], 10) || 0;
      return n > max ? n : max;
    }, 0);

    return "NL" + String(maxNum + 1).padStart(3, "0");
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirm(null);
  };

  const runConfirm = async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmBusy(false);
    }
  };

  const saveItem = async (e) => {
    e.preventDefault();
    if (saving) return;

    const f = new FormData(e.currentTarget);
    const data = {
      code: (modal.code || f.get("code") || "").trim().toUpperCase(),
      name: f.get("name")?.trim(),
      qty: Number(f.get("qty")),
      unit: f.get("unit"),
      min: Number(f.get("min")),
    };

    if (!data.code) return toast(t("Vui lòng nhập mã nguyên liệu"), "error");
    if (!data.name) return toast(t("Vui lòng nhập tên nguyên liệu"), "error");
    if (data.qty < 0) return toast(t("Số lượng không được âm"), "error");
    if (data.min < 0) return toast(t("Mức tối thiểu không được âm"), "error");

    setSaving(true);
    try {
      if (modal.code) {
        await api.inventory.update(modal.code, data);
        toast(t("Đã cập nhật nguyên liệu"), "success");
      } else {
        await api.inventory.create(data);
        toast(t("Đã thêm nguyên liệu"), "success");
      }
      setModal(null);
      load();
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (code) => {
    const item = list.find((x) => x.code === code);
    if (!item) return;

    setConfirm({
      title: `${t("Xóa nguyên liệu")} "${item.name}"?`,
      message:
        `${t("Mã")} ${item.code} ${t("sẽ bị xóa vĩnh viễn khỏi kho.")} ` +
        t("Hành động này không thể hoàn tác."),
      confirmText: t("Xóa"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        try {
          await api.inventory.remove(code);
          toast(t("Đã xóa"), "success");
          setConfirm(null);
          load();
        } catch (e) {
          toast(e.message || t("Không xóa được"), "error");
        }
      },
    });
  };

  const doImport = async (e) => {
    e.preventDefault();
    if (saving) return;

    const f = new FormData(e.currentTarget);
    const qty = Number(f.get("qty"));

    if (!qty || qty <= 0) {
      return toast(t("Số lượng nhập phải lớn hơn 0"), "error");
    }

    setSaving(true);
    try {
      const res = await api.inventory.import(importItem.code, {
        unitCost: Number(f.get("unitCost")) || 0,
        qty,
        supplier: f.get("supplier")?.trim(),
        note: f.get("note")?.trim(),
      });
      const costMsg = res?.record?.cost ? " (" + res.record.cost.toLocaleString("vi-VN") + "đ)" : "";
      toast(
        `${t("Đã nhập")} ${res?.record?.qty ?? qty} ${importItem.unit}${costMsg}`,
        "success"
      );
      setImportQtyPreview("");
      setImportUnitCostPreview("");
      setImportModal(null);
      load();
      loadImports();
    } catch (e) {
      toast(e.message || t("Không nhập được"), "error");
    } finally {
      setSaving(false);
    }
  };

  const getStatusKey = (x) => {
    if (x.qty === 0) return "out";
    if (x.qty <= 5) return "critical";
    if (x.qty < x.min) return "low";
    return "ok";
  };

  const getStatusLabel = (key) => {
    if (key === "out") return t("Hết hàng");
    if (key === "critical") return t("Nguy cấp");
    if (key === "low") return t("Sắp hết");
    return t("Còn hàng");
  };

  // 🔧 FIX #88: helper format datetime VN
  const fmtImportTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return DATETIME_FORMATTER.format(d);
  };

  return (
    <>
      <div>
        {alertCount > 0 && (
          <div
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "#92400e",
              padding: "16px 20px",
              borderRadius: 12,
              marginBottom: 18,
            }}
          >
            <AlertTriangle size={20} style={{ flexShrink: 0 }} />
            <div>
              <b style={{ fontSize: 13, display: "block", marginBottom: 2 }}>
                ⚠️ {t("Cảnh báo tồn kho")}
              </b>
              <div style={{ fontSize: 12.5, opacity: 0.9 }}>
                {stats.criticalCount > 0 && (
                <span style={{ color: "#dc2626", fontWeight: 700 }}>
                  🚨 <b>{stats.criticalCount}</b> {t("nguyên liệu NGUY CẤP")}
                </span>
              )}
              {stats.criticalCount > 0 && (stats.outCount > 0 || stats.lowCount > 0) && " · "}

                {stats.outCount > 0 && (
                  <span>
                    <b>{stats.outCount}</b> {t("nguyên liệu đã hết hàng")}
                  </span>
                )}
                {stats.outCount > 0 && stats.lowCount > 0 && " · "}
                {stats.lowCount > 0 && (
                  <span>
                    <b>{stats.lowCount}</b> {t("nguyên liệu sắp hết")}
                  </span>
                )}
                .
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 20,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--card-bg, #fff)",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 10,
              padding: "10px 14px",
              flex: 1,
              minWidth: 240,
              maxWidth: 400,
            }}
          >
            <Search size={18} style={{ color: "var(--text-light, #8993a3)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Tìm nguyên liệu...")}
              style={{
                flex: 1,
                border: 0,
                outline: "none",
                fontSize: 13,
                background: "transparent",
                color: "var(--text-primary, #172033)",
              }}
            />
            {q && (
              <button
                onClick={() => setQ("")}
                style={{
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--text-light, #8993a3)",
                  padding: 2,
                }}
                aria-label={t("Xoá tìm kiếm")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowHistory(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--card-bg, #fff)",
              color: "var(--text-primary, #172033)",
              padding: "10px 16px",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <History size={16} /> {t("Lịch sử nhập")}
          </button>

          <button
            onClick={() => setModal({})}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#2634d5",
              color: "#fff",
              padding: "10px 16px",
              border: 0,
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <Plus size={16} /> {t("Thêm nguyên liệu")}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <StatBox label={t("Tổng nguyên liệu")} value={stats.total} color="#2634d5" icon={<Boxes size={18} />} />
          <StatBox label={t("Nguy cấp")}         value={stats.criticalCount} color="#dc2626" icon={<AlertTriangle size={18} />} />
          <StatBox label={t("Sắp hết")}          value={stats.lowCount} color="#f59e0b" icon={<AlertTriangle size={18} />} />
          <StatBox label={t("Hết hàng")}          value={stats.outCount} color="#ef4444" icon={<PackageX size={18} />} />
          <StatBox label={t("Đủ hàng")}           value={stats.okCount}  color="#18a967" icon={<Package size={18} />} />
        </div>

        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          {loading && (
            <SkeletonTable
              columns={7}
              rows={5}
              headers={[
                t("Mã"),
                t("Nguyên liệu"),
                t("Số lượng"),
                t("Đơn vị"),
                t("Tối thiểu"),
                t("Trạng thái"),
                t("Thao tác"),
              ]}
            />
          )}
          {!loading && error && (
            <ErrorBox message={error} onRetry={load} t={t} />
          )}

          {!loading && !error && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                    <th style={thStyle}>{t("Mã")}</th>
                    <th style={thStyle}>{t("Nguyên liệu")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>{t("Số lượng")}</th>
                    <th style={thStyle}>{t("Đơn vị")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>{t("Định lượng")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>{t("Tối thiểu")}</th>
                    <th style={thStyle}>{t("Trạng thái")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tác")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((x) => {
                    const statusKey = getStatusKey(x);
                    return (
                      <tr
                        key={x.code}
                        style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}
                      >
                        <td style={tdStyle}>
                          <b style={{ fontFamily: "monospace", fontSize: 12 }}>{x.code}</b>
                        </td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => setDishModal(x)}
                            title="Xem các món dùng nguyên liệu này"
                            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", color: "#2634d5", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, fontFamily: "inherit", fontSize: "inherit" }}
                          >
                            {x.name}
                          </button>
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "right",
                            fontWeight: 700,
                          }}
                        >
                          <span className={`inv-qty inv-qty--${statusKey}`}>
                            {x.qty}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: "var(--text-muted, #64748b)" }}>
                          {x.unit}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {(() => {
                            const yld = getYield(x.name);
                            if (!yld) return <span style={{ color: "var(--text-light, #94a3b8)" }}>—</span>;
                            const portions = Math.round(x.qty * yld);
                            return (
                              <span title={`1 ${x.unit} ${x.name} ≈ ${yld} phần`} style={{ color: "#2634d5", fontWeight: 700 }}>
                                ~{portions} phần
                              </span>
                            );
                          })()}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "right",
                            color: "var(--text-muted, #64748b)",
                          }}
                        >
                          {x.min}
                        </td>
                        <td style={tdStyle}>
                          <span className={`inv-badge inv-badge--${statusKey}`}>
                            {getStatusLabel(statusKey)}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              justifyContent: "flex-end",
                            }}
                          >
                            <IconButton
                              onClick={() => { setImportQtyPreview(""); setImportUnitCostPreview(""); setImportModal(x); }}
                              title={t("Nhập kho")}
                              color="#ffffff"
                              bg="#18a967"
                            >
                              <Package size={15} />
                            </IconButton>
                            <IconButton
                              onClick={() => setModal(x)}
                              title={t("Sửa")}
                            >
                              <Edit size={15} />
                            </IconButton>
                            <IconButton
                              onClick={() => removeItem(x.code)}
                              title={t("Xóa")}
                              color="#ef4444"
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!filtered.length && (
                    <tr>
                      <td
                        colSpan="8"
                        style={{
                          textAlign: "center",
                          padding: 40,
                          color: "var(--text-light, #8993a3)",
                        }}
                      >
                        <PackageX size={36} style={{ opacity: 0.35, marginBottom: 10 }} />
                        <div>
                          {q
                            ? `${t("Không có nguyên liệu khớp")} "${q}"`
                            : t("Chưa có nguyên liệu nào")}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showHistory && (
          <Modal onClose={() => setShowHistory(false)} maxWidth={900}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: "1px solid var(--border-color, #eef2f7)",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  color: "var(--text-primary, #172033)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 16,
                }}
              >
                <History size={20} />
                {t("Lịch sử nhập kho")} ({imports.length})
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--text-light, #8993a3)",
                  padding: 4,
                  display: "grid",
                  placeItems: "center",
                }}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            {imports.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: 40,
                  color: "var(--text-light, #8993a3)",
                  fontSize: 13,
                }}
              >
                {t("Chưa có lịch sử nhập kho")}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                      <th style={thStyle}>{t("Thời gian")}</th>
                      <th style={thStyle}>{t("Nguyên liệu")}</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>{t("SL nhập")}</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>{t("Chi phí")}</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Chi phí</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>{t("Tồn sau")}</th>
                      <th style={thStyle}>{t("Người nhập")}</th>
                      <th style={thStyle}>{t("Nhà cung cấp")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.slice(0, IMPORT_HISTORY_LIMIT).map((r) => (
                      <tr
                        key={r.id}
                        style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}
                      >
                        {/* 🔧 FIX #88: dùng formatter cố định VN */}
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                          {fmtImportTime(r.created_at)}
                        </td>
                        <td style={tdStyle}>
                          <b>{r.name}</b>{" "}
                          <span style={{ color: "var(--text-light, #94a3b8)", fontFamily: "monospace", fontSize: 11 }}>
                            ({r.code})
                          </span>
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "right",
                            color: "#18a967",
                            fontWeight: 700,
                          }}
                        >
                          +{r.qty} {r.unit}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#dc2626", fontWeight: 700 }}>
                          {r.cost ? r.cost.toLocaleString("vi-VN") + "đ" : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#dc2626", fontWeight: 700 }}>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {r.after} {r.unit}
                        </td>
                        <td style={tdStyle}>{r.imported_by}</td>
                        <td style={{ ...tdStyle, color: "var(--text-muted, #64748b)" }}>
                          {r.supplier || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {imports.length > IMPORT_HISTORY_LIMIT && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "10px 0",
                      fontSize: 12,
                      color: "var(--text-light, #8993a3)",
                    }}
                  >
                    {t("Hiển thị")} {IMPORT_HISTORY_LIMIT} / {imports.length} {t("bản ghi gần nhất")}
                  </div>
                )}
              </div>
            )}
          </Modal>
        )}

        {modal && (
          <Modal onClose={() => !saving && setModal(null)} maxWidth={480}>
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>
                {modal.code ? t("Sửa nguyên liệu") : t("Thêm nguyên liệu")}
              </h3>
              <button
                onClick={() => !saving && setModal(null)}
                style={modalCloseStyle}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveItem} autoComplete="off">
              <label style={labelStyle}>{t("Mã")} *</label>
              <input
                name="code"
                defaultValue={modal.code || generateNextCode()}
                required
                disabled={!!modal.code}
                style={{
                  ...inputStyle,
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  background: modal.code
                    ? "var(--bg-tertiary, #f5f7fb)"
                    : "var(--bg-secondary, #fff)",
                  cursor: modal.code ? "not-allowed" : "text",
                  opacity: modal.code ? 0.7 : 1,
                }}
                autoFocus={!modal.code}
              />

              <label style={labelStyle}>{t("Tên nguyên liệu")} *</label>
              <input
                name="name"
                defaultValue={modal.name || ""}
                required
                style={inputStyle}
                autoFocus={!!modal.code}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>{t("Số lượng")}</label>
                  <input
                    name="qty"
                    type="number"
                    min="0"
                    step="0.1"
                    defaultValue={modal.qty ?? 0}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t("Đơn vị")}</label>
                  <select
                    name="unit"
                    defaultValue={modal.unit || "kg"}
                    style={inputStyle}
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label style={labelStyle}>{t("Mức tối thiểu (cảnh báo khi dưới)")}</label>
              <input
                name="min"
                type="number"
                min="0"
                step="0.1"
                defaultValue={modal.min ?? ""}
                required
                style={inputStyle}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  disabled={saving}
                  style={{ ...btnCancelStyle, flex: 1 }}
                >
                  {t("Hủy")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ ...btnPrimaryStyle(saving), flex: 1, width: "auto" }}
                >
                  {saving ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                      {t("Đang lưu...")}
                    </>
                  ) : (
                    t("Lưu")
                  )}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {importItem && (
          <Modal onClose={() => !saving && setImportModal(null)} maxWidth={480}>
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>
                <Package size={20} style={{ color: "#18a967" }} /> {t("Nhập kho")}
              </h3>
              <button
                onClick={() => !saving && setImportModal(null)}
                style={modalCloseStyle}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                background: "var(--bg-tertiary, #f5f7fb)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <b>{importItem.name}</b>{" "}
                <span style={{ color: "var(--text-light, #94a3b8)", fontFamily: "monospace", fontSize: 11 }}>
                  ({importItem.code})
                </span>
              </div>
              <div style={{ color: "var(--text-muted, #64748b)" }}>
                {t("Tồn hiện tại")}:{" "}
                <b style={{ color: "var(--text-primary, #172033)" }}>
                  {importItem.qty} {importItem.unit}
                </b>
              </div>
            </div>

            <form onSubmit={doImport} autoComplete="off">
              <label style={labelStyle}>
                {t("Số lượng nhập")} ({importItem.unit}) *
              </label>
              <input
                name="qty"
                type="number"
                min="0.1"
                step="0.1"
                value={importQtyPreview}
                onChange={(e) => setImportQtyPreview(e.target.value)}
                placeholder={t("VD: 10")}
                required
                autoFocus
                style={{ ...inputStyle, fontSize: 14 }}
              />

              <label style={labelStyle}>Đơn giá (VNĐ/{importItem.unit})</label>
              <input
                name="unitCost"
                type="number"
                min="0"
                step="1000"
                value={importUnitCostPreview}
                onChange={(e) => setImportUnitCostPreview(e.target.value)}
                placeholder="VD: 50000"
                style={inputStyle}
              />

              {(Number(importQtyPreview) > 0 && Number(importUnitCostPreview) > 0) && (
                <div style={{
                  marginTop: 4,
                  marginBottom: 14,
                  padding: "10px 14px",
                  background: "rgba(24, 169, 103, 0.1)",
                  border: "1px solid rgba(24, 169, 103, 0.3)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#18a967",
                  fontWeight: 700,
                }}>
                  💰 {t("Chi phí nhập")}: {(Number(importQtyPreview) * Number(importUnitCostPreview)).toLocaleString("vi-VN")}đ
                </div>
              )}

              <label style={labelStyle}>{t("Nhà cung cấp")}</label>
              <input
                name="supplier"
                placeholder={t("VD: Công ty TNHH ABC")}
                style={inputStyle}
              />

              <label style={labelStyle}>{t("Ghi chú")}</label>
              <textarea
                name="note"
                placeholder={t("VD: Hàng tươi, nhập buổi sáng...")}
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setImportModal(null)}
                  disabled={saving}
                  style={{ ...btnCancelStyle, flex: 1 }}
                >
                  {t("Hủy")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...btnPrimaryStyle(saving),
                    background: saving ? "#94a3b8" : "#18a967",
                    flex: 1,
                    width: "auto",
                  }}
                >
                  {saving ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                      {t("Đang nhập...")}
                    </>
                  ) : (
                    <>
                      <Package size={14} /> {t("Nhập kho")}
                    </>
                  )}
                </button>
              </div>
            </form>
          </Modal>
        )}

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>

            {dishModal && (
        <DishModal item={dishModal} onClose={() => setDishModal(null)} />
      )}

{confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          cancelText={confirm.cancelText}
          danger={confirm.danger}
          loading={confirmBusy}
          onConfirm={runConfirm}
          onClose={closeConfirm}
        />
      )}
    </>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function DishModal({ item, onClose }) {
  if (!item) return null;
  const dishes = getDishesUsing(item.name);
  const yieldPerKg = getYield(item.name);
  const portions = yieldPerKg ? Math.round(item.qty * yieldPerKg) : null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: MODAL_Z, padding: 20, overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--card-bg, #fff)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "var(--text-primary, #172033)", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={20} style={{ color: "#2634d5" }} />
            Các món dùng "{item.name}"
          </h3>
          <button onClick={onClose} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-light, #8993a3)", padding: 4, display: "grid", placeItems: "center" }} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        <div style={{ background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
          <div style={{ marginBottom: 6 }}>
            <b>{item.name}</b>{" "}
            <span style={{ color: "var(--text-light, #94a3b8)", fontFamily: "monospace", fontSize: 11 }}>({item.code})</span>
          </div>
          <div style={{ color: "var(--text-muted, #64748b)" }}>
            Tồn kho: <b style={{ color: "var(--text-primary, #172033)" }}>{item.qty} {item.unit}</b>
            {portions !== null && (
              <span style={{ marginLeft: 8 }}>
                · Ước tính <b style={{ color: "#2634d5" }}>~{portions} phần</b>
              </span>
            )}
          </div>
        </div>

        {dishes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--text-light, #8993a3)", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, fontSize: 13 }}>
            Chưa có thông tin món dùng nguyên liệu này
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dishes.map((dish, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, fontSize: 13 }}>
                <span style={{ fontSize: 18 }}>🍽️</span>
                <b style={{ color: "var(--text-primary, #172033)" }}>{dish}</b>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          style={{ width: "100%", padding: 12, marginTop: 16, background: "#2634d5", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
function StatBox({ label, value, color, icon }) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        padding: 18,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 11,
          background: color + "18",
          color,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <span style={{ fontSize: 12, color: "var(--text-light, #8993a3)" }}>
          {label}
        </span>
        <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children, onClick, title,
  color = "var(--text-primary, #172033)",
  bg = "var(--card-bg, #fff)",
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        padding: 6,
        border: "1px solid " + (bg !== "var(--card-bg, #fff)" ? bg : "var(--border-color, #e5e9ef)"),
        borderRadius: 6,
        background: bg,
        cursor: "pointer",
        color,
        display: "grid",
        placeItems: "center",
        width: 30,
        height: 30,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function ErrorBox({ message, onRetry, t }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: 30,
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        borderRadius: 10,
        color: "#ef4444",
      }}
    >
      <AlertCircle size={26} style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {t("Không tải được dữ liệu")}
      </div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: onRetry ? 12 : 0 }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "8px 16px",
            background: "#ef4444",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {t("Thử lại")}
        </button>
      )}
    </div>
  );
}

function Modal({ children, onClose, maxWidth = 480 }) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        zIndex: MODAL_Z,
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================
// STYLE CONSTANTS
// ============================================================

const thStyle = {
  padding: 11,
  textAlign: "left",
  fontSize: 12,
  color: "var(--text-muted, #64748b)",
  fontWeight: 600,
};

const tdStyle = {
  padding: 11,
  fontSize: 13,
  color: "var(--text-primary, #172033)",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  marginTop: 12,
  color: "var(--text-muted, #475569)",
};

const inputStyle = {
  width: "100%",
  padding: 10,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  boxSizing: "border-box",
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

const btnPrimaryStyle = (disabled) => ({
  padding: 12,
  background: disabled ? "#94a3b8" : "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 13,
});

const btnCancelStyle = {
  padding: 12,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  background: "var(--card-bg, #fff)",
  cursor: "pointer",
  color: "var(--text-primary, #172033)",
  fontWeight: 600,
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};
