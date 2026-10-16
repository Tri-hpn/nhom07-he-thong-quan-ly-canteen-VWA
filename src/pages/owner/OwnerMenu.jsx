// ============================================================
// OWNERMENU.JSX — Quản lý thực đơn + danh mục (Admin)
// ============================================================
// Layout: Card ngang (Mẫu A) giống hệt EmployeeMenu
//   - Time Slots (khung giờ) ở đầu trang
//   - Toolbar: search + filter + 2 nút chính
//   - Grid card ngang: ảnh 96px + info + actions
//   - Pagination 12 món/trang
//   - Modals: Thêm/Sửa món, Quản lý danh mục
//
// 🔧 Admin có quyền (khác nhân viên):
//   - Toggle "Tắt món" (active = 0) — riêng admin
//   - Nút Sửa (mở modal edit)
//   - Nút Xoá vĩnh viễn (api.menu.remove)
//
// ✅ THÊM: Checkbox "Món Signature"
// 🔧 FIX #89: t() truyền vars thay vì .replace("{password}", ...)
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus, Minus, Search, Pencil, Trash2, FolderPlus, Folder, X, Save,
  Loader2, AlertCircle, UtensilsCrossed, EyeOff, Eye, Star, Clock,
  Sunrise, Sun, Sunset, RotateCcw, Edit, CheckCircle2, Package, Ban,
  Power, ChevronLeft, ChevronRight, Flame,
  ChevronDown } from "lucide-react";
import { SkeletonTable } from "../../components/Skeleton";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import ConfirmDialog from "../../components/ConfirmDialog";
import ImageUploader from "../../components/ImageUploader";

// ✅ i18n hook
import { useI18n } from "../../hooks/useI18n";

// ============================================================
// CONSTANTS
// ============================================================

const MODAL_Z = 2147483600;
const DEFAULT_CATEGORY_ICON = "🍽️";
const MAX_DISCOUNT = 90;
const MAX_STOCK = 100;
const LOW_STOCK_THRESHOLD = 10;
const PAGE_SIZE = 12;

// Time slot sessions
const SESSIONS = [
  { id: "morning",   label: "Buổi sáng",  icon: Sunrise, color: "#f59e0b", from: "07:00", to: "11:00" },
  { id: "noon",      label: "Buổi trưa",  icon: Sun,     color: "#2634d5", from: "11:00", to: "14:00" },
  { id: "afternoon", label: "Buổi chiều", icon: Sunset,  color: "#8b5cf6", from: "14:00", to: "18:30" },
];

