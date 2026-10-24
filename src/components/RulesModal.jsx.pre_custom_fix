import { useState, useEffect } from "react";
import { X, Settings, Edit, Save, History } from "lucide-react";
import { api } from "../api";
import { toast } from "./Effects";

export default function RulesModal({ isAdmin = false, onClose, liveData = null }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const [ratePoints, setRatePoints] = useState(liveData?.rate_points || 200);
  const [greenPoints, setGreenPoints] = useState(liveData?.green_points || 300);
  const [reviewPoints, setReviewPoints] = useState(liveData?.review_points || 500);
  const [subsidyPoints, setSubsidyPoints] = useState(liveData?.subsidy_points || 10000);
  
  const [rateDesc, setRateDesc] = useState(liveData?.rate_desc || "");
  const [greenDesc, setGreenDesc] = useState(liveData?.green_desc || "");
  const [reviewDesc, setReviewDesc] = useState(liveData?.review_desc || "");
  const [subsidyDesc, setSubsidyDesc] = useState(liveData?.subsidy_desc || "");
  
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (liveData) {
      setRatePoints(liveData.rate_points);
      setGreenPoints(liveData.green_points);
      setReviewPoints(liveData.review_points);
      setSubsidyPoints(liveData.subsidy_points);
      setRateDesc(liveData.rate_desc);
      setGreenDesc(liveData.green_desc);
      setReviewDesc(liveData.review_desc);
      setSubsidyDesc(liveData.subsidy_desc);
    } else {
      api.settings.get().then((res) => {
        if (res) {
          setRatePoints(res.rate_points || 200);
          setGreenPoints(res.green_points || 300);
          setReviewPoints(res.review_points || 500);
          setSubsidyPoints(res.subsidy_points || 10000);
          setRateDesc(res.rate_desc || "Điều kiện nhận thưởng: Đơn hàng được hoàn thành thành công.\nCách cộng Xu: Hệ thống tự động cộng Xu vào tài khoản sau khi đơn hàng hoàn thành.\nTrường hợp không được thưởng: Đơn hàng chưa hoàn thành hoặc đã bị hủy sẽ không được nhận Xu thưởng.\nKiểm tra Xu: Xem số Xu được cộng trong mục Lịch sử Xu.");
          setGreenDesc(res.green_desc || "Điều kiện tham gia: Mang hộp đựng cá nhân khi mua đồ ăn mang về.\nCách nhận thưởng: Thông báo với nhân viên tại quầy để được kiểm tra và xác nhận hợp lệ. Sau khi được duyệt, bạn nhận Xu.\nGiới hạn thưởng: Mỗi đơn hàng chỉ được nhận thưởng Sống Xanh một lần.\nLưu ý: Mang hộp cá nhân nhưng chưa được nhân viên xác nhận thì chưa đủ điều kiện nhận Xu.");
          setReviewDesc(res.review_desc || "Điều kiện nhận thưởng: Đơn hàng đã hoàn thành và món ăn được đánh giá là món bạn đã mua.\nCách nhận thưởng: Chọn số sao và gửi nhận xét về món ăn thông qua chức năng đánh giá.\nMức thưởng: Nhận Xu cho mỗi lượt đánh giá hợp lệ.\nGiới hạn thưởng: Mỗi tài khoản chỉ được nhận thưởng một lần cho mỗi món ăn; đánh giá trùng lặp không được cộng thêm Xu.");
          setSubsidyDesc(res.subsidy_desc || "Chương trình hỗ trợ một phần chi phí bữa ăn cho sinh viên đủ điều kiện. Khoản trợ giá được tính bằng VNĐ và được trừ trực tiếp vào tiền suất ăn, không cộng vào số dư Xu.\nMức trợ giá: Hỗ trợ tối đa 10.000đ cho mỗi suất ăn đủ điều kiện.\nĐiều kiện áp dụng: Suất ăn có giá từ 25.000đ trở lên và thanh toán theo hình thức được chương trình quy định tại quầy.\nCách nhận trợ giá: Chọn suất ăn đủ điều kiện và thực hiện thanh toán tại quầy theo hướng dẫn của căng tin. Khoản trợ giá được áp dụng khi giao dịch đáp ứng điều kiện chương trình.\nHạn mức hỗ trợ: Số tiền trợ giá phụ thuộc vào ngân sách quỹ và số suất ăn còn được hỗ trợ trong kỳ.\nTheo dõi quyền lợi: Bạn có thể xem hạn mức trợ giá còn lại, số suất đã sử dụng trong tháng và tiến độ sử dụng trên giao diện chương trình.\nLưu ý: Trợ giá là khoản giảm trực tiếp bằng VNĐ, không phải Xu. Mức hỗ trợ thực tế không vượt quá 10.000đ cho mỗi suất ăn và phụ thuộc vào điều kiện, hạn mức còn lại của chương trình.");
          setHistory(res.rules_history || []);
        }
      }).catch(() => {});
    }
  }, [liveData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.settings.update({
        rate_points: Number(ratePoints),
        green_points: Number(greenPoints),
        review_points: Number(reviewPoints),
        subsidy_points: Number(subsidyPoints),
        rate_desc: rateDesc,
        green_desc: greenDesc,
        review_desc: reviewDesc,
        subsidy_desc: subsidyDesc
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
      <div style={{ background: "var(--card-bg, #fff)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 650, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
            <Settings size={22} color="#2634d5" /> {showHistory ? "Lịch sử thay đổi Xu" : "Quy tắc tích và sử dụng Xu VWA"}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#2634d5" }}>1. Quy tắc tích và sử dụng Xu VWA</h4>
              
              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#172033" }}>🍽️ Hoàn thành đơn hàng</b>
                  <span style={{ fontWeight: 700, color: "#18a967" }}>
                    {isEditing ? <input type="number" value={ratePoints} onChange={(e) => setRatePoints(e.target.value)} style={{ width: 70, padding: 4, textAlign: "right", borderRadius: 4, border: "1px solid #cbd5e1" }} /> : `+${ratePoints} Xu`}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-line" }}>{rateDesc}</div>
              </div>

              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#172033" }}>🌱 Sống Xanh Học Đường</b>
                  <span style={{ fontWeight: 700, color: "#18a967" }}>
                    {isEditing ? <input type="number" value={greenPoints} onChange={(e) => setGreenPoints(e.target.value)} style={{ width: 70, padding: 4, textAlign: "right", borderRadius: 4, border: "1px solid #cbd5e1" }} /> : `+${greenPoints} Xu`}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-line" }}>{greenDesc}</div>
              </div>

              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#172033" }}>⭐ Đánh giá món ăn</b>
                  <span style={{ fontWeight: 700, color: "#18a967" }}>
                    {isEditing ? <input type="number" value={reviewPoints} onChange={(e) => setReviewPoints(e.target.value)} style={{ width: 70, padding: 4, textAlign: "right", borderRadius: 4, border: "1px solid #cbd5e1" }} /> : `+${reviewPoints} Xu`}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-line" }}>{reviewDesc}</div>
              </div>

              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#172033" }}>💰 Sử dụng Xu khi thanh toán</b>
                  <span style={{ fontWeight: 700, color: "#18a967" }}>1 Xu = 1 VNĐ</span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-line" }}>Tỷ lệ quy đổi: 1 Xu = 1 VNĐ.
Cách sử dụng: Dùng Xu để giảm trực tiếp số tiền cần thanh toán khi đặt hàng.
Giới hạn sử dụng: Số Xu được dùng tối đa bằng 30% giá trị đơn hàng và không vượt quá số dư Xu hiện có trong tài khoản.
Thanh toán phần còn lại: Số tiền chưa được trừ bằng Xu sẽ được thanh toán theo phương thức hệ thống hỗ trợ.
Ví dụ: Với đơn hàng 100.000đ, bạn có thể sử dụng tối đa 30.000 Xu để giảm 30.000đ, còn phải thanh toán 70.000đ.
Lưu ý: Xu dùng để giảm trực tiếp tiền đơn hàng, không phải voucher và không được quy đổi trực tiếp thành tiền mặt.</div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#2634d5" }}>2. Ưu đãi khác</h4>
              <div style={{ padding: "14px 16px", background: "#fff7ed", borderRadius: 10, border: "1px solid #fed7aa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#c2410c" }}>🎓 Trợ giá sinh viên — Quỹ Học Đường</b>
                  <span style={{ fontWeight: 700, color: "#ef4444" }}>
                    {isEditing ? <input type="number" value={subsidyPoints} onChange={(e) => setSubsidyPoints(e.target.value)} style={{ width: 80, padding: 4, textAlign: "right", borderRadius: 4, border: "1px solid #cbd5e1" }} /> : `Tối đa -${Number(subsidyPoints).toLocaleString("vi-VN")}đ`}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#9a3412", lineHeight: 1.6, whiteSpace: "pre-line" }}>{subsidyDesc}</div>
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