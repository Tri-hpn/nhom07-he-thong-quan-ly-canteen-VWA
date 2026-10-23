import { useState, useEffect } from "react";
import { X, Settings, Edit, Save, History } from "lucide-react";
import { api } from "../api";
import { toast } from "./Effects";

export default function RulesModal({ isAdmin = false, onClose }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ratePoints, setRatePoints] = useState(200);
  const [greenPoints, setGreenPoints] = useState(300);
  const [reviewPoints, setReviewPoints] = useState(500);
  const [subsidyPoints, setSubsidyPoints] = useState(10000);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.settings.get().then((res) => {
      if (res) {
        setRatePoints(res.rate_points || 200);
        setGreenPoints(res.green_points || 300);
        setReviewPoints(res.review_points || 500);
        setSubsidyPoints(res.subsidy_points || 10000);
        setHistory(res.rules_history || []);
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.settings.update({
        rate_points: Number(ratePoints),
        green_points: Number(greenPoints),
        review_points: Number(reviewPoints),
        subsidy_points: Number(subsidyPoints)
      });
      toast("Đã lưu cấu hình Quy tắc Xu", "success");
      setIsEditing(false);
      const res = await api.settings.get();
      if (res && res.rules_history) setHistory(res.rules_history);
    } catch (e) {
      toast(e.message || "Lỗi khi lưu", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--card-bg, #fff)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 550, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
            <Settings size={22} color="#2634d5" /> {showHistory ? "Lịch sử thay đổi Xu" : "Quy tắc tích Xu VWA"}
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            {isAdmin && !isEditing && !showHistory && (
              <>
                <button type="button" onClick={() => setShowHistory(true)} style={{ padding: "8px 14px", background: "var(--bg-tertiary, #f5f7fb)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <History size={16} /> Lịch sử
                </button>
                <button type="button" onClick={() => setIsEditing(true)} style={{ padding: "8px 14px", background: "#2634d5", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <Edit size={16} /> Chỉnh sửa
                </button>
              </>
            )}
            {isAdmin && isEditing && !showHistory && (
              <>
                <button type="button" onClick={() => setIsEditing(false)} style={{ padding: "8px 14px", background: "var(--bg-tertiary, #f5f7fb)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Hủy</button>
                <button type="button" onClick={handleSave} disabled={saving} style={{ padding: "8px 14px", background: "#18a967", color: "#fff", border: 0, borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <Save size={16} /> {saving ? "Đang lưu..." : "Lưu lại"}
                </button>
              </>
            )}
            {showHistory && (
              <button type="button" onClick={() => setShowHistory(false)} style={{ padding: "8px 14px", background: "var(--bg-tertiary, #f5f7fb)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Quay lại</button>
            )}
            <button onClick={onClose} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-light)", display: "flex", alignItems: "center" }}>
              <X size={24} />
            </button>
          </div>
        </div>

        {showHistory ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", color: "#64748b", padding: 20 }}>Chưa có lịch sử thay đổi.</div>
            ) : (
              history.slice().reverse().map((h, i) => (
                <div key={i} style={{ background: "var(--bg-tertiary, #f8fafc)", padding: 12, borderRadius: 8, fontSize: 13, border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <b>{h.rule}</b>
                    <span style={{ color: "#64748b", fontSize: 12 }}>{new Date(h.time).toLocaleString("vi-VN")}</span>
                  </div>
                  <div>Đã đổi từ <b>{h.old_value}</b> thành <b style={{ color: "#18a967" }}>{h.new_value}</b></div>
                  <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>Người đổi: {h.changed_by}</div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f4f7f9", borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>💡</span> Giá trị quy đổi Xu
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>1 Xu tương đương 100đ khi đổi voucher hoặc thanh toán theo quy định.</div>
              </div>
              <div style={{ fontWeight: 700, color: "#18a967", whiteSpace: "nowrap", marginLeft: 12 }}>1 Xu = 100đ</div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f4f7f9", borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>🍽️</span> Hoàn thành đơn hàng
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Tự động cộng Xu khi đơn hàng được hoàn thành thành công.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
                {isEditing ? <input type="number" value={ratePoints} onChange={(e) => setRatePoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} /> : <div style={{ fontWeight: 700, color: "#18a967", whiteSpace: "nowrap" }}>+{ratePoints} Xu</div>}
                {isAdmin && <input type="checkbox" checked={true} disabled={!isEditing} style={{ width: 18, height: 18, accentColor: "#18a967" }} />}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f4f7f9", borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>🌱</span> Sống Xanh Học Đường
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Mang hộp đựng cá nhân khi mua đồ ăn và được nhân viên xác nhận.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
                {isEditing ? <input type="number" value={greenPoints} onChange={(e) => setGreenPoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} /> : <div style={{ fontWeight: 700, color: "#18a967", whiteSpace: "nowrap" }}>+{greenPoints} Xu</div>}
                {isAdmin && <input type="checkbox" checked={true} disabled={!isEditing} style={{ width: 18, height: 18, accentColor: "#18a967" }} />}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f4f7f9", borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>⭐</span> Đánh giá món ăn
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Nhận Xu khi đánh giá món ăn đã mua thành công.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
                {isEditing ? <input type="number" value={reviewPoints} onChange={(e) => setReviewPoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} /> : <div style={{ fontWeight: 700, color: "#18a967", whiteSpace: "nowrap" }}>+{reviewPoints} Xu</div>}
                {isAdmin && <input type="checkbox" checked={true} disabled={!isEditing} style={{ width: 18, height: 18, accentColor: "#18a967" }} />}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f4f7f9", borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>🎓</span> Trợ giá sinh viên
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Giảm trực tiếp trên đơn hàng dành cho sinh viên theo chính sách áp dụng.</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
                {isEditing ? <input type="number" value={subsidyPoints} onChange={(e) => setSubsidyPoints(e.target.value)} style={{ width: 90, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} /> : <div style={{ fontWeight: 700, color: "#ef4444", whiteSpace: "nowrap" }}>-{Number(subsidyPoints).toLocaleString("vi-VN")}đ</div>}
                {isAdmin && <input type="checkbox" checked={true} disabled={!isEditing} style={{ width: 18, height: 18, accentColor: "#18a967" }} />}
              </div>
            </div>
          </div>
        )}

        <button onClick={onClose} style={{ width: "100%", padding: 14, marginTop: 24, background: "#2634d5", color: "#fff", border: 0, borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          Đóng
        </button>
      </div>
    </div>
  );
}