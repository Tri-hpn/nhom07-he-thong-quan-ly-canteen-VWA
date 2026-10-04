// ============================================================
// OWNERPERMISSIONS.JSX — Phân quyền chi tiết (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Shield, Check, Search, Save, RotateCcw, Users, Pencil, X, Loader2, AlertCircle, Utensils, ClipboardList, Warehouse, UserCog, UserRound, CalendarCheck, BarChart3, Database, Settings as SettingsIcon, Edit,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";

// ============================================================
// CONSTANTS
// ============================================================

/**
 * ✅ #13.1: Map prefix → metadata cho từng nhóm quyền.
 * Thứ tự trong array QUYẾT ĐỊNH thứ tự hiển thị.
 */
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

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerPermissions() {
  const { t } = useI18n();

  // Role tabs (dùng useMemo vì phụ thuộc t)
  const ROLE_TABS = useMemo(
    () => [
      { id: "EMPLOYEE", label: t("Nhân viên") },
      { id: "CUSTOMER", label: t("Khách hàng") },
    ],
    [t]
  );

  const ROLE_LABEL = useMemo(
    () => ({
      EMPLOYEE: t("Nhân viên"),
      CUSTOMER: t("Khách hàng"),
      ADMIN: t("Quản trị viên"),
    }),
    [t]
  );

  // ---------- Permissions config ----------
  const [allPermissions, setAllPermissions] = useState([]);
  const [roleDefaults, setRoleDefaults] = useState({});
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState("");

  // ---------- Users ----------
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // ---------- Selected user + perms ----------
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPerms, setUserPerms] = useState({ custom: [], permissions: [] });
  const [loadingPerms, setLoadingPerms] = useState(false);

  // ---------- UI state ----------
  const [search, setSearch] = useState("");
  const [activeRole, setActiveRole] = useState("EMPLOYEE");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---------- Confirm dialog ----------
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ---------- Load config + users ----------

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError("");
    try {
      const res = await api.permissions.all();
      setAllPermissions(res.all || []);
      setRoleDefaults(res.roles || {});
    } catch (e) {
      setConfigError(e.message || t("Không tải được cấu hình quyền"));
    } finally {
      setConfigLoading(false);
    }
  }, [t]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const allUsers = await api.users.list();
      setUsers(
        (allUsers || []).filter((u) => u.role !== "ADMIN")
      );
    } catch (e) {
      toast(e.message || t("Không tải được danh sách user"), "error");
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadConfig();
    loadUsers();
  }, [loadConfig, loadUsers]);

  // ---------- Filter (memo) ----------

  const filteredUsers = useMemo(() => {
    const roleFiltered = users.filter((u) => u.role === activeRole);
    if (!search.trim()) return roleFiltered;
    const s = search.toLowerCase().trim();
    return roleFiltered.filter(
      (u) =>
        u.name?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s)
    );
  }, [users, activeRole, search]);

  // ---------- ✅ #13.1: Group permissions by category ----------

  const groupedPermissions = useMemo(() => {
    const groups = [];

    for (const meta of CATEGORY_META) {
      const items = allPermissions.filter((p) =>
        p.key.startsWith(meta.prefix)
      );
      if (items.length > 0) {
        groups.push({ ...meta, items });
      }
    }

    // Catch-all: permissions không thuộc prefix nào
    const knownPrefixes = CATEGORY_META.map((m) => m.prefix);
    const orphans = allPermissions.filter(
      (p) => !knownPrefixes.some((pre) => p.key.startsWith(pre))
    );
    if (orphans.length > 0) {
      groups.push({
        prefix: "__other__",
        label: t("Khác"),
        icon: Shield,
        color: "#64748b",
        items: orphans,
      });
    }

    return groups;
  }, [allPermissions, t]);

  // ---------- Confirm helpers ----------

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

  // ---------- Handlers ----------

  const openUser = useCallback(async (u) => {
    setSelectedUser(u);
    setIsEditing(false);
    setLoadingPerms(true);

    let cancelled = false;
    try {
      const res = await api.permissions.ofUser(u.id);
      if (cancelled) return;
      setUserPerms({
        custom: res.custom || [],
        permissions: res.permissions || [],
      });
    } catch (e) {
      if (!cancelled) {
        toast(e.message || t("Không tải được quyền"), "error");
        setUserPerms({ custom: [], permissions: [] });
      }
    } finally {
      if (!cancelled) setLoadingPerms(false);
    }

    return () => {
      cancelled = true;
    };
  }, [t]);

  const togglePerm = (key) => {
    if (!isEditing) {
      toast(t("Bấm Sửa để chỉnh quyền"), "info");
      return;
    }
    if (!selectedUser) return;

    const isDefault = roleDefaults[selectedUser.role]?.includes(key);
    if (isDefault) {
      toast(t("Quyền này thuộc role mặc định, không thể bỏ"), "info");
      return;
    }

    setUserPerms((prev) => {
      const hasCustom = prev.custom.includes(key);
      const newCustom = hasCustom
        ? prev.custom.filter((x) => x !== key)
        : [...prev.custom, key];

      const defaults = roleDefaults[selectedUser.role] || [];
      const newPermissions = Array.from(new Set([...defaults, ...newCustom]));

      return { custom: newCustom, permissions: newPermissions };
    });
  };

  /**
   * ✅ #13.4: Toggle toàn bộ quyền trong 1 group.
   */
  const toggleGroup = (group) => {
    if (!isEditing) {
      toast(t("Bấm Sửa để chỉnh quyền"), "info");
      return;
    }
    if (!selectedUser) return;

    const defaults = roleDefaults[selectedUser.role] || [];
    const editableKeys = group.items
      .map((p) => p.key)
      .filter((k) => !defaults.includes(k));

    if (editableKeys.length === 0) {
      toast(t("Nhóm này chỉ có quyền mặc định"), "info");
      return;
    }

    setUserPerms((prev) => {
      const customSet = new Set(prev.custom);
      const allSelected = editableKeys.every((k) => customSet.has(k));

      if (allSelected) {
        editableKeys.forEach((k) => customSet.delete(k));
      } else {
        editableKeys.forEach((k) => customSet.add(k));
      }

      const newCustom = Array.from(customSet);
      const newPermissions = Array.from(new Set([...defaults, ...newCustom]));

      return { custom: newCustom, permissions: newPermissions };
    });
  };

  const startEdit = () => {
    setIsEditing(true);
    toast(t("Đang chỉnh sửa quyền"), "info");
  };

  const cancelEdit = async () => {
    if (!selectedUser) {
      setIsEditing(false);
      return;
    }
    try {
      const res = await api.permissions.ofUser(selectedUser.id);
      setUserPerms({
        custom: res.custom || [],
        permissions: res.permissions || [],
      });
    } catch (e) {
      toast(e.message || t("Không tải lại được"), "error");
    } finally {
      setIsEditing(false);
    }
  };

  const save = async () => {
    if (!selectedUser || saving) return;
    setSaving(true);
    try {
      await api.permissions.update(selectedUser.id, userPerms.custom);
      toast(
        `${t("Đã cập nhật quyền cho")} ${selectedUser.name}`,
        "success"
      );

      const res = await api.permissions.ofUser(selectedUser.id);
      setUserPerms({
        custom: res.custom || [],
        permissions: res.permissions || [],
      });
      setIsEditing(false);
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally {
      setSaving(false);
    }
  };

  const resetCustom = () => {
    if (!selectedUser) return;
    if (!isEditing) {
      toast(t("Bấm Sửa để chỉnh quyền"), "info");
      return;
    }

    setConfirm({
      title: `${t("Reset quyền của")} "${selectedUser.name}"?`,
      message: t(
        "Tất cả quyền custom sẽ bị xóa. User sẽ trở về quyền mặc định theo role."
      ),
      confirmText: t("Reset"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        setSaving(true);
        try {
          await api.permissions.update(selectedUser.id, []);
          const res = await api.permissions.ofUser(selectedUser.id);
          setUserPerms({
            custom: res.custom || [],
            permissions: res.permissions || [],
          });
          toast(t("Đã reset về quyền mặc định"), "success");
          setConfirm(null);
        } catch (e) {
          toast(e.message || t("Không reset được"), "error");
        } finally {
          setSaving(false);
        }
      },
    });
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (configLoading) {
    return (
      <div style={loadingFullStyle}>
        <Loader2
          size={28}
          style={{ animation: "spin 1s linear infinite", marginBottom: 10 }}
        />
        <div>{t("Đang tải cấu hình quyền...")}</div>
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (configError) {
    return (
      <div style={errorFullStyle}>
        <AlertCircle size={28} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {t("Không tải được cấu hình")}
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>
          {configError}
        </div>
        <button onClick={loadConfig} style={btnPrimaryStyle}>
          {t("Thử lại")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="perm-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
          gap: 20,
        }}
      >
        {/* ============================================================
            CỘT TRÁI — Danh sách user
            ============================================================ */}
        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 16,
            height: "fit-content",
            maxHeight: "calc(100vh - 120px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: 12,
              color: "var(--text-primary, #172033)",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Users size={16} /> {t("Người dùng")}
          </h3>

          {/* Tabs role */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              background: "var(--bg-tertiary, #f5f7fb)",
              padding: 4,
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            {ROLE_TABS.map((tab) => {
              const active = activeRole === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveRole(tab.id);
                    setSelectedUser(null);
                    setIsEditing(false);
                  }}
                  style={{
                    padding: "8px 10px",
                    background: active ? "#2634d5" : "transparent",
                    color: active ? "#fff" : "var(--text-muted, #475569)",
                    border: 0,
                    borderRadius: 7,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-tertiary, #f5f7fb)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 12,
            }}
          >
            <Search size={14} style={{ color: "var(--text-light, #8993a3)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Tìm...")}
              style={{
                border: 0,
                outline: "none",
                background: "transparent",
                color: "var(--text-primary, #172033)",
                fontSize: 12,
                flex: 1,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--text-light, #8993a3)",
                  padding: 2,
                }}
                aria-label={t("Xoá tìm kiếm")}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* User list */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              overflowY: "auto",
              flex: 1,
            }}
          >
            {usersLoading ? (
              <div style={loadingSmallStyle}>{t("Đang tải...")}</div>
            ) : !filteredUsers.length ? (
              <div style={emptySmallStyle}>
                {t("Không có")}{" "}
                {activeRole === "EMPLOYEE" ? t("nhân viên") : t("khách hàng")}
              </div>
            ) : (
              filteredUsers.map((u) => {
                const selected = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => openUser(u)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: 10,
                      background: selected
                        ? "rgba(38, 52, 213, 0.1)"
                        : "transparent",
                      border: selected
                        ? "1px solid #2634d5"
                        : "1px solid transparent",
                      borderRadius: 10,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background:
                          u.role === "EMPLOYEE"
                            ? "linear-gradient(135deg, #2634d5, #20c779)"
                            : "linear-gradient(135deg, #f59e0b, #ef4444)",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      {(u.name || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary, #172033)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {u.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-light, #8993a3)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ROLE_LABEL[u.role] || u.role}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ============================================================
            CỘT PHẢI — Chi tiết quyền
            ============================================================ */}
        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          {!selectedUser ? (
            <div
              style={{
                textAlign: "center",
                padding: 60,
                color: "var(--text-light, #8993a3)",
              }}
            >
              <Shield size={60} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: 14 }}>
                {t("Chọn 1 người dùng để phân quyền")}
              </p>
            </div>
          ) : (
            <>
              {/* Header + buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                  paddingBottom: 16,
                  borderBottom: "1px solid var(--border-color, #eef2f7)",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3
                    style={{
                      margin: 0,
                      color: "var(--text-primary, #172033)",
                      fontSize: 16,
                    }}
                  >
                    {selectedUser.name}
                  </h3>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted, #64748b)",
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selectedUser.email} ·{" "}
                    <span style={{ color: "#2634d5", fontWeight: 600 }}>
                      {ROLE_LABEL[selectedUser.role]}
                    </span>
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={resetCustom}
                    disabled={saving || !isEditing}
                    style={btnToolbarStyle({
                      disabled: saving || !isEditing,
                    })}
                    title={t("Xóa hết quyền custom")}
                  >
                    <RotateCcw size={13} /> {t("Reset")}
                  </button>

                  {!isEditing ? (
                    <button
                      onClick={startEdit}
                      disabled={saving || loadingPerms}
                      style={btnToolbarStyle({
                        disabled: saving || loadingPerms,
                        primary: true,
                      })}
                    >
                      <Edit size={13} /> {t("Sửa")}
                    </button>
                  ) : (
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      style={btnToolbarStyle({
                        disabled: saving,
                        danger: true,
                      })}
                    >
                      <X size={13} /> {t("Hủy")}
                    </button>
                  )}

                  <button
                    onClick={save}
                    disabled={saving || !isEditing}
                    style={btnSaveStyle({ disabled: saving || !isEditing })}
                  >
                    {saving ? (
                      <>
                        <Loader2
                          size={13}
                          style={{ animation: "spin 1s linear infinite" }}
                        />
                        {t("Đang lưu...")}
                      </>
                    ) : (
                      <>
                        <Save size={13} /> {t("Lưu thay đổi")}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Mode indicator */}
              {isEditing && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "#92400e",
                    borderRadius: 8,
                    fontSize: 12,
                    marginBottom: 12,
                    fontWeight: 600,
                  }}
                >
                  ✏️ {t("Đang ở chế độ chỉnh sửa — tick/bỏ tick quyền, sau đó bấm")}{" "}
                  "{t("Lưu thay đổi")}"
                </div>
              )}

              {/* Loading quyền */}
              {loadingPerms ? (
                <div style={loadingSmallStyle}>
                  <Loader2
                    size={22}
                    style={{
                      animation: "spin 1s linear infinite",
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ fontSize: 13 }}>{t("Đang tải quyền...")}</div>
                </div>
              ) : groupedPermissions.length === 0 ? (
                <div style={emptySmallStyle}>
                  {t("Không có quyền nào để phân")}
                </div>
              ) : (
                // ✅ #13.1: Render theo group
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  {groupedPermissions.map((group) => {
                    const GroupIcon = group.icon;
                    const defaults = roleDefaults[selectedUser.role] || [];

                    const checkedCount = group.items.filter((p) =>
                      userPerms.permissions?.includes(p.key)
                    ).length;
                    const totalCount = group.items.length;

                    const editableKeys = group.items
                      .map((p) => p.key)
                      .filter((k) => !defaults.includes(k));
                    const editableChecked = editableKeys.filter((k) =>
                      userPerms.custom?.includes(k)
                    ).length;
                    const allGroupSelected =
                      editableKeys.length > 0 &&
                      editableChecked === editableKeys.length;

                    return (
                      <div
                        key={group.prefix}
                        style={{
                          border: "1px solid var(--border-color, #e5e9ef)",
                          borderRadius: 12,
                          overflow: "hidden",
                        }}
                      >
                        {/* Group header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            background: group.color + "10",
                            borderBottom: "1px solid var(--border-color, #e5e9ef)",
                            gap: 10,
                            flexWrap: "wrap",
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
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: group.color + "25",
                                color: group.color,
                                display: "grid",
                                placeItems: "center",
                                flexShrink: 0,
                              }}
                            >
                              <GroupIcon size={15} />
                            </div>
                            <b
                              style={{
                                fontSize: 13.5,
                                color: "var(--text-primary, #172033)",
                              }}
                            >
                              {group.label}
                            </b>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: group.color,
                                background: group.color + "18",
                                padding: "2px 8px",
                                borderRadius: 10,
                              }}
                            >
                              {checkedCount}/{totalCount}
                            </span>
                          </div>

                          {/* ✅ #13.4: Nút chọn tất cả per group */}
                          {editableKeys.length > 0 && (
                            <button
                              onClick={() => toggleGroup(group)}
                              disabled={!isEditing || saving}
                              style={{
                                padding: "4px 10px",
                                background: "transparent",
                                border: "1px solid " + group.color + "50",
                                color: group.color,
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor:
                                  !isEditing || saving
                                    ? "not-allowed"
                                    : "pointer",
                                opacity: !isEditing || saving ? 0.5 : 1,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {allGroupSelected
                                ? t("Bỏ chọn nhóm")
                                : t("Chọn cả nhóm")}
                            </button>
                          )}
                        </div>

                        {/* Group items grid */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: 8,
                            padding: 12,
                          }}
                        >
                          {group.items.map((p) => {
                            const isDefault = defaults.includes(p.key);
                            const isChecked = userPerms.permissions?.includes(
                              p.key
                            );
                            const disabled = isDefault || !isEditing || saving;

                            return (
                              <button
                                key={p.key}
                                onClick={() => togglePerm(p.key)}
                                disabled={disabled}
                                title={
                                  isDefault
                                    ? t("Quyền mặc định theo role — không thể bỏ")
                                    : !isEditing
                                    ? t("Bấm Sửa để chỉnh")
                                    : ""
                                }
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: 10,
                                  background: isChecked
                                    ? "rgba(24, 169, 103, 0.08)"
                                    : "var(--bg-tertiary, #f8fafc)",
                                  border: isChecked
                                    ? "2px solid #18a967"
                                    : "2px solid var(--border-color, #e5e9ef)",
                                  borderRadius: 10,
                                  cursor: disabled
                                    ? "not-allowed"
                                    : "pointer",
                                  textAlign: "left",
                                  opacity: isDefault
                                    ? 0.75
                                    : isEditing
                                    ? 1
                                    : 0.9,
                                  transition: "all 0.15s",
                                }}
                              >
                                <div
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 4,
                                    background: isChecked
                                      ? "#18a967"
                                      : "transparent",
                                    border: isChecked
                                      ? "0"
                                      : "2px solid var(--border-color, #cbd5e1)",
                                    display: "grid",
                                    placeItems: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  {isChecked && (
                                    <Check size={12} color="#fff" />
                                  )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 500,
                                      color: "var(--text-primary, #172033)",
                                    }}
                                  >
                                    {t(p.label)}
                                  </div>
                                  {/* ✅ #13.2: Font đậm rõ hơn */}
                                  {isDefault && (
                                    <div
                                      style={{
                                        fontSize: 11.5,
                                        color: "#2634d5",
                                        fontWeight: 700,
                                        marginTop: 3,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 3,
                                      }}
                                    >
                                      <Shield size={10} />
                                      {t("Mặc định theo role")}
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
            </>
          )}
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @media (max-width: 900px) {
            .perm-layout {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>

      {/* ConfirmDialog */}
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
// STYLE CONSTANTS
// ============================================================

const loadingFullStyle = {
  padding: 60,
  textAlign: "center",
  color: "var(--text-light, #8993a3)",
};

const errorFullStyle = {
  padding: 40,
  textAlign: "center",
  background: "rgba(239, 68, 68, 0.08)",
  border: "1px solid rgba(239, 68, 68, 0.2)",
  borderRadius: 12,
  color: "#ef4444",
};

const loadingSmallStyle = {
  padding: 30,
  textAlign: "center",
  color: "var(--text-light, #8993a3)",
  fontSize: 13,
};

const emptySmallStyle = {
  padding: 20,
  textAlign: "center",
  color: "var(--text-light, #8993a3)",
  fontSize: 12,
};

const btnPrimaryStyle = {
  padding: "8px 16px",
  background: "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

const btnToolbarStyle = ({ disabled, primary, danger }) => ({
  padding: "8px 14px",
  background: "var(--bg-tertiary, #f5f7fb)",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  cursor: disabled ? "not-allowed" : "pointer",
  color: danger ? "#ef4444" : "var(--text-primary, #172033)",
  fontSize: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontWeight: 600,
  opacity: disabled ? 0.5 : 1,
});

const btnSaveStyle = ({ disabled }) => ({
  padding: "8px 14px",
  background: disabled ? "#94a3b8" : "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  opacity: disabled ? 0.5 : 1,
});