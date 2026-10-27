// services/cloudinaryUpload.js
// ============================================================
// MODULE 5 — Upload ảnh lên Cloudinary
// V5 (2026-11):
//   ✅ Timeout 20s cho mỗi upload/delete
//   ✅ Fallback invalidate=false khi gặp lỗi permission
//   ✅ Sanitize publicId chống path traversal
// ============================================================

import { v2 as cloudinary } from "cloudinary";

const UPLOAD_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — chặn ảnh quá lớn

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({ secure: true });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  configured = true;
}

export function isCloudinaryEnabled() {
  return !!(
    process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET)
  );
}

// Timeout wrapper — Cloudinary SDK không có timeout built-in
function withTimeout(promise, ms, label = "cloudinary") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Sanitize publicId: chỉ cho phép chữ, số, gạch ngang, gạch dưới
function sanitizePublicId(id) {
  return String(id)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 200);
}

/**
 * Upload base64 image lên Cloudinary.
 * @param {string} dataUrl  — "data:image/png;base64,..."
 * @param {object} opts
 * @param {string} [opts.folder="canteen-vwa/menu"]
 * @param {string|number} [opts.publicId]
 * @returns {Promise<{url:string, publicId:string, width:number, height:number, bytes:number, format:string}>}
 */
export async function uploadBase64Image(dataUrl, opts = {}) {
  if (!isCloudinaryEnabled()) {
    throw new Error(
      "Cloudinary chưa cấu hình. Set CLOUDINARY_URL hoặc CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET"
    );
  }
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Chỉ hỗ trợ data URL (data:image/...)");
  }

  // Ước lượng decoded size (base64 = 4/3 raw size)
  const base64Len = dataUrl.length - dataUrl.indexOf(",") - 1;
  const approxBytes = Math.floor((base64Len * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw new Error(
      `Ảnh quá lớn (${(approxBytes / 1048576).toFixed(1)}MB > ${MAX_IMAGE_BYTES / 1048576}MB)`
    );
  }

  ensureConfigured();

  const folder = opts.folder || "canteen-vwa/menu";
  const publicId = opts.publicId
    ? `${folder}/${sanitizePublicId(opts.publicId)}`
    : undefined;

  const uploadOpts = {
    folder: publicId ? undefined : folder,
    public_id: publicId,
    transformation: [
      { width: 800, height: 800, crop: "limit" },
      { quality: "auto:good", fetch_format: "auto" },
    ],
    overwrite: !!publicId,
    invalidate: true,
    resource_type: "image",
  };

  let result;
  try {
    result = await withTimeout(
      cloudinary.uploader.upload(dataUrl, uploadOpts),
      UPLOAD_TIMEOUT_MS,
      "cloudinary.upload"
    );
  } catch (e) {
    // Nếu lỗi liên quan invalidate (permission) → retry không invalidate
    if (/invalidate|permission|purge/i.test(e.message || "")) {
      console.warn("[cloudinary] retry without invalidate:", e.message);
      result = await withTimeout(
        cloudinary.uploader.upload(dataUrl, { ...uploadOpts, invalidate: false }),
        UPLOAD_TIMEOUT_MS,
        "cloudinary.upload.retry"
      );
    } else {
      throw e;
    }
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  };
}

/**
 * Xoá ảnh trên Cloudinary theo URL hoặc publicId.
 */
export async function deleteCloudinaryImage(urlOrPublicId) {
  if (!urlOrPublicId) return false;
  if (!isCloudinaryEnabled()) return false;
  ensureConfigured();

  let publicId = String(urlOrPublicId);

  if (/^https?:\/\//.test(publicId)) {
    const match = publicId.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]+)?$/i);
    if (!match) return false;
    publicId = match[1];
  }

  try {
    const r = await withTimeout(
      cloudinary.uploader.destroy(publicId, { invalidate: true }),
      UPLOAD_TIMEOUT_MS,
      "cloudinary.destroy"
    );
    return r.result === "ok" || r.result === "not found";
  } catch (e) {
    // Retry không invalidate nếu lỗi purge permission
    if (/invalidate|permission|purge/i.test(e.message || "")) {
      try {
        const r = await withTimeout(
          cloudinary.uploader.destroy(publicId, { invalidate: false }),
          UPLOAD_TIMEOUT_MS,
          "cloudinary.destroy.retry"
        );
        return r.result === "ok" || r.result === "not found";
      } catch (e2) {
        console.warn("[cloudinary] delete fail after retry:", e2.message);
        return false;
      }
    }
    console.warn("[cloudinary] delete fail:", e.message);
    return false;
  }
}

export function isCloudinaryUrl(url) {
  return typeof url === "string" && /^https?:\/\/res\.cloudinary\.com\//i.test(url);
}