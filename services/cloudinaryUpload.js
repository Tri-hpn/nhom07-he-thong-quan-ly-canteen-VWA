// services/cloudinaryUpload.js
// ============================================================
// MODULE 5 — Upload ảnh lên Cloudinary (thay thế local storage)
// ============================================================

import { v2 as cloudinary } from "cloudinary";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  // Có thể dùng CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
  // hoặc 3 biến riêng CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET
  if (process.env.CLOUDINARY_URL) {
    // SDK tự parse CLOUDINARY_URL
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

/**
 * Upload base64 image lên Cloudinary.
 * @param {string} dataUrl  — "data:image/png;base64,..."
 * @param {object} opts
 * @param {string} [opts.folder="canteen-vwa/menu"]
 * @param {string|number} [opts.publicId]  — nếu muốn fixed public_id (dùng item id)
 * @returns {Promise<{ url: string, publicId: string, width: number, height: number, bytes: number }>}
 */
export async function uploadBase64Image(dataUrl, opts = {}) {
  if (!isCloudinaryEnabled()) {
    throw new Error(
      "Cloudinary chưa cấu hình. Set CLOUDINARY_URL hoặc bộ 3 CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET"
    );
  }
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Chỉ hỗ trợ data URL (data:image/...)");
  }
  ensureConfigured();

  const folder = opts.folder || "canteen-vwa/menu";
  const publicId = opts.publicId
    ? `${folder}/${String(opts.publicId)}`
    : undefined;

  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: publicId ? undefined : folder,
    public_id: publicId,
    // Auto optimize: resize về max 800px, chất lượng auto:good
    transformation: [
      { width: 800, height: 800, crop: "limit" },
      { quality: "auto:good", fetch_format: "auto" },
    ],
    overwrite: !!publicId, // nếu có publicId → ghi đè ảnh cũ cùng key
    invalidate: true,       // purge CDN cache khi ghi đè
    resource_type: "image",
  });

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
 * Xoá ảnh trên Cloudinary theo publicId hoặc URL.
 * @param {string} urlOrPublicId
 */
export async function deleteCloudinaryImage(urlOrPublicId) {
  if (!urlOrPublicId) return false;
  if (!isCloudinaryEnabled()) return false;
  ensureConfigured();

  let publicId = urlOrPublicId;

  // Nếu là URL đầy đủ → extract public_id
  if (/^https?:\/\//.test(urlOrPublicId)) {
    const match = urlOrPublicId.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]+)?$/i);
    if (match) publicId = match[1];
    else return false;
  }

  try {
    const r = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    return r.result === "ok" || r.result === "not found";
  } catch (e) {
    console.warn("[cloudinary] delete fail:", e.message);
    return false;
  }
}

/**
 * Helper kiểm tra URL có phải Cloudinary không.
 */
export function isCloudinaryUrl(url) {
  return typeof url === "string" && /^https?:\/\/res\.cloudinary\.com\//i.test(url);
}