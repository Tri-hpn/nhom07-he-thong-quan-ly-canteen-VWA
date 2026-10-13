<div align="center">

# 🍽️ Canteen VWA

### Hệ thống đặt món và quản lý canteen — Học viện Phụ nữ Việt Nam

Ứng dụng web hỗ trợ khách hàng đặt món, nhân viên xử lý đơn và quản trị viên quản lý hoạt động canteen trên cùng một nền tảng.

<p>
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite 5" />
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/Database-MongoDB-47A248?logo=mongodb&logoColor=white" alt="MongoDB" />
</p>

<p>
  <a href="https://github.com/Tri-hpn/nhom07-he-thong-quan-ly-canteen-VWA">
    <img src="https://img.shields.io/badge/GitHub-Repository-181717?logo=github" alt="GitHub repository" />
  </a>
  <img src="https://img.shields.io/badge/Status-Development-orange" alt="Project status" />
  <img src="https://img.shields.io/badge/Language-Vietnamese%20%7C%20i18n-blue" alt="Language support" />
</p>

</div>

---

## 👋 Giới thiệu

**Canteen VWA** là dự án xây dựng hệ thống web quản lý quy trình đặt món và vận hành canteen. Ứng dụng chia thành ba khu vực sử dụng chính:

- 🛍️ **Khách hàng:** xem thực đơn, đặt món, thanh toán, theo dõi đơn hàng và sử dụng điểm thưởng/voucher.
- 🧑‍🍳 **Nhân viên:** chấm công theo ca, tiếp nhận đơn và cập nhật tiến độ xử lý.
- 🛡️ **Quản trị viên:** quản lý tài khoản, thực đơn, ca làm, kho, voucher và báo cáo.

Mục tiêu của dự án là tập trung các nghiệp vụ canteen vào một hệ thống, giúp thao tác thuận tiện hơn và hỗ trợ quản lý dữ liệu rõ ràng.

> **Lưu ý:** tính khả dụng của một số chức năng phụ thuộc vào cấu hình môi trường, dữ liệu và quyền tài khoản. Trước khi công khai repository, hãy kiểm tra và loại bỏ `.env`, `.env.local`, dữ liệu cơ sở dữ liệu thật và thông tin đăng nhập khỏi Git.

## 🚀 Demo

