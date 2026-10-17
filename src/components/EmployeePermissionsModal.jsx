import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Shield, Check, Save, RotateCcw, Loader2, AlertCircle, Utensils, ClipboardList, Warehouse, UserCog, UserRound, CalendarCheck, BarChart3, Database, Settings as SettingsIcon, Edit, X,
} from "lucide-react";
import { api } from "../api";
import { toast } from "./Effects";
import { useI18n } from "../hooks/useI18n";

const CATEGORY_META = [
  { prefix: "menu.",       label: "Thực đơn",   icon: Utensils,       color: "#0EA5E9" },
  { prefix: "orders.",     label: "Đơn hàng",   icon: ClipboardList,  color: "#2634d5" },
  { prefix: "inventory.",  label: "Kho hàng",   icon: Warehouse,      color: "#18a967" },
  { prefix: "customers.",  label: "Khách hàng", icon: UserRound,      color: "#f59e0b" },
  { prefix: "employees.",  label: "Nhân viên",  icon: UserCog,        color: "#8b5cf6" },
  { prefix: "attendance.", label: "Chấm công",  icon: CalendarCheck,  color: "#ec4899" },
  { prefix: "reports.",    label: "Báo cáo",    icon: BarChart3,      color: "#14b8a6" },
  { prefix: "backup.",     label: "Sao lưu",    icon: Database,       color: "#ef4444" },
  { prefix: "settings.",   label: "Cài đặt",    icon: SettingsIcon,   color: "#f97316" },
];

const btnToolbarStyle = ({ disabled, primary, danger }) => ({
  padding: "8px 14px", background: "var(--bg-tertiary, #f5f7fb)", border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", color: danger ? "#ef4444" : "var(--text-primary, #172033)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, opacity: disabled ? 0.5 : 1,
});

const btnSaveStyle = ({ disabled }) => ({
  padding: "8px 14px", background: disabled ? "#94a3b8" : "#2634d5", color: "#fff", border: 0, borderRadius: 8, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, opacity: disabled ? 0.5 : 1,
});

