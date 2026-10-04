# Canteen VWA - Hệ thống quản lý Canteen

Hệ thống đặt món và quản lý Canteen dành cho khách hàng, nhân viên và quản trị viên.

**Trạng thái:** Production-ready - deploy tại [https://canteen-goo.vercel.app](https://canteen-goo.vercel.app)

## Mục lục

1. [Tính năng](#1-tính-năng)
2. [Stack công nghệ](#2-stack-công-nghệ)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Cài đặt Local](#4-cài-đặt-local)
5. [Biến môi trường](#5-biến-môi-trường)
6. [Scripts có sẵn](#6-scripts-có-sẵn)
7. [Tài khoản demo](#7-tài-khoản-demo-seed-data)
8. [Deploy Production](#8-deploy-production)
9. [Testing & QA](#9-testing--qa)
10. [Troubleshooting](#10-troubleshooting)
11. [Changelog](#11-changelog)
12. [Bảo mật - Cần đọc](#12-bảo-mật---cần-đọc)
13. [License & Credits](#13-license--credits)

---

## 1. Tính năng

### Khách hàng (Customer)
- Xem thực đơn, tìm kiếm, lọc theo danh mục
- Đặt món, thêm topping, chọn size
- Thanh toán: Tiền mặt / VietQR / Ví Canteen
- Tích điểm, đổi voucher, nhận ưu đãi
- Chat với nhân viên hoặc ChatBot AI (gợi ý món theo giá/chủ đề)
- Quản lý ví Canteen (nạp / rút / liên kết ngân hàng)
- Xem lịch sử đơn hàng, đánh giá món đã mua
- Dark mode + responsive mobile
- Đa ngôn ngữ (Tiếng Việt / English)

### Nhân viên (Employee)
- Chấm công check-in / check-out theo ca
- Xử lý đơn hàng: xác nhận → chuẩn bị → sẵn sàng → hoàn thành
- Xem thực đơn, bật / tắt món
- Chat hỗ trợ khách hàng
- Đăng ký ca làm việc tuần sau
- Nhận nhắc nhở trước ca 30 phút

### Quản trị viên (Admin)
- Dashboard doanh thu realtime + KPI trend
- Quản lý nhân viên, khách hàng, phân quyền chi tiết (9 nhóm permissions)
- Quản lý thực đơn, danh mục (có icon + thứ tự), kho nguyên liệu
- Quản lý ca làm việc, chấm công
- Báo cáo chuyên sâu (date range, so sánh kỳ, hourly chart, export CSV)
- Tài chính (tài khoản nhận tiền, chi phí, lợi nhuận, đối soát)
- Quản lý voucher (template + personal), ví Canteen (duyệt nạp/rút)
- Lịch sử thay đổi giá món
- Backup / restore / reset database

---

## 2. Stack công nghệ

- **Frontend:** React 18, Vite 5, React Router v6
- **Backend:** Express 5, JWT auth, bcryptjs
- **Database:** MongoDB Atlas (production), File JSON (dev fallback)
- **Charts:** Recharts 2
- **Icons:** Lucide React
- **Styles:** CSS thuần (không Tailwind)
- **Deploy:** Vercel (Frontend), Node.js runtime (Backend), MongoDB Atlas (Database)

---

## 3. Cấu trúc thư mục

```text
canteengo/
├── src/
│   ├── api.js                    # HTTP client + 401 interceptor
│   ├── App.jsx                   # Root + routing + auth-expired listener
│   ├── main.jsx                  # Entry point
│   ├── i18n.js                   # Đa ngôn ngữ (VI / EN)
│   ├── bannerSlides.js           # Config banner
│   ├── styles.css                # Global styles
│   ├── styles-sky.css            # Theme xanh da trời
│   ├── components/               # 30+ UI components dùng chung
│   │   ├── ConfirmDialog.jsx
│   │   ├── Effects.jsx
│   │   ├── Skeleton.jsx
│   │   ├── Layout.jsx
│   │   ├── Sidebar.jsx
│   │   ├── BottomNav.jsx
│   │   ├── HeaderNav.jsx
│   │   ├── FoodDetailModal.jsx
│   │   ├── PaymentModal.jsx
│   │   ├── ChatBotWidget.jsx
│   │   ├── NotificationBell.jsx
│   │   └── ... (còn nhiều component khác)
│   └── pages/
│       ├── Login.jsx
│       ├── Register.jsx
│       ├── ForgotPassword.jsx
│       ├── StaffProfile.jsx
│       ├── customer/             # 12 trang khách hàng
│       ├── employee/             # 5 trang nhân viên
│       └── owner/                # 16 trang quản trị
├── server-json.js                # Backend Express (single file)
├── test-fixes.ps1                # Regression test (PowerShell - Yêu cầu Windows)
├── split.mjs                     # Utility tách/merge DB JSON
├── vite.config.js
├── vercel.json
├── index.html
├── package.json
├── .env.example
└── README.md
```

> **Lưu ý:** Các file `Dockerfile`, `Dockerfile.backend`, `.dockerignore`, `render.yaml`, `nginx.conf` đã được xoá vì dự án không sử dụng Docker.

---

## 4. Cài đặt Local

### Yêu cầu
- **Node.js >= 22** (tải tại [https://nodejs.org](https://nodejs.org)) — vì `concurrently@10` cần Node ≥ 22
- **npm >= 10** (đi kèm Node)
- (Tuỳ chọn) MongoDB Atlas account - nếu không có sẽ dùng file JSON local

### Các bước

```bash
# 1. Clone repo
git clone https://github.com/Tri-hpn/nhom07-he-thong-quan-ly-canteen-VWA.git
cd nhom07-he-thong-quan-ly-canteen-VWA

# 2. Cài dependencies
npm install

# 3. Tạo file .env từ template
cp .env.example .env
# Mở .env, sửa JWT_SECRET thành chuỗi random mạnh:
#   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Chạy dev (FE + BE song song trong 1 terminal)
npm start
```

Sau khi chạy:
- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:3000](http://localhost:3000)

---

## 5. Biến môi trường

Tạo file `.env` ở thư mục gốc dự án (đã có template `.env.example`):

- `JWT_SECRET` **(bắt buộc)**: Secret ký JWT, đổi thành chuỗi random dài
- `PORT` (không bắt buộc): Port backend, default `3000`
- `MONGO_URI` (không bắt buộc): Chuỗi kết nối MongoDB Atlas. Để trống sẽ dùng file JSON local
- `NODE_ENV` (không bắt buộc): `development` hoặc `production`
- `VITE_API_URL` (không bắt buộc): URL backend cho frontend, default `/api`

---

## 6. Scripts có sẵn

- `npm start`: Chạy FE (5173) + BE (3000) cùng lúc. Dùng hàng ngày.
- `npm run dev`: Chỉ frontend. Khi backend đã chạy terminal khác.
- `npm run server`: Chỉ backend. Khi frontend đã chạy terminal khác.
- `npm run build`: Build production frontend. Trước khi deploy.
- `npm run preview`: Preview bản build. Kiểm tra bản production.
- `npm run db:migrate-images`: Tách ảnh món ăn đang nhúng base64 trong document chính sang collection `menu_images` (chạy trên server, có tự động sao lưu). Xem mục **8. Database → Ảnh món ăn**.

---

## 7. Tài khoản demo (seed data)

- Admin: `admin@vwa.vn` / `[Đã ẩn vì lý do bảo mật - Liên hệ Admin để lấy mật khẩu]`
- Nhân viên: `nhanvien@vwa.vn` / `[Đã ẩn vì lý do bảo mật - Liên hệ Admin để lấy mật khẩu]`
- Khách hàng: `sinhvien@vwa.vn` / `[Đã ẩn vì lý do bảo mật - Liên hệ Admin để lấy mật khẩu]`

> **CẢNH BÁO:** Đây là password demo, BẮT BUỘC đổi trước khi deploy production hoặc chia sẻ URL public.

---

## 8. Deploy Production

### Frontend - Vercel
1. Fork repo này lên GitHub
2. Vào [https://vercel.com](https://vercel.com) → Add New Project → import repo
3. Framework: Vite (auto-detect)
4. Build command: `npm run build`, Output: `dist`
5. File `vercel.json` đã có sẵn rewrite `/api/*` → backend

### Backend - Render (hoặc nền tảng hỗ trợ Node.js)
1. Vào [https://dashboard.render.com](https://dashboard.render.com) → New Web Service
2. Connect repo GitHub, chọn root directory chứa `server-json.js`
3. Runtime: Node
4. Build: `npm install`, Start: `node server-json.js`
5. Environment, thêm các biến:

```env
NODE_ENV        = production
JWT_SECRET      = <chuỗi random mạnh>
MONGO_URI       = <connection string MongoDB Atlas>
PORT            = 10000
```

6. Bấm Create Web Service, chờ deploy (~2 phút)

### Database - MongoDB Atlas
1. Tạo account tại [https://cloud.mongodb.com](https://cloud.mongodb.com)
2. Tạo Cluster M0 (free tier)
3. Database Access, tạo user + password
4. Network Access, Add IP `0.0.0.0/0` (cho phép mọi IP)
5. Connect → chọn Drivers → copy connection string
6. Dán vào biến `MONGO_URI` trên Render

### Ảnh món ăn — collection `menu_images`

Toàn bộ DB nằm trong **1 document** `canteen_db.main` (`data` là Mixed). Nếu ảnh món ăn
được nhúng thẳng dạng base64 vào document này thì mỗi lần khởi động server phải tải
**cả document** về → rất chậm (đã từng gặp: 15.47 MB, mỗi lần boot mất hàng phút và
thường treo ở dòng `⏳ Đang tải DB từ MongoDB...`), mỗi lần lưu DB cũng phải upload lại
từng đó dữ liệu.

Vì vậy ảnh món ăn được tách riêng:

| | |
|---|---|
| `canteen_db.main.data.menu_items[].image` | chỉ lưu đường dẫn ngắn `/api/uploads/menu/<id>?v=<rev>` |
| `menu_images` (collection) | mỗi ảnh 1 document `{ _id: "<id món>", image: "data:image/...", rev, contentType }` |
| `GET /api/uploads/menu/:id` | phục vụ ảnh (cache RAM 64 MB + cache trình duyệt theo `?v=<rev>`) |
| `canteen_db_backup_main` | bản sao document gốc, tạo tự động trước khi di trú (xoá được khi không cần) |

- Server **tự kiểm tra và tự di trú** mỗi lần khởi động (`migrateInlineMenuImages`), chạy
  **hoàn toàn trên server** bằng aggregation + `$merge` nên không phải tải 15 MB về máy.
  Document chính sau khi sạch ảnh chỉ còn ~0.15 MB → boot ~1-4 giây.
- Lệnh thủ công (khi cần làm ngay, có `--no-backup` để bỏ qua sao lưu):
  ```bash
  npm run db:migrate-images
  ```
- **Nén ảnh cũ (chạy 1 lần):** ảnh upload trước đây còn rất nặng (500-800 KB/ảnh). Mở
  `http://localhost:5173/shrink-menu-images.html` (khi app đang chạy), đăng nhập tài khoản
  ADMIN/EMPLOYEE rồi bấm **Bắt đầu nén** — trình duyệt sẽ resize + nén JPEG rồi lưu lại
  (nhẹ hơn ~6-10 lần). Chạy lại nhiều lần cũng an toàn.
- Ảnh upload **mới** đã được nén sẵn ở frontend (`ImageUploader` → canvas, tối đa 1280px)
  và server tự tách sang `menu_images` nên document chính không bao giờ phình lại.

---

## 9. Testing & QA

### Regression test tự động

File `test-fixes.ps1` chứa **14 case test cho 4 bug critical**. **Yêu cầu hệ điều hành Windows (PowerShell).**

```powershell
# Chạy local
.\test-fixes.ps1

# Chạy production
.\test-fixes.ps1 https://canteen-goo.onrender.com
```

Test bao gồm:
- **H1**: Hủy đơn hoàn kho + hoàn điểm (5 case)
- **H2**: Ví thiếu tiền không trừ kho (1 case)
- **H3**: Món inactive không đặt được (1 case)
- **H4**: qty ≤ 0 bị chặn (3 case)
- **H1-extra**: Customer tự hủy đơn hoàn kho + điểm (3 case)

Yêu cầu: PowerShell + đã login được admin.

### QA Checklist thủ công (trước khi go-live)

**Customer:**
- [ ] Đăng ký tài khoản mới, nhận 0 điểm
- [ ] Đăng nhập, thấy banner, best sellers, món mới
- [ ] Thêm món vào giỏ, tăng/giảm qty
- [ ] Áp voucher, thấy giảm giá
- [ ] Đặt hàng, payment modal, thanh toán
- [ ] Xem danh sách đơn hàng, trạng thái cập nhật
- [ ] Đánh giá món đã mua, +10 điểm
- [ ] Đổi 100 điểm, voucher 10k
- [ ] Nạp tiền vào ví (QR/CASH), admin duyệt, số dư tăng
- [ ] Chat với chatbot AI, nhận gợi ý
- [ ] Chat với nhân viên, nhận trả lời

**Employee:**
- [ ] Check-in ca sáng, thấy trong lịch sử
- [ ] Xử lý đơn: Chờ xác nhận → Đã xác nhận → Chuẩn bị → Sẵn sàng → Hoàn thành
- [ ] Bật/tắt món, thấy thay đổi ngay
- [ ] Đăng ký ca tuần sau, trạng thái "Chờ duyệt"
- [ ] Chat trả lời khách, khách nhận được

**Admin:**
- [ ] Dashboard hiện doanh thu + KPI trend
- [ ] Thêm/sửa/xóa món, kiểm tra lịch sử giá
- [ ] Thêm nhân viên mới, validate trùng email
- [ ] Duyệt đơn nạp ví, số dư cập nhật
- [ ] Phân quyền cho employee, tick/bỏ tick
- [ ] Backup, export file JSON, import lại, dữ liệu khôi phục
- [ ] Báo cáo: chọn range, export CSV, mở Excel

**Mobile:**
- [ ] Bottom nav hiện đúng (Customer)
- [ ] Sidebar hamburger (Employee/Admin)
- [ ] Banner responsive
- [ ] Bảng scroll ngang (không vỡ layout)
- [ ] Modal full-screen trên mobile
- [ ] Toast không bị che bởi bottom nav

---

## 10. Troubleshooting

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `npm error Missing script: "dev:all"` | Script không tồn tại | Dùng `npm start` |
| `JWT_SECRET chưa được set` | File `.env` thiếu biến | Copy `.env.example` → `.env` → thêm `JWT_SECRET` |
| `EADDRINUSE :::3000` | Port 3000 bị chiếm | `Get-Process node \| Stop-Process -Force` rồi chạy lại |
| `EADDRINUSE :::5173` | Port 5173 bị chiếm | Tương tự |
| `Cannot find module 'xxx'` | Chưa cài dependencies | Chạy `npm install` |
| Render cold start (~30s) | Free tier spin down sau 15 phút idle | Chờ 30s cho lần request đầu |
| Mongo connect timeout | Chưa whitelist IP trên Atlas | Vào Network Access → Add `0.0.0.0/0` |
| Server treo ở `⏳ Đang tải DB từ MongoDB...` | Document chính chứa ảnh base64 (~15 MB) nên mỗi lần boot phải tải cả 15 MB | Server tự tách ảnh khi khởi động; nếu vẫn treo: `npm run db:migrate-images` |
| Ảnh món ăn tải rất chậm / trang thực đơn lâu hiện ảnh | Ảnh cũ chưa nén (500-800 KB/ảnh) | Mở `http://localhost:5173/shrink-menu-images.html` → **Bắt đầu nén** |
| Đổi ảnh món nhưng trình duyệt vẫn thấy ảnh cũ | Cache theo `?v=<rev>` | F5; ảnh mới đã có `?v` mới nên không cần xoá cache |
| Data mất sau redeploy | Đang dùng file JSON trên Render | Set `MONGO_URI` để dùng MongoDB |
| `chmod: command not found` (Windows) | Lệnh Linux trên PowerShell | Dùng `bash script.sh` qua Git Bash |

---

## 11. Changelog

### Session 2 - Critical backend fixes (commit 29abb7a)
- **H1**: Hủy đơn không hoàn kho + không trừ lại điểm. Fix: Thêm `rollbackCancelledOrder()` trong `server-json.js`.
- **H2**: Wallet payment fail vẫn trừ kho. Fix: Rewrite `POST /api/orders` theo 7 bước trong `server-json.js`.
- **H3**: Đặt được món `active=0`. Fix: Check `if (!m.active) throw`.
- **H4**: Không validate qty > 0. Fix: Check `Number.isInteger(q) && q > 0`.
- **M1**: `saveDB` cố ghi Mongo khi connect fail. Fix: Thêm flag `mongoReady`.
- **M2**: API không handle 401. Fix: Thêm interceptor 401 + event `auth-expired` trong `api.js` + `App.jsx`.
- **M3**: Check-out "Về sớm" hardcode 17h. Fix: Dùng `SHIFT_END_HOUR` per shift.
- **M5**: Order code có thể trùng. Fix: Tăng retry lên 10 + random 5 chars.
- **L2**: Price history không ghi khi giá mới = 0. Fix: Đổi check `if (newPrice !== oldPrice)`.

Regression test: `test-fixes.ps1` (14 case, tất cả PASS).

### Session 1 - Batch 1 → 7
- **Batch 1**: UX Foundation (toast góc phải, modal padding, KPI font, sidebar blob).
- **Batch 1.5**: Bug lẻ (shifts duplicate, import stale, confirm() → ConfirmDialog).
- **Batch 2**: Load ALL + filter client, form giá auto-sync, searchable datalist.
- **Batch 3**: Inventory 3-state badges, vouchers validate trùng mã, persist filter.
- **Batch 4**: Finance, Wallet, Reports, Dashboard cải tiến.
- **Batch 5**: Employees, Permissions, Shifts, Customers cải tiến.
- **Batch 6**: Bỏ default nguy hiểm, settings rỗng không crash.
- **Batch 7**: N1 (timezone), N3 (order code unique), N4 (review hasPurchased).

---

## 12. Bảo mật - Cần đọc

### Trước khi public repo / URL

1. **Đổi password seed** của 3 tài khoản demo (admin@vwa.vn, nhanvien@vwa.vn, sinhvien@vwa.vn)
2. **Không commit file `.env`** (chỉ commit `.env.example`)
3. Kiểm tra `JWT_SECRET` trên Render đã set chưa: Render Dashboard → service → Environment → phải có `JWT_SECRET`
4. Xóa file tóm tắt session nếu có chứa credentials plaintext

### Đã làm tốt

- JWT với expiry 7 ngày
- bcrypt hash password (10 rounds)
- Validate input server-side (email, phone, qty, active)
- CORS whitelist đúng domain
- ConfirmDialog custom toàn app
- Timezone-safe date handling
- Race-safe loading (reqIdRef pattern)

### Backlog (cần cải thiện)

- Chưa có rate-limit cho `/api/auth/login`
- JWT lưu `sessionStorage` (vulnerable XSS)
- Chưa có CSRF protection

---

## 13. License & Credits

**MIT License** - Tự do sử dụng, sửa đổi, phân phối.

**Credits:**
- Frontend: React, Vite, Recharts, Lucide Icons
- Backend: Express, Mongoose, bcryptjs, jsonwebtoken
- Hạ tầng: Vercel, Render, MongoDB Atlas

---

*Made with love for VWA students - 2026 Canteen VWA*