- **Repository:** [nhom07-he-thong-quan-ly-canteen-VWA](https://github.com/Tri-hpn/nhom07-he-thong-quan-ly-canteen-VWA)
- **Chạy thử trên máy cá nhân:** xem phần [Cài đặt và chạy local](#-cài-đặt-và-chạy-local).

> Chưa điền đường dẫn website demo vì chưa xác nhận URL triển khai công khai.

## 🧐 Tính năng

## 📌 Giới thiệu

**Canteen VWA** là hệ thống web quản lý quy trình đặt món và vận hành canteen. Dự án tổ chức giao diện theo ba nhóm người dùng chính:

- **Khách hàng (Customer):** xem thực đơn, đặt món, thanh toán và theo dõi đơn hàng.
- **Nhân viên (Employee):** chấm công, tiếp nhận đơn và cập nhật tiến độ xử lý.
- **Quản trị viên (Owner/Admin):** quản lý người dùng, thực đơn, ca làm, kho, voucher và báo cáo.

README này mô tả cách cài đặt, chạy, kiểm thử và triển khai dự án. Các chức năng có thể phụ thuộc vào quyền tài khoản, dữ liệu và cấu hình môi trường.

> **Lưu ý trước khi công khai repository:** hãy kiểm tra và loại bỏ khỏi Git các file `.env`, `.env.local`, bản sao cơ sở dữ liệu, dữ liệu người dùng và thông tin đăng nhập. Không đưa secret hoặc dữ liệu thật vào README.

## 📚 Mục lục

- [✨ Tính năng](#-tính-năng)
- [🧰 Công nghệ sử dụng](#-công-nghệ-sử-dụng)
- [🏗️ Kiến trúc và cấu trúc thư mục](#️-kiến-trúc-và-cấu-trúc-thư-mục)
- [💻 Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
- [🚀 Cài đặt và chạy local](#-cài-đặt-và-chạy-local)
- [⚙️ Cấu hình biến môi trường](#️-cấu-hình-biến-môi-trường)
- [📜 Các lệnh npm](#-các-lệnh-npm)
- [🗃️ Dữ liệu và ảnh món ăn](#️-dữ-liệu-và-ảnh-món-ăn)
- [🧪 Kiểm thử và nghiệm thu](#-kiểm-thử-và-nghiệm-thu)
- [🌐 Triển khai production](#-triển-khai-production)
- [🛠️ Xử lý lỗi thường gặp](#️-xử-lý-lỗi-thường-gặp)
- [🔐 Bảo mật](#-bảo-mật)
- [📖 Tài liệu dự án](#-tài-liệu-dự-án)
- [🧭 Hướng phát triển](#-hướng-phát-triển)
- [📄 Giấy phép và ghi nhận](#-giấy-phép-và-ghi-nhận)

---

## ✨ Tính năng

### 🛍️ 1. Khu vực khách hàng

- Xem thực đơn, tìm kiếm món ăn và lọc theo danh mục.
- Xem chi tiết món ăn, lựa chọn size và topping khi được hỗ trợ.
- Quản lý giỏ hàng và tạo đơn hàng.
- Sử dụng các phương thức thanh toán được cấu hình trong ứng dụng, gồm tiền mặt, VietQR và ví Canteen.
- Tích lũy điểm, đổi điểm lấy voucher và sử dụng ưu đãi.
- Theo dõi trạng thái đơn hàng và xem lịch sử đặt món.
- Đánh giá món ăn đã mua.
- Sử dụng ví Canteen và gửi yêu cầu nạp/rút theo chức năng được triển khai.
- Trao đổi với nhân viên hoặc sử dụng chatbot hỗ trợ.
- Giao diện responsive, chế độ tối và hỗ trợ đa ngôn ngữ.

### 🧑‍🍳 2. Khu vực nhân viên

- Check-in/check-out theo ca làm việc.
- Tiếp nhận và xử lý đơn hàng theo từng trạng thái.
- Theo dõi đơn trong quá trình chuẩn bị và bàn giao.
- Xem thực đơn, bật/tắt món theo quyền được cấp.
- Trao đổi với khách hàng.
- Đăng ký ca làm việc theo chức năng hiện có.

### 🛡️ 3. Khu vực quản trị viên

- Dashboard tổng quan hoạt động và doanh thu.
- Quản lý tài khoản khách hàng, nhân viên và quyền truy cập.
- Quản lý thực đơn, danh mục, giá bán và trạng thái món.
- Quản lý kho nguyên liệu và tồn kho theo chức năng được triển khai.
- Quản lý ca làm việc và dữ liệu chấm công.
- Quản lý voucher, ưu đãi và các yêu cầu liên quan đến ví.
- Theo dõi báo cáo, thống kê và thông tin tài chính.
- Xem lịch sử thay đổi giá món.
- Thực hiện các chức năng sao lưu/khôi phục dữ liệu khi được cấu hình.

### 🌍 4. Trải nghiệm và hỗ trợ

- Hỗ trợ giao diện desktop và thiết bị di động.
- Chuyển đổi ngôn ngữ theo cơ chế đa ngôn ngữ của dự án.
- Thành phần giao diện dùng chung để giữ trải nghiệm nhất quán.
- Xử lý phiên đăng nhập hết hạn và thông báo thao tác.
- Tối ưu cách lưu và phục vụ ảnh món ăn để giảm kích thước dữ liệu chính.

---

## 🧰 Công nghệ sử dụng

Dự án sử dụng các công nghệ phổ biến trong hệ sinh thái JavaScript để phát triển giao diện, API và quy trình build.


| Thành phần | Công nghệ |
|---|---|
| Frontend | React 18 |
| Công cụ phát triển và build | Vite 5 |
| Điều hướng | React Router DOM 6 |
| Backend/API | Node.js, Express 5 |
| Xác thực | JSON Web Token (JWT), bcryptjs |
| Cơ sở dữ liệu | MongoDB, Mongoose |
| Biểu đồ | Recharts 2 |
| Biểu tượng | Lucide React |
| Giao diện | CSS thuần |
| Triển khai | Vercel theo cấu hình `vercel.json` |

### Luồng hoạt động khái quát

```text
┌───────────────────────────────┐
│         Người sử dụng         │
│ Customer / Employee / Admin   │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│       Frontend React          │
│  Giao diện, điều hướng, API    │
└───────────────┬───────────────┘
                │ HTTP / JSON
                ▼
┌───────────────────────────────┐
│       Backend Express         │
│ Xác thực, nghiệp vụ, phân quyền│
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ MongoDB / cơ chế lưu dữ liệu   │
│ Dữ liệu nghiệp vụ, ảnh món ăn  │
└───────────────────────────────┘
```

Sơ đồ trên mô tả kiến trúc logic ở mức khái quát. Cách kết nối thực tế phụ thuộc môi trường local hoặc production.

---

## 🏗️ Kiến trúc và cấu trúc thư mục

Cấu trúc dưới đây tập trung vào các thư mục và tệp chính trong repository:

```text
Canteengo/
├── api/
│   └── index.js                 # Entry point API serverless trên Vercel
├── public/
│   ├── icon.svg                 # Biểu tượng ứng dụng
│   ├── manifest.json            # Thông tin web app
│   └── shrink-menu-images.html  # Công cụ nén ảnh món ăn
├── src/
│   ├── components/              # Thành phần giao diện tái sử dụng
│   ├── contexts/                # Context dùng chung
│   ├── hooks/                   # Custom hooks
│   ├── lib/                     # Tiện ích dùng chung
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── ForgotPassword.jsx
│   │   └── ...                  # Các trang theo vai trò
│   ├── api.js                   # HTTP client gọi backend
│   ├── App.jsx                  # Thành phần gốc và điều hướng
│   ├── main.jsx                 # Điểm khởi chạy frontend
│   ├── bannerSlides.js          # Cấu hình banner
│   └── styles*.css              # Style toàn cục và theo khu vực
├── scripts/
│   ├── free-dev-ports.mjs       # Hỗ trợ kiểm tra/giải phóng cổng dev
│   ├── split.mjs                # Tiện ích tách/gộp dữ liệu
│   ├── auto-translate-locales.mjs
│   ├── backfill-from-mongo.mjs
│   └── ...                      # Script hỗ trợ dịch, kiểm tra và dữ liệu
├── docs/
│   ├── README.md                # Hướng dẫn tài liệu nghiệp vụ
│   ├── user-flows.md            # Luồng người dùng
│   ├── acceptance-criteria.md   # Tiêu chí nghiệm thu
│   └── test-cases.md            # Các trường hợp kiểm thử
├── server-json.js               # Backend Express
├── menuImageStore.js            # Xử lý lưu trữ/di trú ảnh món ăn
├── autoTranslate.js             # Hỗ trợ dịch tự động
├── vite.config.js               # Cấu hình Vite và proxy API
├── vite-plugin-i18n.mjs         # Plugin hỗ trợ đa ngôn ngữ
├── vercel.json                  # Cấu hình triển khai Vercel
├── package.json                 # Dependencies và npm scripts
├── package-lock.json            # Khóa phiên bản dependencies
├── .env.example                 # Mẫu cấu hình môi trường
└── README.md
```

**Một số tệp quan trọng:**

| Tệp | Vai trò |
|---|---|
| `src/App.jsx` | Thành phần gốc và điều hướng giao diện |
| `src/api.js` | Tập trung xử lý request đến API |
| `src/contexts/AuthContext.jsx` | Chia sẻ trạng thái xác thực trong frontend |
| `server-json.js` | Khởi tạo và xử lý backend Express |
| `api/index.js` | Chuyển tiếp ứng dụng Express cho Vercel Functions |
| `menuImageStore.js` | Xử lý dữ liệu ảnh món ăn |
| `vite.config.js` | Cấu hình dev server, proxy và build |
| `vercel.json` | Cấu hình build, function và rewrite URL |
| `package.json` | Khai báo scripts và thư viện |

---

## 💻 Yêu cầu hệ thống

Trước khi cài đặt, hãy chuẩn bị:

- **Node.js 22 trở lên** — phiên bản yêu cầu được khai báo trong `package.json`.
- **npm** — đi kèm với Node.js.
- **Git** — nếu clone dự án từ GitHub.
- **VS Code** — khuyến nghị để đọc và chỉnh sửa mã nguồn.
- **MongoDB** — tùy chọn theo môi trường; có thể cấu hình MongoDB Atlas hoặc MongoDB local.

Kiểm tra môi trường bằng Terminal:

```bash
node -v
npm -v
git --version
```

Nếu máy chưa nhận lệnh `node` hoặc `npm`, hãy cài Node.js và mở lại Terminal sau khi cài đặt.

---

## 🚀 Cài đặt và chạy local

### Bước 1 — Lấy mã nguồn

Nếu clone từ GitHub:

```bash
git clone https://github.com/Tri-hpn/nhom07-he-thong-quan-ly-canteen-VWA.git
cd nhom07-he-thong-quan-ly-canteen-VWA
```

Nếu đã tải ZIP, giải nén và mở đúng thư mục ứng dụng. **Terminal phải đang ở thư mục có `package.json`**.

Kiểm tra nhanh:

```bash
dir
```

Bạn cần thấy `package.json`, `src/`, `server-json.js` và `vite.config.js` trong thư mục dự án.

### Bước 2 — Cài thư viện

```bash
npm install
```

Nếu quá trình cài đặt báo lỗi, hãy đọc thông báo lỗi đầu tiên và kiểm tra phiên bản Node.js trước khi thử xóa cache hoặc cài lại thư viện.

### Bước 3 — Tạo file `.env`

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux/Git Bash:**

```bash
cp .env.example .env
```

Mở `.env` và chỉnh các biến cần thiết. Tối thiểu hãy thay `JWT_SECRET` bằng giá trị ngẫu nhiên mạnh.

Tạo giá trị ngẫu nhiên bằng Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Sao chép kết quả vào `JWT_SECRET` trong file `.env`. Không dùng secret minh họa trong production.

### Bước 4 — Cấu hình cơ sở dữ liệu

Nếu dùng MongoDB, điền connection string vào `MONGO_URI` trong `.env`.

Ví dụ định dạng (thay bằng thông tin của cơ sở dữ liệu của bạn):

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>/<database>
```

Không đưa connection string thật vào README, ảnh chụp màn hình công khai hoặc repository.

Nếu để `MONGO_URI` trống, hãy kiểm tra logic fallback của backend và cấu hình dữ liệu local trước khi sử dụng. Không giả định dữ liệu local sẽ tự động đồng bộ lên production.

### Bước 5 — Khởi chạy ứng dụng

Chạy cả frontend và backend:

```bash
npm start
```

Theo cấu hình mặc định của dự án:

| Thành phần | Địa chỉ |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3000 |

Giữ Terminal đang chạy để ứng dụng tiếp tục hoạt động. Mở frontend bằng trình duyệt tại `http://localhost:5173`.

### Chạy frontend và backend riêng

Mở **Terminal 1** để chạy backend:

```bash
npm run server
```

Mở **Terminal 2** để chạy frontend:

```bash
npm run dev
```

Cách chạy riêng hữu ích khi cần theo dõi log backend và lỗi frontend ở hai cửa sổ.

### Dừng ứng dụng

Trong từng Terminal đang chạy, nhấn:

```text
Ctrl + C
```

---

## ⚙️ Cấu hình biến môi trường

Các biến được mô tả trong `.env.example` của dự án:

| Biến | Mục đích | Lưu ý |
|---|---|---|
| `NODE_ENV` | Xác định môi trường chạy | Ví dụ `development` hoặc `production` |
| `PORT` | Cổng backend | Local mặc định `3000` |
| `JWT_SECRET` | Ký và xác minh JWT | Bắt buộc đặt secret mạnh |
| `MONGO_URI` | Kết nối MongoDB | Để trống chỉ khi chủ động dùng cơ chế lưu local |
| `VITE_API_URL` | URL gốc của API | Để trống nếu dùng proxy/định tuyến mặc định |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth phía frontend | Client ID không phải client secret |
| `GOOGLE_CLIENT_ID` | Google OAuth phía backend | Phải khớp cấu hình OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth phía backend | Không đưa lên frontend |
| `VITE_FACEBOOK_APP_ID` | Facebook OAuth phía frontend | App ID có thể công khai |
| `FACEBOOK_APP_ID` | Facebook OAuth phía backend | Kiểm tra cấu hình ứng dụng |
| `FACEBOOK_APP_SECRET` | Facebook OAuth phía backend | Giữ bí mật |
| `VITE_HOLIDAY_API_URL` | Endpoint dịch vụ ngày lễ | Chỉ cấu hình khi chức năng được dùng |
| `VITE_GRAVITEE_API_KEY` | Cấu hình API Gateway | Biến `VITE_` có thể xuất hiện trong bundle frontend |
| `VITE_GRAVITEE_SECRET_KEY` | Cấu hình API Gateway | Không nên đặt secret thực sự ở frontend |
| `CORS_ORIGIN` | Cấu hình origin được phép | Tùy logic backend |
| `MAX_UPLOAD_SIZE` | Giới hạn kích thước upload | Tùy logic backend |
| `DB_PATH` | Đường dẫn dữ liệu JSON local | Tùy cơ chế lưu trữ |
| `RATE_LIMIT_MAX` | Tham số giới hạn request | Chỉ có tác dụng nếu backend sử dụng |

> **Quan trọng:** Vite có thể nhúng biến có tiền tố `VITE_` vào mã frontend. Không lưu mật khẩu, private key, client secret hoặc thông tin nhạy cảm trong các biến này. Các biến môi trường chỉ có tác dụng nếu mã ứng dụng đọc và sử dụng chúng.

### Cấu hình OAuth

Nếu bật đăng nhập Google/Facebook:

1. Tạo/cấu hình ứng dụng tại cổng nhà cung cấp tương ứng.
2. Đăng ký đúng callback URL cho local và production.
3. Đặt Client ID/App ID ở biến phù hợp.
4. Đặt Client Secret/App Secret chỉ ở môi trường backend.
5. Kiểm tra domain triển khai, giao thức HTTPS và log callback khi đăng nhập.

Callback URL phải khớp chính xác cấu hình ở nhà cung cấp; không tự thay domain ví dụ nếu chưa cập nhật đồng bộ.

---

## 📜 Các lệnh npm

Các lệnh dưới đây được khai báo trong `package.json`.

### Phát triển và build

| Lệnh | Mục đích |
|---|---|
| `npm start` | Khởi chạy backend và frontend đồng thời |
| `npm run dev` | Chạy Vite frontend |
| `npm run server` | Chạy backend Express |
| `npm run build` | Build frontend cho production |
| `npm run preview` | Xem thử bản build đã tạo |
| `npm run ports` | Kiểm tra cổng theo script của dự án |

### Đa ngôn ngữ

| Lệnh | Mục đích |
|---|---|
| `npm run translate` | Chạy script dịch locale |
| `npm run translate:watch` | Chạy script dịch ở chế độ theo dõi |
| `npm run translate:force` | Ép chạy lại quá trình dịch |
| `npm run translate:dry` | Chạy thử theo chế độ dry-run |
| `npm run translate:until-done` | Chạy nhiều vòng dịch theo cấu hình |
| `npm run check:i18n` | Kiểm tra khóa trùng và độ bao phủ locale |

### Dữ liệu và bảo trì

| Lệnh | Mục đích |
|---|---|
| `npm run db:migrate-images` | Chạy script di trú ảnh món ăn |
| `npm run split-db` | Chạy tiện ích tách dữ liệu |
| `npm run merge-db` | Chạy tiện ích gộp dữ liệu |
| `npm run cleanup-db` | Chạy script dọn dữ liệu theo logic được triển khai |
| `npm run translate:db` | Chạy script bổ sung bản dịch dữ liệu từ MongoDB |
| `npm run translate:db:dry` | Chạy thử bổ sung bản dịch dữ liệu |
| `npm run translate:db:force` | Ép bổ sung bản dịch dữ liệu |
| `npm run translate:db:en` | Chạy bổ sung bản dịch tiếng Anh |
| `npm run translate:db:ja` | Chạy bổ sung bản dịch tiếng Nhật |
| `npm run translate:db:ko` | Chạy bổ sung bản dịch tiếng Hàn |
| `npm run translate:db:zh` | Chạy bổ sung bản dịch tiếng Trung |

**Cảnh báo:** các lệnh `cleanup`, `migrate`, `split`, `merge` và lệnh cập nhật dữ liệu có thể thay đổi dữ liệu. Hãy đọc script, kiểm tra tham số và sao lưu trước khi chạy trên dữ liệu quan trọng.

---

## 🗃️ Dữ liệu và ảnh món ăn

### Vì sao cần tách ảnh khỏi dữ liệu chính?

Ảnh được lưu trực tiếp dưới dạng Base64 trong document nghiệp vụ có thể làm document lớn lên đáng kể. Điều đó có thể làm tăng thời gian đọc/ghi dữ liệu và thời gian khởi động backend.

Dự án có `menuImageStore.js` để xử lý việc lưu trữ, lấy ảnh và di trú ảnh món ăn. Hãy kiểm tra logic trong tệp này trước khi thay đổi cấu trúc dữ liệu.

### Quy trình an toàn khi di trú ảnh

1. Sao lưu cơ sở dữ liệu.
2. Kiểm tra cấu hình kết nối MongoDB.
3. Chạy script di trú trong môi trường phù hợp:

   ```bash
   npm run db:migrate-images
   ```

4. Theo dõi log cho đến khi script hoàn tất.
5. Mở trang thực đơn và xác minh ảnh vẫn tải đúng.
6. Chỉ dọn bản sao lưu khi đã xác nhận dữ liệu đầy đủ và có phương án khôi phục.

### Nén ảnh món ăn

Repository có công cụ tại `public/shrink-menu-images.html`. Khi cần sử dụng:

1. Khởi chạy ứng dụng.
2. Mở `http://localhost:5173/shrink-menu-images.html`.
3. Đăng nhập bằng tài khoản có quyền phù hợp nếu công cụ yêu cầu.
4. Đọc thông báo trên giao diện và xác minh dữ liệu trước khi xác nhận thao tác nén.
5. Kiểm tra lại ảnh sau khi hoàn tất.

Không chạy công cụ chỉnh sửa hàng loạt trên production nếu chưa sao lưu dữ liệu và hiểu rõ ảnh hưởng.

---

## 🧪 Kiểm thử và nghiệm thu

Tài liệu chi tiết nằm trong thư mục `docs/`:

- `docs/user-flows.md` — luồng thao tác của người dùng.
- `docs/acceptance-criteria.md` — tiêu chí nghiệm thu.
- `docs/test-cases.md` — các trường hợp kiểm thử.
- `docs/README.md` — hướng dẫn sử dụng tài liệu.

### Checklist kiểm thử cơ bản

#### Khách hàng

- [ ] Đăng ký, đăng nhập và đăng xuất.
- [ ] Xem thực đơn, tìm kiếm và lọc danh mục.
- [ ] Xem chi tiết món, chọn topping/size nếu có.
- [ ] Thêm món vào giỏ và cập nhật số lượng.
- [ ] Kiểm tra voucher và tổng tiền trước khi đặt hàng.
- [ ] Đặt hàng và kiểm tra trạng thái đơn.
- [ ] Hủy đơn theo điều kiện nghiệp vụ, nếu chức năng được phép.
- [ ] Kiểm tra điểm thưởng, đánh giá và lịch sử mua hàng.
- [ ] Kiểm tra các chức năng ví nếu đã cấu hình.
- [ ] Kiểm tra chatbot và kênh chat hỗ trợ.

#### Nhân viên

- [ ] Đăng nhập bằng tài khoản nhân viên.
- [ ] Check-in và check-out ca làm việc.
- [ ] Tiếp nhận và cập nhật trạng thái đơn.
- [ ] Bật/tắt món theo quyền được cấp.
- [ ] Kiểm tra trao đổi với khách hàng.
- [ ] Xác minh không thể truy cập chức năng chỉ dành cho admin.

#### Quản trị viên

- [ ] Xem dashboard và báo cáo.
- [ ] Thêm, sửa và xóa món theo quy trình.
- [ ] Kiểm tra thay đổi giá và lịch sử giá.
- [ ] Quản lý tài khoản, vai trò và quyền.
- [ ] Kiểm tra ca làm, chấm công và tồn kho.
- [ ] Kiểm tra voucher và các yêu cầu liên quan đến ví.
- [ ] Kiểm tra xuất dữ liệu và sao lưu/khôi phục nếu có.

#### Giao diện, dữ liệu và bảo mật

- [ ] Kiểm tra trên màn hình máy tính và điện thoại.
- [ ] Kiểm tra trạng thái tải, thông báo lỗi và dữ liệu rỗng.
- [ ] Thử request khi phiên đăng nhập hết hạn.
- [ ] Kiểm tra dữ liệu đầu vào không hợp lệ.
- [ ] Kiểm tra số lượng đặt hàng phải là số nguyên dương.
- [ ] Kiểm tra món ngừng bán không thể được đặt.
- [ ] Kiểm tra lỗi thanh toán không gây cập nhật sai kho/đơn.
- [ ] Xác minh secret không xuất hiện trong mã frontend hoặc repository.

### Kiểm tra build

Trước khi triển khai, chạy:

```bash
npm run build
```

Nếu build thất bại, xử lý lỗi trước khi deploy. Build thành công không thay thế cho kiểm thử nghiệp vụ hoặc kiểm thử bảo mật.

---

## 🌐 Triển khai production

### 1. Chuẩn bị repository

- Kiểm tra mã nguồn và các thay đổi chưa commit.
- Loại bỏ `.env`, dữ liệu nhạy cảm, file dump và thông tin xác thực.
- Đảm bảo `.env.example` chỉ chứa giá trị mẫu.
- Kiểm tra `package.json`, `package-lock.json` và `vercel.json`.
- Chạy `npm install` và `npm run build` tại máy trước.

### 2. Triển khai trên Vercel

Dự án có sẵn `vercel.json` với cấu hình Vite, thư mục build `dist`, function `api/index.js` và các rewrite API.

1. Đẩy repository lên GitHub.
2. Đăng nhập Vercel và chọn **Add New Project**.
3. Import repository cần triển khai.
4. Kiểm tra Root Directory là thư mục chứa `package.json` và `vercel.json`.
5. Kiểm tra Build Command là `npm run build`.
6. Kiểm tra Output Directory là `dist`.
7. Thêm biến môi trường cần thiết trong phần Settings của Vercel.
8. Deploy và kiểm tra log build/function.
9. Mở website HTTPS và kiểm thử cả frontend lẫn API.

Nếu dự án nằm trong thư mục con của repository, hãy đặt Root Directory đúng thư mục ứng dụng thay vì thư mục ngoài cùng.

### 3. Cấu hình MongoDB Atlas

1. Tạo cluster và database user.
2. Cấp quyền tối thiểu cần thiết cho database user.
3. Cấu hình Network Access theo chính sách phù hợp với nền tảng chạy backend.
4. Đưa connection string vào `MONGO_URI` ở môi trường server.
5. Kiểm tra log kết nối và dữ liệu sau khi deploy.

Không công khai connection string. Tránh mở truy cập từ mọi IP nếu không cần thiết; nếu nền tảng yêu cầu phạm vi mạng rộng, hãy đánh giá rủi ro và giới hạn quyền database user.

### 4. Sau khi deploy

- [ ] Trang chủ tải được qua HTTPS.
- [ ] Đăng nhập/đăng xuất hoạt động.
- [ ] API không trả lỗi do thiếu biến môi trường.
- [ ] Cơ sở dữ liệu được kết nối đúng.
- [ ] Các vai trò bị giới hạn đúng quyền.
- [ ] Ảnh món ăn tải được.
- [ ] Luồng đặt món và cập nhật trạng thái đơn hoạt động.
- [ ] Callback OAuth khớp domain production nếu dùng.
- [ ] Không có secret trong mã nguồn công khai hoặc log trình duyệt.

> Có cấu hình Vercel không đồng nghĩa với việc mọi chức năng production đã được xác minh. Cần triển khai thử và kiểm tra theo môi trường thật.

---

## 🛠️ Xử lý lỗi thường gặp

| Lỗi/hiện tượng | Nguyên nhân có thể | Cách xử lý |
|---|---|---|
| `ENOENT` hoặc không tìm thấy `package.json` | Terminal đang ở sai thư mục | `cd` đến thư mục chứa `package.json` rồi chạy lại |
| `node` hoặc `npm` không được nhận diện | Node.js chưa cài hoặc PATH chưa cập nhật | Cài Node.js 22+, mở Terminal mới và kiểm tra phiên bản |
| `Cannot find module ...` | Dependencies chưa được cài hoặc cài đặt lỗi | Chạy `npm install` ở thư mục gốc |
| `EADDRINUSE` | Cổng 3000/5173 đã có tiến trình sử dụng | Dùng `npm run ports` để kiểm tra; dừng tiến trình đúng cách rồi thử lại |
| `JWT_SECRET` thiếu hoặc không hợp lệ | `.env` hoặc biến production chưa được cấu hình | Kiểm tra đúng tên biến và khởi động lại backend |
| MongoDB connection timeout | URI sai, thông tin xác thực sai hoặc mạng bị chặn | Kiểm tra `MONGO_URI`, database user và Network Access |
| Frontend không gọi được API | Proxy, URL API hoặc rewrite chưa đúng | Kiểm tra `VITE_API_URL`, `vite.config.js`, `vercel.json` và log backend |
| OAuth callback lỗi | Redirect URI không khớp | Đồng bộ callback URL trong nhà cung cấp và biến môi trường |
| Ảnh món ăn không hiển thị | Đường dẫn ảnh hoặc endpoint phục vụ ảnh lỗi | Kiểm tra request ảnh trong DevTools và log server |
| Dữ liệu không còn sau khi deploy lại | Đang dùng lưu trữ local/tạm thời hoặc cấu hình DB sai | Kiểm tra `MONGO_URI` và xác minh dữ liệu đang được lưu ở đâu |
| Build lỗi | Thiếu dependency hoặc lỗi mã nguồn | Đọc lỗi đầu tiên trong terminal, sửa rồi chạy lại `npm run build` |

**Mẹo khi báo lỗi:** gửi nguyên văn thông báo lỗi, lệnh đã chạy, phiên bản Node.js và tên thư mục hiện tại. Không gửi mật khẩu, JWT, connection string hoặc token.

---

## 🔐 Bảo mật

### Trước khi công khai dự án

1. Thay `JWT_SECRET` bằng giá trị ngẫu nhiên mạnh.
2. Không commit `.env`, `.env.local`, file backup hoặc dữ liệu người dùng.
3. Đổi hoặc vô hiệu hóa mật khẩu/tài khoản demo trước khi mở website công khai.
4. Không lưu client secret trong biến `VITE_*`.
5. Giới hạn quyền của tài khoản MongoDB.
6. Xác minh phân quyền ở backend cho mọi thao tác quản trị.
7. Kiểm tra CORS, xác thực đầu vào, giới hạn tần suất đăng nhập và xử lý lỗi.
8. Sao lưu dữ liệu trước khi chạy script di trú, dọn dẹp hoặc cập nhật hàng loạt.
9. Nếu secret từng được commit, hãy thu hồi/thay secret; xóa file khỏi commit mới thôi chưa đủ để vô hiệu hóa secret cũ.

### Các điểm cần tiếp tục rà soát

Tài liệu dự án trước đó ghi nhận một số hạng mục cần đánh giá thêm, gồm giới hạn tần suất endpoint đăng nhập, bảo vệ token trước nguy cơ XSS và biện pháp CSRF phù hợp với mô hình xác thực. Hãy kiểm tra mã hiện tại trước khi kết luận trạng thái của từng biện pháp.

---

## 📖 Tài liệu dự án

| Tài liệu | Nội dung |
|---|---|
| [`docs/README.md`](docs/README.md) | Hướng dẫn đọc tài liệu dự án |
| [`docs/user-flows.md`](docs/user-flows.md) | Các luồng thao tác của người dùng |
| [`docs/acceptance-criteria.md`](docs/acceptance-criteria.md) | Tiêu chí nghiệm thu |
| [`docs/test-cases.md`](docs/test-cases.md) | Danh sách test case |
| [`src/api-tests.http`](src/api-tests.http) | Các request API phục vụ kiểm tra thủ công |
| [`package.json`](package.json) | Scripts và dependencies |
| [`vercel.json`](vercel.json) | Cấu hình triển khai Vercel |
| [`.env.example`](.env.example) | Mẫu biến môi trường |

---

## 🧭 Hướng phát triển

Các hạng mục dưới đây là gợi ý để nhóm cân nhắc, không phải cam kết rằng chúng chưa tồn tại trong mã nguồn:

- Hoàn thiện kiểm thử tự động cho luồng đặt món, thanh toán, hoàn kho và điểm thưởng.
- Bổ sung giới hạn tần suất cho đăng nhập và các endpoint nhạy cảm.
- Rà soát bảo vệ token, XSS/CSRF và chính sách phiên đăng nhập.
- Bổ sung giám sát lỗi, log có cấu trúc và cảnh báo khi API gặp sự cố.
- Chuẩn hóa quy trình backup/restore và kiểm thử phục hồi dữ liệu.
- Tự động hóa build, lint/test và kiểm tra bảo mật trong CI.
- Duy trì đồng bộ tài liệu user flow, acceptance criteria và test case sau mỗi thay đổi nghiệp vụ.

---

## 🤝 Đóng góp

Nếu bạn muốn cải thiện dự án, hãy tạo một nhánh riêng, thực hiện thay đổi và mở Pull Request để nhóm xem xét.

1. Fork repository hoặc tạo branch từ repository được cấp quyền.
2. Đặt tên branch rõ nghĩa, ví dụ `feature/menu-search` hoặc `fix/login-validation`.
3. Chạy thử ứng dụng và kiểm tra các chức năng liên quan.
4. Ghi rõ nội dung thay đổi, cách kiểm thử và ảnh chụp màn hình nếu có.
5. Mở Pull Request, mô tả vấn đề đã giải quyết và liên kết issue liên quan nếu có.

**Gợi ý quy ước commit:**
- `feat:` thêm tính năng
- `fix:` sửa lỗi
- `docs:` cập nhật tài liệu
- `refactor:` cải thiện cấu trúc code
- `test:` bổ sung hoặc sửa kiểm thử

---

## 📄 Giấy phép và ghi nhận

Dự án sử dụng các thư viện mã nguồn mở như React, Vite, React Router, Express, MongoDB/Mongoose, Recharts và Lucide React. Mỗi thư viện có giấy phép riêng.

Nếu repository phát hành theo **MIT License**, hãy đảm bảo có tệp `LICENSE` hợp lệ trong repository và xác nhận quyền phân phối đối với các thành phần được sử dụng.

---

<div align="center">

**Canteen VWA**  
*Đơn giản hóa quy trình đặt món và quản lý canteen.*

Tài liệu được cập nhật theo cấu trúc và cấu hình dự án tại thời điểm biên soạn.

</div>


<div align="center">

**Canteen VWA** · Xây dựng với ❤️ cho trải nghiệm canteen thuận tiện hơn.

</div>
