const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. KHÔI PHỤC 3 FILE TỪ GIT (Trả về trạng thái trước khi bị lỗi)
try {
  console.log("⏳ Đang khôi phục code gốc từ Git...");
  execSync('git restore src/components/Layout.jsx src/components/Sidebar.jsx src/styles.css', { stdio: 'inherit' });
  console.log("✅ Đã khôi phục Layout, Sidebar và styles.css");
} catch (e) {
  console.log("⚠️ Không thể khôi phục từ Git, sẽ tiếp tục sửa trực tiếp.");
}

// 2. THÊM LẠI AVATAR VÀO TOPBAR (Layout.jsx)
const layoutPath = path.join(process.cwd(), "src/components/Layout.jsx");
let layoutRaw = fs.readFileSync(layoutPath, "utf8").replace(/\r\n/g, "\n");

const newTopbar = `
              {/* User Profile & Settings */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {user && (
                  <div onClick={() => navigate(role === "ADMIN" ? "/owner/profile" : "/employee/profile")} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0284C7", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, overflow: "hidden" }}>
                      {user.name ? user.name.slice(0, 2).toUpperCase() : "AD"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)" }}>{user.name || "Quản trị viên"}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted, #64748b)" }}>{role === "ADMIN" ? "Quản trị viên" : "Nhân viên"}</span>
                    </div>
                  </div>
                )}
                <button type="button" className="topbar-icon-btn" onClick={openSettings} style={{ background: "transparent", border: 0, cursor: "pointer" }}>
                  <Settings size={20} />
                </button>
                <NotificationBell />
              </div>`;

if (!layoutRaw.includes("User Profile & Settings")) {
  layoutRaw = layoutRaw.replace(/<NotificationBell \/>/g, newTopbar);
  fs.writeFileSync(layoutPath, layoutRaw, "utf8");
  console.log("✅ 1. Đã thêm Avatar vào Topbar");
}

// 3. CHÈN CSS CƯỠNG CHẾ (CHỈ DÙNG FLEXBOX)
const cssPath = path.join(process.cwd(), "src/styles.css");
let cssRaw = fs.readFileSync(cssPath, "utf8");

const finalCss = `

/* ============================================================
   BULLETPROOF LAYOUT (SIDEBAR DỌC - KHÔNG THỂ VỠ)
   ============================================================ */

/* 1. Khung chính: Xếp 2 cột (Sidebar và Nội dung) */
.app-shell {
  display: flex !important;
  flex-direction: row !important;
  width: 100vw !important;
  height: 100vh !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* 2. Sidebar: Cố định chiều rộng, tự cuộn */
.sidebar, aside {
  width: 260px !important;
  flex-shrink: 0 !important;
  height: 100vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow-y: auto !important;
  position: relative !important; /* Bỏ fixed để tuân theo Flexbox */
  margin: 0 !important;
  border-right: 1px solid #e2e8f0 !important;
}

/* 3. Ép thẻ <a> bên trong Menu phải xếp dọc */
.sidebar nav, aside nav {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 !important;
  padding: 0 12px !important;
}

.sidebar nav a, aside nav a, .nav-link {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  width: 100% !important;
  white-space: normal !important;
  padding: 10px 14px !important;
  margin-bottom: 4px !important;
  box-sizing: border-box !important;
}

/* 4. Main: Chiếm phần còn lại bên phải */
.main, main.main, .admin-shell .main {
  flex: 1 !important;
  width: auto !important;
  height: 100vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  margin-left: 0 !important; /* Xóa margin cũ gây phình to */
  padding-left: 0 !important;
}

/* 5. Topbar đứng im */
.topbar {
  position: sticky !important;
  top: 0 !important;
  z-index: 50 !important;
  flex-shrink: 0 !important;
}

/* 6. Nội dung cuộn */
.page-content {
  flex: 1 !important;
  overflow-y: auto !important;
}

/* 7. Customer Layout không có Sidebar */
.app-shell.customer-layout .main {
  width: 100% !important;
}
`;

fs.writeFileSync(cssPath, cssRaw + finalCss, "utf8");
console.log("✅ 2. Đã chèn CSS Bulletproof (Flexbox)");

console.log("🎉 HOÀN THÀNH! Hãy Ctrl+C -> npm start -> F5 để xem kết quả.");
