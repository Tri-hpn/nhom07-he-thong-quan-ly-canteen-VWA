// ============================================================
// NÉN ẢNH MÓN ĂN — script cho shrink-menu-images.html
// ------------------------------------------------------------
// Dùng canvas của trình duyệt để resize + nén JPEG (server không có
// thư viện xử lý ảnh nên đây là cách duy nhất không cần thêm dependency).
// ============================================================

const API = "/api"; // Vite dev proxy /api → backend :3000
const MAX_DIM = 900; // cạnh dài tối đa của ảnh sau khi nén
const QUALITY = 0.82; // chất lượng JPEG

let token = "";
let stopRequested = false;

const el = (id) => document.getElementById(id);
const bar = el("bar").firstElementChild;
const fmtKB = (bytes) => Math.round(bytes / 1024) + " KB";

function logLine(text, cls = "info") {
  const li = document.createElement("li");
  li.className = cls;
  li.textContent = text;
  el("log").appendChild(li);
  li.scrollIntoView({ block: "nearest" });
}

function setStatus(text) {
  el("status").textContent = text;
}

function setProgress(done, total) {
  bar.style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(API + path, { ...options, headers });
  const text = await res.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: String(text).slice(0, 200) };
  }

  if (!res.ok) {
    const err = new Error(data.message || "HTTP " + res.status);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Tải ảnh và nén lại thành JPEG.
 * @returns {Promise<{dataUrl:string,beforeBytes:number,afterBytes:number,w:number,h:number}>}
 */
async function shrinkToJpeg(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("tải ảnh lỗi HTTP " + res.status);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("không đọc được định dạng ảnh"));
      i.src = objectUrl;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("ảnh không có kích thước hợp lệ");

    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("trình duyệt không hỗ trợ canvas");

    // JPEG không có kênh trong suốt → tô nền trắng tránh bị đen
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    if (!dataUrl.startsWith("data:image/jpeg")) throw new Error("không nén được ảnh");

    return {
      dataUrl,
      beforeBytes: blob.size,
      afterBytes: Math.round(dataUrl.length * 0.75), // base64 → bytes thật
      w: canvas.width,
      h: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function run() {
  const email = el("email").value.trim();
  const password = el("password").value;

  if (!email || !password) {
    setStatus("⚠️ Nhập email và mật khẩu quản trị.");
    return;
  }

  el("startBtn").disabled = true;
  el("stopBtn").disabled = false;
  stopRequested = false;
  el("log").innerHTML = "";
  setProgress(0, 1);

  try {
    setStatus("Đang đăng nhập...");
    const login = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    token = login.token;
    logLine("✅ Đăng nhập: " + login.user.name + " (" + login.user.role + ")", "ok");

    setStatus("Đang tải danh sách món ăn...");
    const menu = await api("/menu");
    const targets = menu.filter(
      (it) => typeof it.image === "string" && it.image.indexOf("/api/uploads/menu/") !== -1
    );

    if (!targets.length) {
      logLine("✨ Không có ảnh nào cần nén (ảnh đã nhỏ hoặc là URL ngoài).", "info");
      setStatus("Hoàn tất — không cần nén.");
      setProgress(1, 1);
      return;
    }

    logLine("🔎 Có " + targets.length + " ảnh cần xử lý.", "info");

    let shrunk = 0;
    let skipped = 0;
    let failed = 0;
    let savedBytes = 0;

    for (let i = 0; i < targets.length; i++) {
      if (stopRequested) {
        logLine("⏹️ Đã dừng theo yêu cầu.", "info");
        break;
      }

      const item = targets[i];
      const label = "#" + item.id + " " + item.name;
      setStatus("Đang nén " + (i + 1) + "/" + targets.length + ": " + label + "...");

      try {
        const r = await shrinkToJpeg(item.image);

        if (r.afterBytes >= r.beforeBytes) {
          skipped++;
          logLine("↷ Bỏ qua " + label + " — ảnh đã tối ưu (" + fmtKB(r.beforeBytes) + ")", "skip");
        } else {
          await api("/menu/" + item.id, {
            method: "PUT",
            body: JSON.stringify({ ...item, image: r.dataUrl, reason: "" }),
          });
          shrunk++;
          savedBytes += r.beforeBytes - r.afterBytes;
          logLine(
            "✅ " + label + ": " + fmtKB(r.beforeBytes) + " → " + fmtKB(r.afterBytes) +
              " (" + r.w + "×" + r.h + ")",
            "ok"
          );
        }
      } catch (e) {
        failed++;
        logLine("❌ " + label + ": " + e.message, "err");
        if (e.status === 401) {
          logLine("⛔ Phiên đăng nhập hết hạn — bấm “Bắt đầu nén” lại.", "err");
          break;
        }
      }

      setProgress(i + 1, targets.length);
    }

    const summary =
      "Xong: " + shrunk + " ảnh đã nén (tiết kiệm ~" +
      (savedBytes / 1048576).toFixed(1) + " MB), " + skipped + " bỏ qua, " + failed + " lỗi.";
    setStatus("✅ " + summary);
    logLine("— " + summary, "info");
  } catch (e) {
    setStatus("❌ " + e.message);
    logLine("❌ " + e.message, "err");
  } finally {
    el("startBtn").disabled = false;
    el("stopBtn").disabled = true;
  }
}

el("startBtn").addEventListener("click", run);
el("stopBtn").addEventListener("click", () => {
  stopRequested = true;
  setStatus("Đang dừng sau ảnh hiện tại...");
});