function getSessionId(startTime) {
  const [h] = String(startTime || "").split(":").map(Number);
  if (h >= 7 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "noon";
  if (h >= 14 && h < 19) return "afternoon";
  return "other";
}

const DEBUG = import.meta.env.DEV;
function dbg(...args) {
  if (DEBUG) console.log("[OwnerMenu]", ...args);
}

function getFALLBACK_IMG() {
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='#f5f7fb' width='100' height='100'/><text x='50' y='58' font-size='40' text-anchor='middle'>🍽️</text></svg>`
    )
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerMenu() {
  const { t, tData } = useI18n();

  // ---------- Menu list state ----------
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("");

  // ---------- Pagination ----------
  const [page, setPage] = useState(1);

  // ---------- Time slots state ----------
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState("");
  const [openSlots, setOpenSlots] = useState(false);
  const [togglingSlotId, setTogglingSlotId] = useState(null);
  const [confirmSlotReset, setConfirmSlotReset] = useState(false);
  const [resettingSlots, setResettingSlots] = useState(false);

  // ---------- Categories ----------
  const [categories, setCategories] = useState([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [catForm, setCatForm] = useState({
    name: "",
    icon: DEFAULT_CATEGORY_ICON,
    order: "",
  });
  const [editingCat, setEditingCat] = useState(null);
  const [catLoading, setCatLoading] = useState(false);

  // ---------- Item modal ----------
  const [modal, setModal] = useState(null);
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------- Price fields ----------
  const [priceFields, setPriceFields] = useState({
    price: "",
    originalPrice: "",
    discountPercent: 0,
  });

  // ---------- Signature checkbox state ----------
  const [isSignature, setIsSignature] = useState(false);

  // ---------- Dinh dưỡng ----------
  const [nutrition, setNutrition] = useState({
    is_cool: false,
    is_healthy: false,
    is_spicy: false,
  });

  // ---------- Confirm dialog ----------
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ---------- Per-action loading ----------
  const [togglingId, setTogglingId] = useState(null);
  const [processingIds, setProcessingIds] = useState(() => new Set());

  // ============================================================
  // LOAD TIME SLOTS
  // ============================================================

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    setSlotsError("");
    try {
      const data = await api.timeSlots.list();
      setSlots(Array.isArray(data) ? data : []);
    } catch (e) {
      setSlotsError(e.message || "Không tải được khung giờ");
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const toggleSlot = async (slot) => {
    if (togglingSlotId !== null) return;

    const oldEnabled = !!slot.enabled;
    const newEnabled = !oldEnabled;

    setTogglingSlotId(slot.id);

    setSlots((prev) =>
      prev.map((s) => (s.id === slot.id ? { ...s, enabled: newEnabled } : s))
    );

    try {
      await api.timeSlots.update(slot.id, { enabled: newEnabled });
      toast(
        newEnabled ? `Đã BẬT khung ${slot.id}` : `Đã TẮT khung ${slot.id}`,
        "success"
      );
    } catch (e) {
      setSlots((prev) =>
        prev.map((s) => (s.id === slot.id ? { ...s, enabled: oldEnabled } : s))
      );
      toast(e.message || "Không đổi được trạng thái", "error");
    } finally {
      setTogglingSlotId(null);
    }
  };

  const resetSlots = async () => {
    if (resettingSlots) return;
    setResettingSlots(true);
    try {
      const res = await api.timeSlots.reset();
      setSlots(Array.isArray(res.slots) ? res.slots : []);
      toast("Đã reset toàn bộ khung giờ về mặc định", "success");
      setConfirmSlotReset(false);
    } catch (e) {
      toast(e.message || "Không reset được", "error");
    } finally {
      setResettingSlots(false);
    }
  };

  // ============================================================
  // LOAD MENU LIST
  // ============================================================

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [items, cats] = await Promise.all([
        api.menu.list("", "Tất cả", "popular"),
        api.categories.list(),
      ]);

      const itemsArr = Array.isArray(items) ? items : [];
      setList(itemsArr);
      setCategories(Array.isArray(cats) ? cats : []);

      const inactiveCount = itemsArr.filter((m) => !m.active).length;
      dbg(`📦 Load xong: ${itemsArr.length} món (${inactiveCount} đã tắt)`);
    } catch (e) {
      setError(e.message || "Không tải được thực đơn");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadSlots();
  }, [load, loadSlots]);

  // ESC đóng modals
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (showCatModal && !catLoading) setShowCatModal(false);
      else if (modal && !saving) closeItemModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, showCatModal, catLoading, saving]);

  // Reset price fields + signature khi mở modal khác
  useEffect(() => {
    if (!modal) return;
    setPriceFields({
      price: modal.price != null ? Number(modal.price) : "",
      originalPrice: modal.original_price ? String(modal.original_price) : "",
      discountPercent: Number(modal.discount_percent) || 0,
    });
    setIsSignature(!!modal.is_signature);
    setNutrition({
      is_cool: !!modal.is_cool,
      is_healthy: !!modal.is_healthy,
      is_spicy: !!modal.is_spicy,
    });
  }, [modal]);

  // ============================================================
  // FILTER + PAGINATION
  // ============================================================

  const filtered = useMemo(() => {
    let result = list;

    if (q.trim()) {
      const s = q.toLowerCase().trim();
      result = result.filter((m) => m.name?.toLowerCase().includes(s));
    }
    if (filterCat) {
      result = result.filter((m) => m.category === filterCat);
    }

    // Sort: tạm hết hàng + đã tắt lên đầu để admin thấy rõ
    return [...result].sort((a, b) => {
      const stockA = Number(a.stock) || 0;
      const stockB = Number(b.stock) || 0;
      const activeA = Number(a.active) || 0;
      const activeB = Number(b.active) || 0;

      // Ưu tiên: đã tắt (0) > tạm hết (1) > sắp hết (2) > bình thường (3)
      const orderA = !activeA ? 0 : stockA === 0 ? 1 : stockA < LOW_STOCK_THRESHOLD ? 2 : 3;
      const orderB = !activeB ? 0 : stockB === 0 ? 1 : stockB < LOW_STOCK_THRESHOLD ? 2 : 3;

      return orderA - orderB;
    });
  }, [list, q, filterCat]);

  // Reset page khi filter/search đổi
  useEffect(() => {
    setPage(1);
  }, [q, filterCat]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // ---------- Confirm helpers ----------

  const closeConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirm(null);
  }, [confirmBusy]);

  const runConfirm = useCallback(async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmBusy(false);
    }
  }, [confirm, confirmBusy]);

  // ---------- Price handlers ----------

  const hasOriginal = Number(priceFields.originalPrice) > 0;

  const handleOriginalChange = (v) => {
    const original = Number(v) || 0;
    setPriceFields((prev) => {
      if (original <= 0) {
        return { ...prev, originalPrice: v, discountPercent: 0 };
      }
      const d = Number(prev.discountPercent) || 0;
      const newPrice = d > 0 ? Math.round(original * (1 - d / 100)) : original;
      return { ...prev, originalPrice: v, price: newPrice };
    });
  };

  const handleDiscountChange = (v) => {
    const d = Math.max(0, Math.min(MAX_DISCOUNT, Number(v) || 0));
    setPriceFields((prev) => {
      const original = Number(prev.originalPrice) || 0;
      if (original <= 0) {
        return { ...prev, discountPercent: 0 };
      }
      const newPrice = d > 0 ? Math.round(original * (1 - d / 100)) : original;
      return { ...prev, discountPercent: d, price: newPrice };
    });
  };

  const handlePriceChange = (v) => {
    setPriceFields((prev) => ({ ...prev, price: v }));
  };

  // ---------- Item modal handlers ----------

  const openItemModal = (item = null) => {
    setImage(item?.image || "");
    setModal(item || {});
  };

  const closeItemModal = () => {
    setModal(null);
    setImage("");
    setPriceFields({
      price: "",
      originalPrice: "",
      discountPercent: 0,
    });
    setIsSignature(false);
    setNutrition({ is_cool: false, is_healthy: false, is_spicy: false });
  };

  const saveItem = async (e) => {
    e.preventDefault();
    if (saving) return;

    const f = new FormData(e.currentTarget);
    const name = f.get("name")?.trim();
    const category = f.get("category");
    const stock = Number(f.get("stock"));

    if (!name) {
      return toast("Vui lòng nhập tên món", "error");
    }

    const currentId = modal._id || modal.id;
    const dup = list.find(
      (m) =>
        (m._id || m.id) !== currentId &&
        (m.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (dup) {
      return toast(
        `Đã có món "${dup.name}" — vui lòng đặt tên khác`,
        "error"
      );
    }

    const original = Number(priceFields.originalPrice) || 0;
    const d = Number(priceFields.discountPercent) || 0;
    let price = Number(priceFields.price) || 0;

    if (original > 0) {
      price = d > 0 ? Math.round(original * (1 - d / 100)) : original;
    }

    if (!price || price <= 0) {
      return toast("Giá phải lớn hơn 0", "error");
    }
    if (d < 0 || d > MAX_DISCOUNT) {
      return toast(`% giảm giá phải từ 0-${MAX_DISCOUNT}`, "error");
    }
    if (stock < 0) {
      return toast("Số lượng không được âm", "error");
    }

    const numOrNull = (v) => {
      const s = String(v ?? "").trim();
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const data = {
      name,
      category,
      price,
      original_price: original > 0 ? original : price,
      discount_percent: original > 0 ? d : 0,
      stock,
      description: f.get("description")?.trim() || "",
      image: image || f.get("imageUrl")?.trim() || "",
      reason: f.get("reason")?.trim() || "",
      is_signature: isSignature,
      prep_time: numOrNull(f.get("prep_time")),
      calories: numOrNull(f.get("calories")),
      is_cool: nutrition.is_cool,
      is_healthy: nutrition.is_healthy,
      is_spicy: nutrition.is_spicy,
    };

    setSaving(true);
    try {
      if (currentId) {
        await api.menu.update(currentId, data);
        toast("Đã cập nhật món", "success");
      } else {
        await api.menu.create(data);
        toast("Đã thêm món mới", "success");
      }
      closeItemModal();
      load();
    } catch (e) {
      toast(e.message || "Không lưu được", "error");
    } finally {
      setSaving(false);
    }
  };

  // ---------- Toggle active (Tắt/Bật món) ----------

  const toggleActive = async (item) => {
    const id = item._id || item.id;
    const oldActive = Number(item.active) || 0;
    const newActive = oldActive ? 0 : 1;

    if (togglingId !== null) {
      dbg(`⏸️ Đang xử lý món khác, bỏ qua toggle id=${id}`);
      return;
    }

    dbg(`🔄 TOGGLE món "${item.name}" (id=${id}): ${oldActive} → ${newActive}`);
    setTogglingId(id);

    setList((prev) =>
      prev.map((m) =>
        (m._id || m.id) === id ? { ...m, active: newActive } : m
      )
    );

    try {
      await api.menu.update(id, { active: newActive });

      if (newActive) {
        toast(`Đã BẬT bán món "${item.name}"`, "success");
      } else {
        toast(
          `Đã TẮT bán món "${item.name}" (món vẫn còn, chỉ ẩn với khách)`,
          "success"
        );
      }
    } catch (e) {
      setList((prev) =>
        prev.map((m) =>
          (m._id || m.id) === id ? { ...m, active: oldActive } : m
        )
      );
      toast(e.message || "Không đổi được trạng thái", "error");
    } finally {
      setTogglingId(null);
    }
  };

  // ---------- Toggle Out (Tạm hết hàng) ----------

  const markProcessing = (id, on) => {
    setProcessingIds((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const handleToggleOut = useCallback(
    async (item) => {
      const id = item._id || item.id;
      if (processingIds.has(id)) return;
      markProcessing(id, true);

      const stockNum = Number(item.stock) || 0;
      const isOut = stockNum === 0;
      const newStock = isOut ? 20 : 0;

      try {
        await api.menu.update(id, { stock: newStock });
        toast(
          isOut
            ? `Đã mở bán lại: "${item.name}"`
            : `Đã tạm hết hàng: "${item.name}"`,
          isOut ? "success" : "warning"
        );
        await load();
      } catch (e) {
        toast(e.message || "Không cập nhật được", "error");
      } finally {
        markProcessing(id, false);
      }
    },
    [processingIds, load]
  );

  // ---------- Adjust stock ----------

  const handleAdjustStock = useCallback(
    async (item, delta) => {
      const id = item._id || item.id;
      if (processingIds.has(id)) return;

      const currentStock = Number(item.stock) || 0;
      const newStock = Math.max(0, Math.min(MAX_STOCK, currentStock + delta));
      if (newStock === currentStock) return;

      markProcessing(id, true);
      try {
        await api.menu.update(id, { stock: newStock });
        toast(`Tồn kho: ${newStock} suất`, "success", {
          id: "stock-toast-" + id,
          duration: 1500,
        });
        await load();
      } catch (e) {
        toast(e.message || "Không cập nhật được", "error");
      } finally {
        markProcessing(id, false);
      }
    },
    [processingIds, load]
  );

  // ---------- Remove item ----------

  const removeItem = (item) => {
    const id = item._id || item.id;

    setConfirm({
      title: `Xóa vĩnh viễn món "${item.name}"?`,
      message:
        "⚠️ HÀNH ĐỘNG NÀY KHÔNG THỂ HOÀN TÁC.\n\n" +
        "Món sẽ bị XÓA KHỎI DATABASE.\n" +
        "Khác với 'Tắt món' (chỉ ẩn khỏi khách, có thể bật lại).\n\n" +
        "Nếu bạn chỉ muốn ẩn tạm, hãy dùng nút Tắt món.",
      confirmText: "XÓA VĨNH VIỄN",
      cancelText: "Hủy — Giữ lại",
      danger: true,
      onConfirm: async () => {
        await api.menu.remove(id);
        toast(`Đã XÓA vĩnh viễn món "${item.name}"`, "success");
        setConfirm(null);
        load();
      },
    });
  };

  // ---------- Category handlers ----------

  const openAddCat = () => {
    setEditingCat(null);
    setCatForm({ name: "", icon: DEFAULT_CATEGORY_ICON, order: "" });
  };

  const openEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name,
      icon: cat.icon || DEFAULT_CATEGORY_ICON,
      order: cat.order != null ? String(cat.order) : "",
    });
  };

  const saveCat = async () => {
    const name = catForm.name.trim();
    if (!name) return toast("Nhập tên danh mục", "error");
    if (catLoading) return;

    const orderStr = String(catForm.order || "").trim();
    let order;
    if (orderStr) {
      order = Number(orderStr);
      if (!Number.isInteger(order) || order < 0) {
        return toast("Thứ tự phải là số nguyên >= 0", "error");
      }
    }

    setCatLoading(true);
    try {
      const payload = { name, icon: catForm.icon };
      if (order !== undefined) payload.order = order;

      if (editingCat) {
        await api.categories.update(editingCat.id, payload);
        toast("Đã cập nhật danh mục", "success");
      } else {
        await api.categories.create(payload);
        toast("Đã thêm danh mục", "success");
      }
      setEditingCat(null);
      setCatForm({ name: "", icon: DEFAULT_CATEGORY_ICON, order: "" });
      load();
    } catch (e) {
      toast(e.message || "Không lưu được", "error");
    } finally {
      setCatLoading(false);
    }
  };

  const removeCat = (cat) => {
    setConfirm({
      title: `Xóa danh mục "${cat.name}"?`,
      message:
        "Danh mục sẽ bị xoá khỏi hệ thống. Các món thuộc danh mục này " +
        "vẫn được giữ nhưng sẽ không có danh mục.",
      confirmText: "Xóa danh mục",
      cancelText: "Hủy",
      danger: true,
      onConfirm: async () => {
        await api.categories.remove(cat.id);
        toast("Đã xóa danh mục", "success");
        setConfirm(null);
        load();
      },
    });
  };

  // ============================================================
  // COMPUTED
  // ============================================================

  const stats = useMemo(() => {
    const total = list.length;
    const active = list.filter((m) => Number(m.active) === 1).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [list]);

  const slotStats = useMemo(() => {
    const enabled = slots.filter((s) => s.enabled).length;
    const disabled = slots.length - enabled;
    return { total: slots.length, enabled, disabled };
  }, [slots]);

  const groupedSlots = useMemo(() => {
    const map = {};
    for (const s of slots) {
      const sid = getSessionId(s.start);
      if (!map[sid]) map[sid] = [];
      map[sid].push(s);
    }
    return SESSIONS.map((session) => ({
      ...session,
      slots: map[session.id] || [],
    })).filter((g) => g.slots.length > 0);
  }, [slots]);
  // ============================================================
  // RENDER
  // ============================================================

  return (
    <>
      <div>
        {/* ============================================================
            🕐 KHUNG GIỜ NHẬN MÓN
            ============================================================ */}
        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          {/* Header */}
          <div
            onClick={() => setOpenSlots((v) => !v)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: openSlots ? 14 : 0,
              flexWrap: "wrap",
              gap: 10,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: "rgba(38, 52, 213, 0.12)",
                  color: "#2634d5",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Clock size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 16,
                    color: "var(--text-primary, #172033)",
                  }}
                >
                  Khung giờ nhận món
                </h3>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-light, #8993a3)",
                  }}
                >
                  Tổng {slotStats.total} khung ·{" "}
                  <b style={{ color: "#18a967" }}>
                    {slotStats.enabled} đang mở
                  </b>
                  {slotStats.disabled > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <b style={{ color: "#ef4444" }}>
                        {slotStats.disabled} đã tắt
                      </b>
                    </>
                  )}
                </span>
              </div>
            </div>



            <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={loadSlots}
                disabled={slotsLoading}
                title="Làm mới"
                aria-label="Làm mới khung giờ"
                style={{
                  padding: "8px 12px",
                  background: "var(--card-bg, #fff)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 8,
                  cursor: slotsLoading ? "not-allowed" : "pointer",
                  fontSize: 12,
                  color: "var(--text-primary, #172033)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: slotsLoading ? 0.6 : 1,
                }}
              >
                {slotsLoading ? (
                  <Loader2
                    size={13}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <RotateCcw size={13} />
                )}
                Làm mới
              </button>

              <button
                type="button"
                onClick={() => setConfirmSlotReset(true)}
                disabled={slotsLoading || resettingSlots}
                style={{
                  padding: "8px 12px",
                  background: "var(--card-bg, #fff)",
                  border: "1px solid #f59e0b",
                  color: "#f59e0b",
                  borderRadius: 8,
                  cursor:
                    slotsLoading || resettingSlots ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RotateCcw size={13} /> Reset
              </button>

            <ChevronDown
              size={18}
              style={{
                color: "var(--text-light, #8993a3)",
                transition: "transform 0.2s",
                transform: openSlots ? "rotate(180deg)" : "rotate(0deg)",
                flexShrink: 0,
              }}
            />
            </div>

          </div>

          {openSlots && (
            <>
          {/* Error */}
          {slotsError && !slotsLoading && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 14,
                color: "#ef4444",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{slotsError}</span>
              <button
                onClick={loadSlots}
                style={{
                  padding: "4px 10px",
                  background: "#ef4444",
                  color: "#fff",
                  border: 0,
                  borderRadius: 5,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Loading */}
          {slotsLoading && slots.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: 30,
                color: "var(--text-light, #8993a3)",
                fontSize: 13,
              }}
            >
              <Loader2
                size={22}
                style={{
                  animation: "spin 1s linear infinite",
                  marginBottom: 8,
                }}
              />
              <div>Đang tải khung giờ...</div>
            </div>
          )}

          {/* Slots */}
          {!slotsLoading &&
            groupedSlots.map((group) => {
              const Icon = group.icon;
              const enabledCount = group.slots.filter((s) => s.enabled).length;

              return (
                <div
                  key={group.id}
                  style={{
                    background: "var(--bg-tertiary, #f8fafc)",
                    border: "1px solid var(--border-color, #eef2f7)",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: group.color + "18",
                        color: group.color,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <b
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary, #172033)",
                      }}
                    >
                      {group.label}
                    </b>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-light, #8993a3)",
                      }}
                    >
                      ({group.from} - {group.to}) ·{" "}
                      <b style={{ color: "#18a967" }}>
                        {enabledCount}/{group.slots.length}
                      </b>{" "}
                      khung mở
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(150px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {group.slots.map((slot) => {
                      const active = !!slot.enabled;
                      const isToggling = togglingSlotId === slot.id;

                      return (
                        <div
                          key={slot.id}
                          style={{
                            background: active
                              ? "var(--card-bg, #fff)"
                              : "rgba(239, 68, 68, 0.06)",
                            border: active
                              ? "1px solid var(--border-color, #e5e9ef)"
                              : "1px solid rgba(239, 68, 68, 0.3)",
                            borderRadius: 9,
                            padding: "10px 12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            transition: "all 0.2s",
                            opacity: isToggling ? 0.6 : 1,
                          }}
                        >
                          <b
                            style={{
                              fontSize: 13,
                              fontFamily: "monospace",
                              color: active
                                ? "var(--text-primary, #172033)"
                                : "var(--text-muted, #64748b)",
                              textDecoration: active ? "none" : "line-through",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {slot.id}
                          </b>

                          <button
                            type="button"
                            onClick={() => toggleSlot(slot)}
                            disabled={isToggling}
                            aria-pressed={active}
                            role="switch"
                            title={
                              active
                                ? "Tắt khung giờ này"
                                : "Bật khung giờ này"
                            }
                            style={{
                              background: active ? "#18a967" : "#cbd5e1",
                              border: 0,
                              cursor: isToggling ? "wait" : "pointer",
                              width: 40,
                              height: 22,
                              borderRadius: 999,
                              padding: 0,
                              position: "relative",
                              display: "inline-block",
                              flexShrink: 0,
                              transition: "background-color 0.25s ease",
                              boxShadow: active
                                ? "0 2px 8px rgba(24, 169, 103, 0.35)"
                                : "inset 0 1px 3px rgba(0, 0, 0, 0.08)",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: 3,
                                left: active ? 21 : 3,
                                width: 16,
                                height: 16,
                                borderRadius: "50%",
                                background: "#ffffff",
                                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                                transition:
                                  "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                              }}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>

        {/* ============ DEBUG BANNER ============ */}
        {DEBUG && (
          <div
            style={{
              background: "rgba(38, 52, 213, 0.08)",
              border: "1px solid rgba(38, 52, 213, 0.2)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: "#2634d5",
              fontFamily: "monospace",
            }}
          >
            🔍 DEBUG: Tổng <b>{stats.total}</b> món ·{" "}
            <b style={{ color: "#18a967" }}>{stats.active} đang bán</b> ·{" "}
            <b style={{ color: "#f59e0b" }}>{stats.inactive} đã tắt</b>
          </div>
        )}

        {/* ============ TOOLBAR ============ */}
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
              minWidth: 220,
              maxWidth: 400,
            }}
          >
            <Search size={18} style={{ color: "var(--text-light, #8993a3)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm món ăn..."
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
                style={clearBtnStyle}
                aria-label="Xoá tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            style={{
              padding: "10px 14px",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              background: "var(--card-bg, #fff)",
              color: "var(--text-primary, #172033)",
              cursor: "pointer",
              minWidth: 140,
            }}
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>

          <button onClick={() => openItemModal(null)} style={btnPrimaryStyle}>
            <Plus size={16} /> Thêm món
          </button>

          <button
            onClick={() => {
              openAddCat();
              setShowCatModal(true);
            }}
            style={btnOutlineStyle}
          >
            <FolderPlus size={16} /> Quản lý danh mục
          </button>
        </div>

        {/* ============ RESULT INFO ============ */}
        {!loading && filtered.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              fontSize: 13,
              color: "var(--text-muted, #64748b)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span>
              Hiển thị{" "}
              <b style={{ color: "var(--text-primary, #172033)" }}>
                {paginatedItems.length}
              </b>{" "}
              / {filtered.length} món
            </span>
          </div>
        )}

        {/* ============ MENU GRID (CARD NGANG - MẪU A) ============ */}
        {loading && paginatedItems.length === 0 ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--text-light, #8993a3)",
              background: "var(--card-bg, #fff)",
              borderRadius: 14,
            }}
          >
            <Loader2
              size={26}
              style={{ animation: "spin 1s linear infinite", marginBottom: 8 }}
            />
            <div>Đang tải thực đơn...</div>
          </div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--text-light, #8993a3)",
              background: "var(--card-bg, #fff)",
              borderRadius: 14,
            }}
          >
            <UtensilsCrossed
              size={40}
              style={{ opacity: 0.3, marginBottom: 8 }}
            />
            <div>
              {q || filterCat
                ? "Không có món nào khớp bộ lọc"
                : 'Chưa có món nào — bấm "Thêm món" để bắt đầu'}
            </div>
          </div>
        ) : (
          <>
            <div className="admin-menu-grid">
              {paginatedItems.map((m) => (
                <AdminMenuCardRow
                  key={m._id || m.id}
                  item={m}
                  isProcessing={processingIds.has(m._id || m.id)}
                  isToggling={togglingId === (m._id || m.id)}
                  onToggleOut={() => handleToggleOut(m)}
                  onToggleActive={() => toggleActive(m)}
                  onAdjustStock={(delta) => handleAdjustStock(m, delta)}
                  onEdit={() => openItemModal(m)}
                  onDelete={() => removeItem(m)}
                  t={t}
                  tData={tData}
                />
              ))}
            </div>

            {/* ============ PAGINATION ============ */}
            {totalPages > 1 && (
              <div className="admin-menu-pagination">
                <button
                  type="button"
                  className="admin-menu-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Trang trước"
                >
                  <ChevronLeft size={18} />
                  <span>Trang trước</span>
                </button>

                <div className="admin-menu-page-indicator">
                  <span className="admin-menu-page-indicator__label">
                    Trang
                  </span>
                  <span className="admin-menu-page-indicator__current">
                    {currentPage}
                  </span>
                  <span className="admin-menu-page-indicator__sep">/</span>
                  <span className="admin-menu-page-indicator__total">
                    {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  className="admin-menu-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="Trang sau"
                >
                  <span>Trang sau</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
        {/* ============ CATEGORY MODAL ============ */}
        {showCatModal && (
          <Modal
            onClose={() => !catLoading && setShowCatModal(false)}
            maxWidth={560}
          >
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>
                <Folder size={20} style={{ color: "#0EA5E9" }} /> Quản lý danh
                mục
              </h3>
              <button
                onClick={() => !catLoading && setShowCatModal(false)}
                style={modalCloseStyle}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                background: "var(--bg-tertiary, #f5f7fb)",
                borderRadius: 10,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-muted, #475569)",
                  marginBottom: 8,
                }}
              >
                {editingCat ? "✏️ Sửa danh mục" : "➕ Thêm danh mục mới"}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 80px auto",
                  gap: 8,
                }}
              >
                <input
                  value={catForm.icon}
                  onChange={(e) =>
                    setCatForm({ ...catForm, icon: e.target.value })
                  }
                  placeholder={DEFAULT_CATEGORY_ICON}
                  maxLength={4}
                  style={{
                    padding: 10,
                    border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8,
                    outline: "none",
                    textAlign: "center",
                    fontSize: 20,
                    background: "var(--card-bg, #fff)",
                  }}
                  aria-label="Icon danh mục"
                />
                <input
                  value={catForm.name}
                  onChange={(e) =>
                    setCatForm({ ...catForm, name: e.target.value })
                  }
                  placeholder="VD: Bún, Phở, Tráng miệng..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveCat();
                    }
                  }}
                  style={{
                    padding: 10,
                    border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8,
                    outline: "none",
                    background: "var(--card-bg, #fff)",
                    color: "var(--text-primary, #172033)",
                  }}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={catForm.order}
                  onChange={(e) =>
                    setCatForm({ ...catForm, order: e.target.value })
                  }
                  placeholder="Tự động"
                  title="Thứ tự hiển thị (để trống = tự động)"
                  style={{
                    padding: 10,
                    border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8,
                    outline: "none",
                    background: "var(--card-bg, #fff)",
                    color: "var(--text-primary, #172033)",
                    fontSize: 13,
                  }}
                  aria-label="Thứ tự hiển thị"
                />
                <button
                  onClick={saveCat}
                  disabled={catLoading || !catForm.name.trim()}
                  style={{
                    padding: "10px 16px",
                    background:
                      !catForm.name.trim() || catLoading ? "#94a3b8" : "#0EA5E9",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor:
                      !catForm.name.trim() || catLoading
                        ? "not-allowed"
                        : "pointer",
                    fontSize: 13,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {catLoading ? (
                    <Loader2
                      size={14}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  ) : (
                    <Save size={14} />
                  )}
                  {editingCat ? "Lưu" : "Thêm"}
                </button>
              </div>
              {editingCat && (
                <button
                  onClick={() => {
                    setEditingCat(null);
                    setCatForm({
                      name: "",
                      icon: DEFAULT_CATEGORY_ICON,
                      order: "",
                    });
                  }}
                  style={{
                    marginTop: 8,
                    background: "transparent",
                    border: 0,
                    color: "#ef4444",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <X size={12} /> Hủy sửa
                </button>
              )}
            </div>

            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text-muted, #475569)",
                marginBottom: 8,
              }}
            >
              Danh sách ({categories.length})
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 400,
                overflowY: "auto",
              }}
            >
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "var(--card-bg, #fff)",
                    border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      background: "var(--bg-tertiary, #f5f7fb)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {cat.icon || DEFAULT_CATEGORY_ICON}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary, #172033)",
                        display: "block",
                      }}
                    >
                      {cat.name}
                    </b>
                    {cat.order && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-light, #8993a3)",
                        }}
                      >
                        Thứ tự: {cat.order}
                      </div>
                    )}
                  </div>
                  <IconButton
                    onClick={() => openEditCat(cat)}
                    title="Sửa"
                    color="#0EA5E9"
                  >
                    <Edit size={14} />
                  </IconButton>
                  <IconButton
                    onClick={() => removeCat(cat)}
                    title="Xóa"
                    color="#ef4444"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
              {categories.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: 30,
                    color: "var(--text-light, #8993a3)",
                    fontSize: 13,
                  }}
                >
                  Chưa có danh mục nào
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCatModal(false)}
              style={{ ...btnPrimaryStyle, marginTop: 16, width: "100%" }}
            >
              Đóng
            </button>
          </Modal>
        )}

        {/* ============ ITEM MODAL ============ */}
        {modal && (
          <Modal onClose={() => !saving && closeItemModal()} maxWidth={560}>
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>
                {modal._id || modal.id ? "Sửa món" : "Thêm món"}
              </h3>
              <button
                onClick={() => !saving && closeItemModal()}
                style={modalCloseStyle}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveItem} autoComplete="off">
              <label style={labelStyle}>Tên món *</label>
              <input
                name="name"
                defaultValue={modal.name || ""}
                required
                style={inputStyle}
                autoFocus
                disabled={saving}
              />

              <label style={labelStyle}>Danh mục *</label>
              <select
                name="category"
                defaultValue={modal.category || (categories[0]?.name ?? "")}
                required
                style={inputStyle}
                disabled={saving}
              >
                {categories.length === 0 && (
                  <option value="">— Chưa có danh mục —</option>
                )}
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>
                    Giá gốc
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={priceFields.originalPrice}
                    onChange={(e) => handleOriginalChange(e.target.value)}
                    placeholder="VD: 50000"
                    style={{ ...inputStyle, marginBottom: 0 }}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>% Giảm</label>
                  <input
                    type="number"
                    min="0"
                    max={MAX_DISCOUNT}
                    step="1"
                    value={priceFields.discountPercent}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    style={{ ...inputStyle, marginBottom: 0 }}
                    disabled={saving || !hasOriginal}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>
                    Giá bán {!hasOriginal && "*"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={priceFields.price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    required={!hasOriginal}
                    placeholder="VD: 30000"
                    style={{
                      ...inputStyle,
                      marginBottom: 0,
                      background: hasOriginal
                        ? "var(--bg-tertiary, #f5f7fb)"
                        : "var(--bg-secondary, #fff)",
                      cursor: hasOriginal ? "not-allowed" : "text",
                      opacity: hasOriginal ? 0.75 : 1,
                    }}
                    disabled={saving || hasOriginal}
                  />
                </div>
              </div>

              <div
                style={{
                  marginBottom: 14,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  background: hasOriginal
                    ? "rgba(14, 165, 233, 0.08)"
                    : "var(--bg-tertiary, #f8fafc)",
                  border: hasOriginal
                    ? "1px solid rgba(14, 165, 233, 0.25)"
                    : "1px solid var(--border-color, #e5e9ef)",
                  color: hasOriginal
                    ? "#0284C7"
                    : "var(--text-muted, #64748b)",
                }}
              >
                {hasOriginal ? (
                  <>
                    💰 Khách sẽ trả <b>{money(priceFields.price)}</b>
                    {priceFields.discountPercent > 0 && (
                      <>
                        {" "}
                        — giảm <b>{priceFields.discountPercent}%</b> từ{" "}
                        <span style={{ textDecoration: "line-through" }}>
                          {money(Number(priceFields.originalPrice) || 0)}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>💡 Để trống Giá gốc nếu không giảm giá.</>
                )}
              </div>

              <label style={labelStyle}>Số lượng *</label>
              <input
                name="stock"
                type="number"
                min="0"
                step="1"
                defaultValue={modal.stock ?? ""}
                placeholder="VD: 20"
                required
                style={inputStyle}
                disabled={saving}
              />

              <label style={labelStyle}>Mô tả</label>
              <textarea
                name="description"
                defaultValue={modal.description || ""}
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                disabled={saving}
              />

              <label style={labelStyle}>Dinh dưỡng &amp; phục vụ</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>
                    ⏱ Thời gian làm (phút)
                  </label>
                  <input
                    name="prep_time"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={modal.prep_time ?? ""}
                    placeholder="VD: 10"
                    style={{ ...inputStyle, marginBottom: 0 }}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>
                    🔥 Năng lượng (kcal)
                  </label>
                  <input
                    name="calories"
                    type="number"
                    min="0"
                    step="10"
                    defaultValue={modal.calories ?? ""}
                    placeholder="VD: 520"
                    style={{ ...inputStyle, marginBottom: 0 }}
                    disabled={saving}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                {[
                  { key: "is_cool", icon: "❄️", label: "Mát lạnh" },
                  { key: "is_healthy", icon: "🥗", label: "Lành mạnh" },
                  { key: "is_spicy", icon: "🌶️", label: "Cay" },
                ].map((c) => (
                  <label
                    key={c.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 10,
                      fontSize: 12.5,
                      cursor: saving ? "not-allowed" : "pointer",
                      background: nutrition[c.key]
                        ? "rgba(16, 185, 129, 0.12)"
                        : "var(--bg-tertiary, #f8fafc)",
                      border: nutrition[c.key]
                        ? "1px solid rgba(16, 185, 129, 0.4)"
                        : "1px solid var(--border-color, #e5e9ef)",
                      transition: "all 0.2s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!nutrition[c.key]}
                      onChange={(e) =>
                        setNutrition((p) => ({ ...p, [c.key]: e.target.checked }))
                      }
                      disabled={saving}
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: "#10b981",
                        cursor: "inherit",
                        flexShrink: 0,
                      }}
                    />
                    <b style={{ color: "var(--text-primary, #172033)", fontWeight: 600 }}>
                      {c.icon} {c.label}
                    </b>
                  </label>
                ))}
              </div>

              <div
                style={{
                  marginBottom: 14,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  background: "var(--bg-tertiary, #f8fafc)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  color: "var(--text-muted, #64748b)",
                }}
              >
                💡 Để trống Thời gian / Năng lượng → hệ thống tự gán mặc định theo
                danh mục. Các tiêu chí này dùng cho bộ lọc "Tiêu chí ưu tiên" và
                "Mức năng lượng" ở trang thực đơn của khách hàng.
              </div>

              <label style={labelStyle}>Lý do đổi giá (nếu có sửa giá)</label>
              <input
                name="reason"
                placeholder="VD: Tăng giá nguyên liệu, khuyến mãi..."
                style={inputStyle}
                disabled={saving}
              />

              <ImageUploader
                value={image}
                onChange={setImage}
                label="Ảnh món ăn (JPEG/PNG, tối đa 2MB)"
              />

              {!image && (
                <>
                  <label style={labelStyle}>Hoặc dán URL ảnh</label>
                  <input
                    name="imageUrl"
                    defaultValue={
                      modal.image?.startsWith("http") ? modal.image : ""
                    }
                    placeholder="https://..."
                    style={inputStyle}
                    disabled={saving}
                  />
                </>
              )}

              {/* ✅ CHECKBOX SIGNATURE */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  marginTop: 14,
                  marginBottom: 8,
                  background: isSignature
                    ? "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(239, 68, 68, 0.08))"
                    : "var(--bg-tertiary, #f8fafc)",
                  border: isSignature
                    ? "1px solid rgba(245, 158, 11, 0.4)"
                    : "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 10,
                  cursor: saving ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                <input
                  type="checkbox"
                  checked={isSignature}
                  onChange={(e) => setIsSignature(e.target.checked)}
                  disabled={saving}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: "#f59e0b",
                    cursor: saving ? "not-allowed" : "pointer",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary, #172033)",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Star
                      size={14}
                      fill={isSignature ? "#f59e0b" : "none"}
                      color="#f59e0b"
                    />
                    Món Signature
                  </b>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted, #64748b)",
                      display: "block",
                      marginTop: 2,
                    }}
                  >
                    Hiển thị ở section "Món Signature" trên trang chủ khách hàng
                  </span>
                </div>
              </label>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={closeItemModal}
                  disabled={saving}
                  style={{ ...btnCancelStyle, flex: 1 }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ ...btnPrimaryStyle, flex: 1, width: "auto" }}
                >
                  {saving ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                      Đang lưu...
                    </>
                  ) : (
                    <>
                      <Save size={14} /> Lưu món
                    </>
                  )}
                </button>
              </div>
            </form>
          </Modal>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>

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

      <ConfirmDialog
        open={confirmSlotReset}
        title="Reset toàn bộ khung giờ?"
        message="Tất cả khung giờ sẽ được BẬT lại như mặc định. Trạng thái tắt hiện tại sẽ bị xoá."
        confirmText="Reset"
        cancelText="Hủy"
        danger
        loading={resettingSlots}
        onConfirm={resetSlots}
        onClose={() => !resettingSlots && setConfirmSlotReset(false)}
      />
    </>
  );
}

// ============================================================
// SUB-COMPONENT: AdminMenuCardRow — Card ngang (Mẫu A)
// ------------------------------------------------------------
// Giống EmployeeMenu nhưng admin có thêm:
//   - Nút "Tắt món" (active=0)
//   - Icon Sửa (mở modal edit)
//   - Icon Xoá (xoá vĩnh viễn)
// ============================================================

function AdminMenuCardRow({
  item,
  isProcessing,
  isToggling,
  onToggleOut,
  onToggleActive,
  onAdjustStock,
  onEdit,
  onDelete,
  t,
  tData,
}) {
  const stockNum = Number(item.stock) || 0;
  const soldNum = Number(item.sold) || 0;
  const totalStockNum = stockNum + soldNum;
  const activeNum = Number(item.active) || 0;
  const isActive = activeNum === 1;
  const isOut = stockNum === 0;
  const isLow = stockNum > 0 && stockNum < LOW_STOCK_THRESHOLD;
  const isDisabled = !isActive;

  const unitLabel =
    item.category === "Đồ uống"
      ? t("ly")
      : item.category === "Món mặn"
      ? t("tô")
      : t("suất");

  // Badge trạng thái
  let statusBadge = null;
  if (isDisabled) {
    statusBadge = {
      variant: "disabled",
      icon: <Power size={11} />,
      text: t("Đã tắt món"),
    };
  } else if (isOut) {
    statusBadge = {
      variant: "out",
      icon: <Ban size={11} />,
      text: t("Tạm hết hàng"),
    };
  } else if (isLow) {
    statusBadge = {
      variant: "low",
      icon: <AlertCircle size={11} />,
      text: `${t("Sắp hết")} (${stockNum})`,
    };
  } else {
    statusBadge = {
      variant: "active",
      icon: <CheckCircle2 size={11} />,
      text: t("Đang bán"),
    };
  }

  // Class card
  const cardClass =
    "admin-menu-card" +
    (isDisabled ? " admin-menu-card--disabled" : "") +
    (isOut && !isDisabled ? " admin-menu-card--out" : "");

  return (
    <article className={cardClass}>
      {/* Ảnh vuông 96px */}
      <div className="admin-menu-card__img-wrap">
        <img
          src={item.image || getFALLBACK_IMG()}
          alt={item.name}
          loading="lazy"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = getFALLBACK_IMG();
          }}
        />
        {item.is_signature && (
          <span className="admin-menu-card__badge-signature">
            <Star size={9} fill="#fff" /> SIGNATURE
          </span>
        )}
      </div>

      {/* Info */}
      <div className="admin-menu-card__info">
        <span className="admin-menu-card__category">
          {item.category}
        </span>

        <h3 className="admin-menu-card__name">
          {tData(item, "name") || item.name}
        </h3>

        {/* Giá */}
        <div className="admin-menu-card__price-row">
          {item.original_price > item.price && (
            <span className="admin-menu-card__price-old">
              {money(item.original_price)}
            </span>
          )}
          <span className="admin-menu-card__price-new">
            {money(item.price)}
          </span>
          {item.original_price > item.price &&
            item.discount_percent > 0 && (
              <span className="admin-menu-card__discount">
                -{item.discount_percent}%
              </span>
            )}
        </div>

        {/* Meta */}
        <div className="admin-menu-card__meta">
          {item.rating > 0 && (
            <span className="admin-menu-card__meta-item">
              <Star size={12} fill="#f59e0b" color="#f59e0b" />
              <b>{item.rating}</b>
            </span>
          )}
          {item.calories > 0 && (
            <span className="admin-menu-card__meta-item">
              <Flame size={12} color="#ef4444" />
              {item.calories} kcal
            </span>
          )}
          {item.prep_time > 0 && (
            <span className="admin-menu-card__meta-item">
              <Clock size={12} />
              {item.prep_time} {t("phút")}
            </span>
          )}
        </div>

        {/* Status + Stock X/Y */}
        <div className="admin-menu-card__status-row">
          {statusBadge && (
            <span
              className={`admin-menu-card__badge admin-menu-card__badge--${statusBadge.variant}`}
            >
              {statusBadge.icon}
              {statusBadge.text}
            </span>
          )}

          <span className="admin-menu-card__stock-info">
            <Package size={12} />
            <b
              style={{
                color: isOut
                  ? "var(--st-danger)"
                  : isLow
                  ? "#b45309"
                  : "var(--st-success)",
              }}
            >
              {stockNum}
            </b>
            <span>
              / {totalStockNum} {unitLabel}
            </span>
          </span>
        </div>

        {/* Actions */}
        <div className="admin-menu-card__actions">
          {/* Stepper */}
          <div className="admin-menu-card__stepper">
            <button
              type="button"
              className="admin-menu-card__step-btn"
              onClick={() => onAdjustStock(-1)}
              disabled={isProcessing || stockNum <= 0 || isDisabled}
              aria-label={t("Giảm")}
            >
              <Minus size={14} />
            </button>
            <span className="admin-menu-card__step-value">{stockNum}</span>
            <button
              type="button"
              className="admin-menu-card__step-btn"
              onClick={() => onAdjustStock(1)}
              disabled={isProcessing || stockNum >= MAX_STOCK || isDisabled}
              aria-label={t("Tăng")}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Quick add */}
          <div className="admin-menu-card__quick">
            <button
              type="button"
              className="admin-menu-card__quick-btn"
              onClick={() => onAdjustStock(10)}
              disabled={isProcessing || isDisabled}
            >
              +10
            </button>
            <button
              type="button"
              className="admin-menu-card__quick-btn"
              onClick={() => onAdjustStock(20)}
              disabled={isProcessing || isDisabled}
            >
              +20
            </button>
          </div>

          {/* Toggle Out (tạm hết hàng) */}
          <button
            type="button"
            className={`admin-menu-card__toggle-out ${
              isOut
                ? "admin-menu-card__toggle-out--reopen"
                : "admin-menu-card__toggle-out--out"
            }`}
            onClick={onToggleOut}
            disabled={isProcessing || isDisabled}
            title={
              isDisabled
                ? t("Món đã bị tắt — mở lại trước khi thao tác")
                : isOut
                ? t("Mở bán lại")
                : t("Báo tạm hết hàng")
            }
          >
            {isProcessing ? (
              <Loader2
                size={14}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : isOut ? (
              <Eye size={14} />
            ) : (
              <EyeOff size={14} />
            )}
            <span>{isOut ? t("Mở bán lại") : t("Tạm hết")}</span>
          </button>

          {/* Toggle Active (Tắt/Bật món) - CHỈ ADMIN */}
          <button
            type="button"
            className={`admin-menu-card__toggle-active ${
              isDisabled ? "admin-menu-card__toggle-active--off" : ""
            }`}
            onClick={onToggleActive}
            disabled={isToggling}
            title={
              isActive
                ? t("Tắt món — ẩn với khách, vẫn còn trong hệ thống")
                : t("Bật lại món")
            }
          >
            {isToggling ? (
              <Loader2
                size={14}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Power size={14} />
            )}
            <span>{isActive ? t("Tắt món") : t("Bật lại")}</span>
          </button>

          {/* Icon actions (Sửa/Xoá) */}
          <div className="admin-menu-card__icon-actions">
            <button
              type="button"
              className="admin-menu-card__icon-btn"
              onClick={onEdit}
              disabled={isProcessing}
              title={t("Sửa món")}
              aria-label={t("Sửa món")}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="admin-menu-card__icon-btn admin-menu-card__icon-btn--danger"
              onClick={onDelete}
              disabled={isProcessing}
              title={t("Xoá vĩnh viễn món này")}
              aria-label={t("Xoá món")}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function IconButton({
  children,
  onClick,
  title,
  color = "var(--text-primary, #172033)",
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      type="button"
      style={{
        padding: 6,
        border: "1px solid var(--border-color, #e5e9ef)",
        borderRadius: 6,
        background: "var(--card-bg, #fff)",
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

function ErrorBox({ message, onRetry }) {
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
        Không tải được dữ liệu
      </div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: onRetry ? 12 : 0 }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          type="button"
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
          Thử lại
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
  marginBottom: 14,
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

const clearBtnStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 2,
};

const btnPrimaryStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 16px",
  background: "var(--btn-primary, #2634d5)",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
  textDecoration: "none",
};

const btnOutlineStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "var(--card-bg, #fff)",
  color: "var(--btn-primary, #2634d5)",
  padding: "10px 16px",
  border: "1px solid var(--btn-primary, #2634d5)",
  borderRadius: 10,
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

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
