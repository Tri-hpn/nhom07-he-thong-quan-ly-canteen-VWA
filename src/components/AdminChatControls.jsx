// ============================================================
// ADMINCHATCONTROLS.JSX — Panel điều khiển chat cho Admin (V2)
// ============================================================
// V2 (2026-11):
//   🔧 FIX CRITICAL: toggleGlobal dùng nhầm `newEnabled` (var hoisted,
//      undefined) thay vì `newState` → title/danger/confirmText SAI khi
//      bật lại chat toàn hệ thống.
//   🔧 FIX: Thêm getToken() guard cho loadStaff, loadRequests,
//      và polling interval → chặn spam 401/403 mỗi 3s khi hết phiên.
// ============================================================

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Lock, Unlock, UserCog, ShieldAlert, Check, X, Loader2,
  ToggleLeft, ToggleRight, Users, Headset, RefreshCw, Inbox,
} from "lucide-react";
import { api, getToken } from "../api";
import { toast } from "./Effects";
import { useI18n } from "../hooks/useI18n";
import ConfirmDialog from "./ConfirmDialog";

const POLL_MS = 3000;

export default function AdminChatControls({
  onTransferCountChange,
  onTakeoverUser,
}) {
  const { t } = useI18n();

  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [globalLoading, setGlobalLoading] = useState(false);

  const [staffList, setStaffList] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [processingReqId, setProcessingReqId] = useState(null);

  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const reqIdRef = useRef(0);
  const tabVisibleRef = useRef(
    typeof document === "undefined" || !document.hidden
  );

  useEffect(() => {
    const handler = () => {
      tabVisibleRef.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ============================================================
  // LOAD ALL
  // ============================================================
  const loadStaff = useCallback(async () => {
    // 🔧 FIX V2: guard token
    if (!getToken()) {
      setStaffLoading(false);
      return;
    }
    try {
      const data = await api.chat.admin.staffStatus();
      if (data && typeof data === "object") {
        setGlobalEnabled(!!data.global_enabled);
        setStaffList(Array.isArray(data.staff) ? data.staff : []);
      } else {
        setStaffList([]);
      }
    } catch {
      setStaffList([]);
    } finally {
      setStaffLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    // 🔧 FIX V2: guard token
    if (!getToken()) {
      setRequestsLoading(false);
      return;
    }
    try {
      const data = await api.chat.admin.transferRequests("pending");
      const list = Array.isArray(data) ? data : [];
      setRequests(list);
      if (onTransferCountChange) onTransferCountChange(list.length);
    } catch {
      setRequests([]);
      if (onTransferCountChange) onTransferCountChange(0);
    } finally {
      setRequestsLoading(false);
    }
  }, [onTransferCountChange]);

  useEffect(() => {
    loadStaff();
    loadRequests();
  }, [loadStaff, loadRequests]);

  // Polling
  useEffect(() => {
    const timer = setInterval(() => {
      if (!tabVisibleRef.current) return;
      // 🔧 FIX V2: guard token trước khi gọi
      if (!getToken()) return;
      loadRequests();
      const myId = ++reqIdRef.current;
      if (myId % 5 === 0) loadStaff();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadStaff, loadRequests]);

  // ============================================================
  // GLOBAL TOGGLE
  // 🔧 FIX V2 CRITICAL: dùng `newState`, KHÔNG dùng `newEnabled`
  // ============================================================
  const toggleGlobal = () => {
    const newState = !globalEnabled;
    setConfirm({
      title: newState
        ? t("Bật chat toàn hệ thống?")
        : t("TẮT chat toàn hệ thống?"),
      message: newState
        ? t("Mọi nhân viên sẽ được phép nhắn tin với khách trở lại.")
        : t("TẤT CẢ nhân viên sẽ KHÔNG thể nhắn tin với khách cho đến khi bạn bật lại."),
      confirmText: newState ? t("Bật") : t("TẮT NGAY"),
      cancelText: t("Hủy"),
      danger: !newState,
      onConfirm: async () => {
        setGlobalLoading(true);
        try {
          await api.chat.admin.toggleGlobal(newState);
          setGlobalEnabled(newState);
          toast(
            newState
              ? t("Đã BẬT chat toàn hệ thống")
              : t("Đã TẮT chat toàn hệ thống"),
            newState ? "success" : "warning"
          );
          setConfirm(null);
        } catch (e) {
          toast(e.message || t("Không đổi được trạng thái"), "error");
        } finally {
          setGlobalLoading(false);
        }
      },
    });
  };

  // ============================================================
  // STAFF TOGGLE
  // ============================================================
  const toggleStaff = async (emp) => {
    if (togglingId !== null) return;
    const newState = !emp.chat_enabled;
    setTogglingId(emp.id);
    setStaffList((list) =>
      list.map((x) => (x.id === emp.id ? { ...x, chat_enabled: newState } : x))
    );
    try {
      await api.chat.admin.toggleStaff(emp.id, newState);
      toast(
        newState
          ? `${t("Đã BẬT chat cho")} ${emp.name}`
          : `${t("Đã TẮT chat của")} ${emp.name}`,
        newState ? "success" : "warning"
      );
    } catch (e) {
      setStaffList((list) =>
        list.map((x) =>
          x.id === emp.id ? { ...x, chat_enabled: !newState } : x
        )
      );
      toast(e.message || t("Không đổi được trạng thái"), "error");
    } finally {
      setTogglingId(null);
    }
  };

  // ============================================================
  // REQUEST RESOLVE
  // ============================================================
  const resolveRequest = useCallback(
    async (req, status) => {
      if (processingReqId !== null) return;
      setProcessingReqId(req.id);
      try {
        await api.chat.admin.resolveTransfer(req.id, status);
        toast(
          status === "accepted"
            ? `${t("Đã tiếp quản hội thoại của")} ${req.customer_name || t("khách")}`
            : `${t("Đã từ chối yêu cầu của")} ${req.from_staff_name || t("nhân viên")}`,
          status === "accepted" ? "success" : "info"
        );
        setRequests((list) => list.filter((x) => x.id !== req.id));
        if (onTransferCountChange) {
          onTransferCountChange(Math.max(0, requests.length - 1));
        }
        if (status === "accepted" && onTakeoverUser) {
          onTakeoverUser(req.customer_id);
        }
      } catch (e) {
        toast(e.message || t("Không xử lý được"), "error");
      } finally {
        setProcessingReqId(null);
      }
    },
    [processingReqId, requests.length, onTransferCountChange, onTakeoverUser, t]
  );

  // ============================================================
  // CONFIRM helpers
  // ============================================================
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

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      <div className="admin-chat-panel">
        {/* ============ SECTION 1: GLOBAL ============ */}
        <div className={`admin-chat-card ${globalEnabled ? "" : "admin-chat-card--danger"}`}>
          <div className="admin-chat-card__head">
            <div className="admin-chat-card__head-left">
              <div className={`admin-chat-card__icon ${globalEnabled ? "admin-chat-card__icon--success" : "admin-chat-card__icon--danger"}`}>
                {globalEnabled ? <Unlock size={16} /> : <Lock size={16} />}
              </div>
              <div>
                <div className="admin-chat-card__title">
                  {t("Chat toàn hệ thống")}
                </div>
                <div className="admin-chat-card__sub">
                  {globalEnabled
                    ? t("Nhân viên đang được phép nhắn khách")
                    : t("ĐÃ TẮT — không ai nhắn được khách")}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="admin-chat-toggle-btn"
              onClick={toggleGlobal}
              disabled={globalLoading}
              aria-pressed={globalEnabled}
              title={globalEnabled ? t("Bấm để TẮT toàn hệ thống") : t("Bấm để BẬT lại")}
            >
              {globalLoading ? (
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              ) : globalEnabled ? (
                <ToggleRight size={28} color="#18a967" />
              ) : (
                <ToggleLeft size={28} color="#ef4444" />
              )}
            </button>
          </div>

          {!globalEnabled && (
            <div className="admin-chat-card__alert">
              <ShieldAlert size={14} />
              <span>{t("Mọi nhân viên đang bị chặn gửi tin. Admin vẫn có thể nhắn bình thường.")}</span>
            </div>
          )}
        </div>

        {/* ============ SECTION 2: STAFF LIST ============ */}
        <div className="admin-chat-card">
          <div className="admin-chat-card__head admin-chat-card__head--no-action">
            <div className="admin-chat-card__head-left">
              <div className="admin-chat-card__icon admin-chat-card__icon--info">
                <Users size={16} />
              </div>
              <div>
                <div className="admin-chat-card__title">
                  {t("Nhân viên")} ({staffList.length})
                </div>
                <div className="admin-chat-card__sub">
                  {t("Bật/tắt quyền nhắn tin từng người")}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="admin-chat-icon-btn"
              onClick={loadStaff}
              disabled={staffLoading}
              title={t("Làm mới")}
            >
              <RefreshCw size={14} style={{ animation: staffLoading ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>

          <div className="admin-chat-staff-list">
            {staffLoading && staffList.length === 0 ? (
              <div className="admin-chat-staff-empty">
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                <span>{t("Đang tải...")}</span>
              </div>
            ) : staffList.length === 0 ? (
              <div className="admin-chat-staff-empty">
                <UserCog size={20} />
                <span>{t("Chưa có nhân viên nào")}</span>
              </div>
            ) : (
              staffList.map((emp) => {
                const enabled = !!emp.chat_enabled;
                const isToggling = togglingId === emp.id;
                const blocked = !globalEnabled;

                return (
                  <div
                    key={emp.id}
                    className={`admin-chat-staff-item ${!enabled || blocked ? "admin-chat-staff-item--off" : ""}`}
                  >
                    <div className="admin-chat-staff-item__info">
                      <div className="admin-chat-staff-item__name">
                        {emp.name}
                      </div>
                      <div className="admin-chat-staff-item__meta">
                        {emp.email}
                        {blocked && (
                          <span style={{ color: "#ef4444", marginLeft: 6 }}>
                            • {t("Bị chặn bởi công tắc chung")}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="admin-chat-toggle-btn admin-chat-toggle-btn--sm"
                      onClick={() => toggleStaff(emp)}
                      disabled={isToggling || blocked}
                      aria-pressed={enabled}
                      title={
                        blocked
                          ? t("Công tắc chung đang TẮT")
                          : enabled
                          ? t("Bấm để TẮT chat của nhân viên này")
                          : t("Bấm để BẬT chat cho nhân viên này")
                      }
                    >
                      {isToggling ? (
                        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                      ) : enabled ? (
                        <ToggleRight size={24} color="#18a967" />
                      ) : (
                        <ToggleLeft size={24} color="#94a3b8" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ============ SECTION 3: TRANSFER REQUESTS ============ */}
        <div className="admin-chat-card admin-chat-card--highlight">
          <div className="admin-chat-card__head admin-chat-card__head--no-action">
            <div className="admin-chat-card__head-left">
              <div className="admin-chat-card__icon admin-chat-card__icon--warning">
                <Inbox size={16} />
              </div>
              <div>
                <div className="admin-chat-card__title">
                  {t("Yêu cầu chuyển tiếp")}
                  {requests.length > 0 && (
                    <span className="admin-chat-badge">{requests.length}</span>
                  )}
                </div>
                <div className="admin-chat-card__sub">
                  {t("Nhân viên xin Admin tiếp quản hội thoại")}
                </div>
              </div>
            </div>
          </div>

          <div className="admin-chat-requests">
            {requestsLoading && requests.length === 0 ? (
              <div className="admin-chat-staff-empty">
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                <span>{t("Đang tải...")}</span>
              </div>
            ) : requests.length === 0 ? (
              <div className="admin-chat-staff-empty">
                <Check size={20} color="#18a967" />
                <span>{t("Không có yêu cầu nào đang chờ")}</span>
              </div>
            ) : (
              requests.map((req) => {
                const isProcessing = processingReqId === req.id;
                return (
                  <div key={req.id} className="admin-chat-request-item">
                    <div className="admin-chat-request-item__body">
                      <div className="admin-chat-request-item__row">
                        <Headset size={13} />
                        <b>{req.from_staff_name || t("Nhân viên")}</b>
                        <span style={{ color: "var(--st-text-muted)" }}>
                          → {t("khách")} <b>{req.customer_name || `#${req.customer_id}`}</b>
                        </span>
                      </div>
                      {req.reason && (
                        <div className="admin-chat-request-item__reason">
                          <span style={{ color: "var(--st-text-light)" }}>
                            {t("Lý do")}
                          </span>{" "}
                          {req.reason}
                        </div>
                      )}
                      <div className="admin-chat-request-item__time">
                        {req.created_at
                          ? new Date(req.created_at).toLocaleString("vi-VN")
                          : ""}
                      </div>
                    </div>

                    <div className="admin-chat-request-item__actions">
                      <button
                        type="button"
                        className="admin-chat-mini-btn admin-chat-mini-btn--danger"
                        onClick={() => resolveRequest(req, "rejected")}
                        disabled={isProcessing}
                        title={t("Từ chối")}
                      >
                        <X size={13} /> {t("Từ chối")}
                      </button>
                      <button
                        type="button"
                        className="admin-chat-mini-btn admin-chat-mini-btn--success"
                        onClick={() => resolveRequest(req, "accepted")}
                        disabled={isProcessing}
                        title={t("Tiếp quản ngay")}
                      >
                        {isProcessing ? (
                          <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <Check size={13} />
                        )}
                        {t("Tiếp quản")}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ""}
        message={confirm?.message || ""}
        confirmText={confirm?.confirmText || t("Xác nhận")}
        cancelText={confirm?.cancelText || t("Hủy")}
        danger={confirm?.danger}
        loading={confirmBusy}
        onConfirm={runConfirm}
        onClose={closeConfirm}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .admin-chat-panel {
          display: flex;
          flex-direction: column;
          gap: 12px;
          height: 100%;
          overflow-y: auto;
          padding-right: 4px;
        }

        .admin-chat-card {
          background: var(--st-surface, #fff);
          border: 1px solid var(--st-outline-light, #e7ebf0);
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .admin-chat-card--danger {
          border-color: rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.04);
        }

        .admin-chat-card--highlight {
          border-color: rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.03);
        }

        .admin-chat-card__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .admin-chat-card__head-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }

        .admin-chat-card__icon {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          background: var(--st-surface-container, #eaedff);
          color: var(--st-text);
        }

        .admin-chat-card__icon--success {
          background: rgba(24, 169, 103, 0.12);
          color: #18a967;
        }

        .admin-chat-card__icon--danger {
          background: rgba(239, 68, 68, 0.12);
          color: #ef4444;
        }

        .admin-chat-card__icon--info {
          background: rgba(38, 52, 213, 0.12);
          color: #2634d5;
        }

        .admin-chat-card__icon--warning {
          background: rgba(245, 158, 11, 0.15);
          color: #b45309;
        }

        .admin-chat-card__title {
          font-family: var(--st-font-head);
          font-size: 13px;
          font-weight: 700;
          color: var(--st-text);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .admin-chat-card__sub {
          font-family: var(--st-font-body);
          font-size: 11.5px;
          color: var(--st-text-muted);
          margin-top: 2px;
          line-height: 1.4;
        }

        .admin-chat-card__alert {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #dc2626;
          font-family: var(--st-font-body);
          font-size: 11.5px;
          line-height: 1.5;
        }

        .admin-chat-toggle-btn {
          background: transparent;
          border: 0;
          cursor: pointer;
          padding: 2px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }

        .admin-chat-toggle-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .admin-chat-toggle-btn--sm {
          padding: 0;
        }

        .admin-chat-icon-btn {
          background: transparent;
          border: 0;
          cursor: pointer;
          color: var(--st-text-muted);
          padding: 4px;
          display: grid;
          place-items: center;
          border-radius: 6px;
        }

        .admin-chat-icon-btn:hover {
          background: var(--st-surface-container, #eaedff);
        }

        .admin-chat-staff-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 240px;
          overflow-y: auto;
        }

        .admin-chat-staff-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          background: var(--st-surface-low, #f5f7fb);
          border: 1px solid transparent;
          transition: all 0.15s;
        }

        .admin-chat-staff-item--off {
          background: rgba(148, 163, 184, 0.1);
          border-color: rgba(148, 163, 184, 0.3);
        }

        .admin-chat-staff-item__info {
          flex: 1;
          min-width: 0;
        }

        .admin-chat-staff-item__name {
          font-family: var(--st-font-body);
          font-size: 12.5px;
          font-weight: 600;
          color: var(--st-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .admin-chat-staff-item__meta {
          font-family: var(--st-font-body);
          font-size: 11px;
          color: var(--st-text-light);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .admin-chat-staff-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 20px 10px;
          font-family: var(--st-font-body);
          font-size: 12px;
          color: var(--st-text-muted);
        }

        .admin-chat-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 9px;
          background: #ef4444;
          color: #fff;
          font-size: 10px;
          font-weight: 800;
        }

        .admin-chat-requests {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
        }

        .admin-chat-request-item {
          padding: 10px;
          border-radius: 10px;
          background: var(--st-surface, #fff);
          border: 1px solid rgba(245, 158, 11, 0.3);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .admin-chat-request-item__body {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .admin-chat-request-item__row {
          display: flex;
          align-items: center;
          gap: 5px;
          font-family: var(--st-font-body);
          font-size: 12px;
          color: var(--st-text);
          flex-wrap: wrap;
        }

        .admin-chat-request-item__reason {
          font-family: var(--st-font-body);
          font-size: 11.5px;
          color: var(--st-text-muted);
          line-height: 1.5;
          padding: 6px 8px;
          background: var(--st-surface-low, #f5f7fb);
          border-radius: 6px;
        }

        .admin-chat-request-item__time {
          font-family: var(--st-font-body);
          font-size: 10.5px;
          color: var(--st-text-light);
        }

        .admin-chat-request-item__actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }

        .admin-chat-mini-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 10px;
          border-radius: 6px;
          font-family: var(--st-font-head);
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s;
        }

        .admin-chat-mini-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .admin-chat-mini-btn--danger {
          background: #fff;
          color: #dc2626;
          border-color: #dc2626;
        }

        .admin-chat-mini-btn--danger:hover:not(:disabled) {
          background: #dc2626;
          color: #fff;
        }

        .admin-chat-mini-btn--success {
          background: #18a967;
          color: #fff;
        }

        .admin-chat-mini-btn--success:hover:not(:disabled) {
          background: #128a53;
        }
      `}</style>
    </>
  );
}