const fs = require('fs');
const parser = require('@babel/parser');
const path = 'src/pages/owner/OwnerVouchers.jsx';
let c = fs.readFileSync(path, 'utf8');

// Hàm tìm thẻ đóng tương ứng
function findMatchingDiv(str, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < str.length; i++) {
    if (str.substring(i, i + 4) === '<div') depth++;
    else if (str.substring(i, i + 6) === '</div>') {
      depth--;
      if (depth === 0) return i + 6;
    }
  }
  return -1;
}

// ===== 1. DỌN DẸP FLASH SALE =====
const flashText = 'Kích hoạt Deal Sốc (Flash Sale)';
const flashTextIdx = c.indexOf(flashText);

if (flashTextIdx > -1) {
  // Lùi về tìm thẻ div đầu tiên (xa nhất) chứa khối Flash Sale
  let startIdx = flashTextIdx;
  while (startIdx > 0) {
    let prevDiv = c.lastIndexOf('<div', startIdx);
    let prevComment = c.lastIndexOf('{/*', startIdx);
    
    // Nếu gặp comment đóng hoặc thẻ form thì dừng
    if (prevDiv === -1 || (prevComment > -1 && prevComment > prevDiv)) break;
    
    // Kiểm tra xem div này có phải là div bọc flash sale không (thường có background cam)
    let snippet = c.substring(prevDiv, prevDiv + 200);
    if (snippet.includes('formIsFlashSale') || snippet.includes('rgba(245, 158, 11') || snippet.includes('marginTop')) {
      startIdx = prevDiv;
    } else {
      break;
    }
  }

  const endIdx = findMatchingDiv(c, startIdx);

  if (startIdx > -1 && endIdx > -1) {
    const newFlash = `<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", boxSizing: "border-box", marginTop: 0, marginBottom: 16, padding: "12px 16px", background: "rgba(245, 158, 11, 0.05)", borderRadius: 10, border: formIsFlashSale ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--border-color, #e5e9ef)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontWeight: 700, color: formIsFlashSale ? "#f59e0b" : "var(--text-primary, #172033)" }}>
                <Zap size={18} style={{ flexShrink: 0 }} />
                <span>Kích hoạt Deal Sốc (Flash Sale)</span>
              </div>
              <input type="checkbox" checked={formIsFlashSale} onChange={(e) => setFormIsFlashSale(e.target.checked)} disabled={saving} style={{ width: 20, height: 20, accentColor: "#f59e0b", cursor: saving ? "not-allowed" : "pointer", margin: 0, flexShrink: 0 }} />
            </div>`;
    
    c = c.substring(0, startIdx) + newFlash + c.substring(endIdx);
    console.log('✅ Đã dọn dẹp Flash Sale (xoá các khung lồng nhau)');
  }
}

// ===== 2. FIX RADIO (Grid chia đôi, chữ hiện rõ) =====
const radioLabel = '<label style={labelStyle}>Đối tượng áp dụng *</label>';
const radioStart = c.indexOf(radioLabel);
const nextBlock = '<div style={{ display: "flex", gap: 10, marginTop: 20 }}>';
const radioEnd = c.indexOf(nextBlock, radioStart);

if (radioStart > -1 && radioEnd > -1) {
  const newRadio = `<label style={labelStyle}>Đối tượng áp dụng *</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16, width: "100%" }}>
              <label style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                border: targetAudience === "all" ? "2px solid #2634d5" : "1px solid var(--border-color, #e5e9ef)",
                background: targetAudience === "all" ? "rgba(38, 52, 213, 0.05)" : "var(--card-bg, #fff)",
                transition: "all 0.2s", boxSizing: "border-box"
              }}>
                <input type="radio" name="target_audience" checked={targetAudience === "all"} onChange={() => { setTargetAudience("all"); setSelectedUserId(""); }} style={{ width: 16, height: 16, accentColor: "#2634d5", margin: 0, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: targetAudience === "all" ? "#2634d5" : "var(--text-primary, #172033)", whiteSpace: "nowrap" }}>
                  🌐 Toàn bộ
                </span>
              </label>

              <label style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                border: targetAudience === "specific" ? "2px solid #2634d5" : "1px solid var(--border-color, #e5e9ef)",
                background: targetAudience === "specific" ? "rgba(38, 52, 213, 0.05)" : "var(--card-bg, #fff)",
                transition: "all 0.2s", boxSizing: "border-box"
              }}>
                <input type="radio" name="target_audience" checked={targetAudience === "specific"} onChange={() => { setTargetAudience("specific"); if (!selectedUserId && customers.length > 0) setSelectedUserId(String(customers[0].id)); }} style={{ width: 16, height: 16, accentColor: "#2634d5", margin: 0, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: targetAudience === "specific" ? "#2634d5" : "var(--text-primary, #172033)", whiteSpace: "nowrap" }}>
                  👤 Chỉ định 1 khách
                </span>
              </label>
            </div>

            {targetAudience === "specific" && (
              <select
                name="user_id"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={saving}
                style={inputStyle}
              >
                <option value="">— Chọn khách hàng —</option>
                {customers.map((cu) => (
                  <option key={cu.id} value={cu.id}>{cu.name} ({cu.email})</option>
                ))}
              </select>
            )}

            {targetAudience === "all" && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(236, 72, 153, 0.08)", border: "1px solid rgba(236, 72, 153, 0.25)", borderRadius: 8, fontSize: 12, color: "#ec4899", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Globe size={14} style={{ flexShrink: 0 }} /> Voucher sẽ hiện ở trang "Ưu đãi" cho mọi khách nhận
              </div>
            )}

            `;

  c = c.substring(0, radioStart) + newRadio + c.substring(radioEnd);
  console.log('✅ Đã fix Radio (Chữ hiện đầy đủ)');
}

// ===== 3. VERIFY & LƯU =====
try {
  parser.parse(c, { sourceType: 'module', plugins: ['jsx', 'classProperties'] });
  fs.writeFileSync(path, c, 'utf8');
  console.log('\n🎉 HOÀN TẤT! Ấn Ctrl+Shift+R trên trình duyệt.');
} catch (e) {
  console.log('\n❌ Lỗi cú pháp: ' + e.message);
}
