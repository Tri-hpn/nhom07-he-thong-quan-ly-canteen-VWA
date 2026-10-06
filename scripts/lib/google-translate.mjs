// ============================================================
// GOOGLE-TRANSLATE.MJS — Wrapper Google Translate free (unofficial)
// ============================================================
// Endpoint: translate.googleapis.com/translate_a/single?client=gtx
// - Free, không cần API key
// - Rate limit ~100 req/phút
// - Có retry exponential backoff
// - Có timeout 10s/request
// ============================================================

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

export async function translateText(text, targetLang, sourceLang = "vi") {
  if (!text || targetLang === sourceLang) return text;

  const url =
    `${ENDPOINT}?client=gtx` +
    `&sl=${encodeURIComponent(sourceLang)}` +
    `&tl=${encodeURIComponent(targetLang)}` +
    `&dt=t` +
    `&q=${encodeURIComponent(text)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const translated =
      data?.[0]
        ?.map((seg) => seg?.[0])
        .filter(Boolean)
        .join("") || text;

    return translated;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function translateWithRetry(
  text,
  targetLang,
  sourceLang = "vi",
  maxRetries = 5
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await translateText(text, targetLang, sourceLang);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}