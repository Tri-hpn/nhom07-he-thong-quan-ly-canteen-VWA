import { useState, useEffect } from "react";
import { X, Settings } from "lucide-react";
import { api } from "../api";

export default function RulesModal({ onClose, liveData = null }) {
  const [fetchedData, setFetchedData] = useState(null);

  useEffect(() => {
    // Luôn luôn cập nhật Realtime nếu có liveData
    if (!liveData) {
      api.points.config().then(res => {
        if (res) setFetchedData(res);
      }).catch(() => {});
    }
  }, [liveData]);

  // NẾU CÓ liveData (từ trang Admin) -> Dùng luôn (Realtime). NẾU KHÔNG -> Dùng data fetch từ API.
  const sourceData = liveData || fetchedData || {};
  const data = sourceData.earn ? {
    rate_points: sourceData.earn.rate_points,
    green_points: sourceData.earn.green_points,
    review_points: sourceData.earn.review_points,
    subsidy_points: sourceData.earn.subsidy_points,
    rate_desc: sourceData.earn.rate_desc,
    green_desc: sourceData.earn.green_desc,
    review_desc: sourceData.earn.review_desc,
    subsidy_desc: sourceData.earn.subsidy_desc,
    custom_programs: sourceData.earn.custom_programs,
    rate_enabled: sourceData.earn.rate_enabled,
    green_enabled: sourceData.earn.green_enabled,
    review_enabled: sourceData.earn.review_enabled,
    subsidy_enabled: sourceData.earn.subsidy_enabled
  } : sourceData;

  const ratePoints = data.rate_points ?? 100;
  const greenPoints = data.green_points ?? 200;
  const reviewPoints = data.review_points ?? 500;
  const subsidyPoints = data.subsidy_points ?? 10000;
  
  const rateDesc = data.rate_desc || "Điều kiện nhận thưởng: Đơn hàng được hoàn thành thành công.\nCách cộng Xu: Hệ thống tự động cộng Xu vào tài khoản sau khi đơn hàng hoàn thành.\nTrường hợp không được thưởng: Đơn hàng chưa hoàn thành hoặc đã bị hủy sẽ không được nhận Xu thưởng.\nKiểm tra Xu: Xem số Xu được cộng trong mục Lịch sử Xu.";
  const greenDesc = data.green_desc || "Điều kiện tham gia: Mang hộp đựng cá nhân khi mua đồ ăn mang về.\nCách nhận thưởng: Thông báo với nhân viên tại quầy để được kiểm tra và xác nhận hợp lệ. Sau khi được duyệt, bạn nhận Xu.\nGiới hạn thưởng: Mỗi đơn hàng chỉ được nhận thưởng Sống Xanh một lần.\nLưu ý: Mang hộp cá nhân nhưng chưa được nhân viên xác nhận thì chưa đủ điều kiện nhận Xu.";
  const reviewDesc = data.review_desc || "Điều kiện nhận thưởng: Đơn hàng đã hoàn thành và món ăn được đánh giá là món bạn đã mua.\nCách nhận thưởng: Chọn số sao và gửi nhận xét về món ăn thông qua chức năng đánh giá.\nMức thưởng: Nhận Xu cho mỗi lượt đánh giá hợp lệ.\nGiới hạn thưởng: Mỗi tài khoản chỉ được nhận thưởng một lần cho mỗi món ăn; đánh giá trùng lặp không được cộng thêm Xu.";
  const subsidyDesc = data.subsidy_desc || "Chương trình hỗ trợ một phần chi phí bữa ăn cho sinh viên đủ điều kiện. Khoản trợ giá được tính bằng VNĐ và được trừ trực tiếp vào tiền suất ăn, không cộng vào số dư Xu.\nMức trợ giá: Hỗ trợ tối đa 10.000đ cho mỗi suất ăn đủ điều kiện.\nĐiều kiện áp dụng: Suất ăn có giá từ 25.000đ trở lên và thanh toán theo hình thức được chương trình quy định tại quầy.\nCách nhận trợ giá: Chọn suất ăn đủ điều kiện và thực hiện thanh toán tại quầy theo hướng dẫn của căng tin. Khoản trợ giá được áp dụng khi giao dịch đáp ứng điều kiện chương trình.\nHạn mức hỗ trợ: Số tiền trợ giá phụ thuộc vào ngân sách quỹ và số suất ăn còn được hỗ trợ trong kỳ.\nTheo dõi quyền lợi: Bạn có thể xem hạn mức trợ giá còn lại, số suất đã sử dụng trong tháng và tiến độ sử dụng trên giao diện chương trình.\nLưu ý: Trợ giá là khoản giảm trực tiếp bằng VNĐ, không phải Xu. Mức hỗ trợ thực tế không vượt quá 10.000đ cho mỗi suất ăn và phụ thuộc vào điều kiện, hạn mức còn lại của chương trình.";
  
  const customPrograms = data.custom_programs || [];
  const rateEnabled = data.rate_enabled !== false;
  const greenEnabled = data.green_enabled !== false;
  const reviewEnabled = data.review_enabled !== false;
  const subsidyEnabled = data.subsidy_enabled !== false;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--card-bg, #fff)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 650, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
            <Settings size={22} color="#2634d5" /> Quy tắc tích và sử dụng Xu VWA
          </h3>
          <button onClick={onClose} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-light)", display: "flex", alignItems: "center" }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 16, color: "#2634d5" }}>1. Quy tắc tích và sử dụng Xu VWA</h4>
            
            {rateEnabled && (
              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#172033" }}>🍽️ Hoàn thành đơn hàng</b>
                  <span style={{ fontWeight: 700, color: "#18a967" }}>+{ratePoints} Xu</span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-line" }}>{rateDesc}</div>
              </div>
            )}

            {greenEnabled && (
              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#172033" }}>🌱 Sống Xanh Học Đường</b>
                  <span style={{ fontWeight: 700, color: "#18a967" }}>+{greenPoints} Xu</span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-line" }}>{greenDesc}</div>
              </div>
            )}

            {reviewEnabled && (
              <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#172033" }}>⭐ Đánh giá món ăn</b>
                  <span style={{ fontWeight: 700, color: "#18a967" }}>+{reviewPoints} Xu</span>
                </div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-line" }}>{reviewDesc}</div>
              </div>
            )}

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
            
            {subsidyEnabled && (
              <div style={{ padding: "14px 16px", background: "#fff7ed", borderRadius: 10, border: "1px solid #fed7aa", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#c2410c" }}>🎓 Trợ giá sinh viên — Quỹ Học Đường</b>
                  <span style={{ fontWeight: 700, color: "#ef4444" }}>Tối đa -{Number(subsidyPoints).toLocaleString("vi-VN")}đ</span>
                </div>
                <div style={{ fontSize: 13, color: "#9a3412", lineHeight: 1.6, whiteSpace: "pre-line" }}>{subsidyDesc}</div>
              </div>
            )}

            {customPrograms && customPrograms.length > 0 && customPrograms.map((prog) => (
              <div key={prog.id} style={{ padding: "14px 16px", background: "#f0f9ff", borderRadius: 10, border: "1px solid #bae6fd", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15, color: "#0369a1" }}>{prog.name}</b>
                  <span style={{ fontWeight: 700, color: "#0284c7" }}>+{Number(prog.points).toLocaleString("vi-VN")} Xu</span>
                </div>
                <div style={{ fontSize: 13, color: "#0c4a6e", lineHeight: 1.6, whiteSpace: "pre-line" }}>{prog.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={onClose} style={{ width: "100%", padding: 14, marginTop: 24, background: "#2634d5", color: "#fff", border: 0, borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          Đóng
        </button>
      </div>
    </div>
  );
}