export default function EmployeePermissionsModal({ user, onClose }) {
  const { t } = useI18n();
  const [allPermissions, setAllPermissions] = useState([]);
  const [roleDefaults, setRoleDefaults] = useState({});
  const [userPerms, setUserPerms] = useState({ custom: [], permissions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [configRes, permsRes] = await Promise.all([
        api.permissions.all(),
        api.permissions.ofUser(user.id)
      ]);
      setAllPermissions(configRes.all || []);
      setRoleDefaults(configRes.roles || {});
      setUserPerms({
        custom: permsRes.custom || [],
        permissions: permsRes.permissions || [],
      });
    } catch (e) {
      setError(e.message || t("Không tải được dữ liệu phân quyền"));
    } finally {
      setLoading(false);
    }
  }, [user.id, t]);

  useEffect(() => { loadData(); }, [loadData]);

  const groupedPermissions = useMemo(() => {
    const groups = [];
    for (const meta of CATEGORY_META) {
      const items = allPermissions.filter((p) => p.key.startsWith(meta.prefix));
      if (items.length > 0) groups.push({ ...meta, items });
    }
    const knownPrefixes = CATEGORY_META.map((m) => m.prefix);
    const orphans = allPermissions.filter((p) => !knownPrefixes.some((pre) => p.key.startsWith(pre)));
    if (orphans.length > 0) groups.push({ prefix: "__other__", label: t("Khác"), icon: Shield, color: "#64748b", items: orphans });
    return groups;
  }, [allPermissions, t]);

  const togglePerm = (key) => {
    if (!isEditing) { toast(t("Bấm Sửa để chỉnh quyền"), "info"); return; }
    const isDefault = roleDefaults["EMPLOYEE"]?.includes(key);
    if (isDefault) { toast(t("Quyền này thuộc role mặc định, không thể bỏ"), "info"); return; }

    setUserPerms((prev) => {
      const hasCustom = prev.custom.includes(key);
      const newCustom = hasCustom ? prev.custom.filter((x) => x !== key) : [...prev.custom, key];
      const defaults = roleDefaults["EMPLOYEE"] || [];
      const newPermissions = Array.from(new Set([...defaults, ...newCustom]));
      return { custom: newCustom, permissions: newPermissions };
    });
  };

  const toggleGroup = (group) => {
    if (!isEditing) { toast(t("Bấm Sửa để chỉnh quyền"), "info"); return; }
    const defaults = roleDefaults["EMPLOYEE"] || [];
    const editableKeys = group.items.map((p) => p.key).filter((k) => !defaults.includes(k));
    if (editableKeys.length === 0) { toast(t("Nhóm này chỉ có quyền mặc định"), "info"); return; }

    setUserPerms((prev) => {
      const customSet = new Set(prev.custom);
      const allSelected = editableKeys.every((k) => customSet.has(k));
      if (allSelected) editableKeys.forEach((k) => customSet.delete(k));
      else editableKeys.forEach((k) => customSet.add(k));
      const newCustom = Array.from(customSet);
      const newPermissions = Array.from(new Set([...defaults, ...newCustom]));
      return { custom: newCustom, permissions: newPermissions };
    });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.permissions.update(user.id, userPerms.custom);
      toast(`${t("Đã cập nhật quyền cho")} ${user.name}`, "success");
      const res = await api.permissions.ofUser(user.id);
      setUserPerms({ custom: res.custom || [], permissions: res.permissions || [] });
      setIsEditing(false);
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally { setSaving(false); }
  };

  const resetCustom = async () => {
    if (!isEditing) { toast(t("Bấm Sửa để chỉnh quyền"), "info"); return; }
    setSaving(true);
    try {
      await api.permissions.update(user.id, []);
      const res = await api.permissions.ofUser(user.id);
      setUserPerms({ custom: res.custom || [], permissions: res.permissions || [] });
      toast(t("Đã reset về quyền mặc định"), "success");
    } catch (e) {
      toast(e.message || t("Không reset được"), "error");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 2147483605, padding: 20 }}>
      <div style={{ background: "var(--card-bg, #fff)", borderRadius: 14, width: "100%", maxWidth: 800, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color, #eef2f7)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-tertiary, #f8fafc)" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "var(--text-primary, #172033)" }}>{t("Phân quyền nhân viên")}</h2>
            <span style={{ fontSize: 13, color: "var(--text-muted, #64748b)" }}>{user.name} ({user.email})</span>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-muted, #64748b)" }}><X size={24} /></button>
        </div>

        {/* Toolbar */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color, #eef2f7)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={resetCustom} disabled={saving || !isEditing} style={btnToolbarStyle({ disabled: saving || !isEditing })}>
            <RotateCcw size={14} /> {t("Reset")}
          </button>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} disabled={saving || loading} style={btnToolbarStyle({ disabled: saving || loading, primary: true })}>
              <Edit size={14} /> {t("Sửa")}
            </button>
          ) : (
            <button onClick={() => setIsEditing(false)} disabled={saving} style={btnToolbarStyle({ disabled: saving, danger: true })}>
              <X size={14} /> {t("Hủy")}
            </button>
          )}
          <button onClick={save} disabled={saving || !isEditing} style={btnSaveStyle({ disabled: saving || !isEditing })}>
            {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />} {t("Lưu")}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted, #64748b)" }}>
              <Loader2 size={30} style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
              <div>{t("Đang tải quyền...")}</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: 40, color: "#ef4444" }}>
              <AlertCircle size={30} style={{ marginBottom: 10 }} />
              <div>{error}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {groupedPermissions.map((group) => {
                const GroupIcon = group.icon;
                const defaults = roleDefaults["EMPLOYEE"] || [];
                const checkedCount = group.items.filter((p) => userPerms.permissions?.includes(p.key)).length;
                const totalCount = group.items.length;
                const editableKeys = group.items.map((p) => p.key).filter((k) => !defaults.includes(k));
                const editableChecked = editableKeys.filter((k) => userPerms.custom?.includes(k)).length;
                const allGroupSelected = editableKeys.length > 0 && editableChecked === editableKeys.length;

                return (
                  <div key={group.prefix} style={{ border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: group.color + "10", borderBottom: "1px solid var(--border-color, #e5e9ef)", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: group.color + "25", color: group.color, display: "grid", placeItems: "center" }}>
                          <GroupIcon size={15} />
                        </div>
                        <b style={{ fontSize: 14, color: "var(--text-primary, #172033)" }}>{group.label}</b>
                        <span style={{ fontSize: 11, fontWeight: 700, color: group.color, background: group.color + "18", padding: "2px 8px", borderRadius: 10 }}>
                          {checkedCount}/{totalCount}
                        </span>
                      </div>
                      {editableKeys.length > 0 && (
                        <button onClick={() => toggleGroup(group)} disabled={!isEditing || saving} style={{ padding: "4px 10px", background: "transparent", border: "1px solid " + group.color + "50", color: group.color, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: !isEditing || saving ? "not-allowed" : "pointer", opacity: !isEditing || saving ? 0.5 : 1 }}>
                          {allGroupSelected ? t("Bỏ chọn nhóm") : t("Chọn cả nhóm")}
                        </button>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, padding: 12 }}>
                      {group.items.map((p) => {
                        const isDefault = defaults.includes(p.key);
                        const isChecked = userPerms.permissions?.includes(p.key);
                        const disabled = isDefault || !isEditing || saving;
                        return (
                          <button key={p.key} onClick={() => togglePerm(p.key)} disabled={disabled} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: isChecked ? "rgba(24, 169, 103, 0.08)" : "var(--bg-tertiary, #f8fafc)", border: isChecked ? "2px solid #18a967" : "2px solid var(--border-color, #e5e9ef)", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", opacity: isDefault ? 0.75 : isEditing ? 1 : 0.9 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, background: isChecked ? "#18a967" : "transparent", border: isChecked ? "0" : "2px solid var(--border-color, #cbd5e1)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                              {isChecked && <Check size={12} color="#fff" />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary, #172033)" }}>{t(p.label)}</div>
                              {isDefault && (
                                <div style={{ fontSize: 11, color: "#2634d5", fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                                  <Shield size={10} /> {t("Mặc định theo role")}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
