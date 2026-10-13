/**
 * Instagram-style letterbox fill: sample edge pixels on a tiny canvas,
 * quantize, and pick the dominant color. Also scores how "studio-like"
 * the side edges are (uniform color → keep letterbox; busy food → widen).
 */

type FillAnalysis = {
  color: string;
  /** 0–1: how uniform the left/right edges are (high = product on flat bg). */
  sideUniformity: number;
};

const analysisCache = new Map<string, FillAnalysis>();
const inflight = new Map<string, Promise<FillAnalysis | null>>();

const MAX_SAMPLE = 48;
const QUANTIZE = 24;
const DEFAULT_FILL = 'rgb(245, 245, 245)';

function quantizeChannel(value: number) {
  return Math.round(value / QUANTIZE) * QUANTIZE;
}

function rgbKey(r: number, g: number, b: number) {
  return `${quantizeChannel(r)},${quantizeChannel(g)},${quantizeChannel(b)}`;
}

function toCss(key: string) {
  const [r, g, b] = key.split(',').map((part) => Number(part));
  if (![r, g, b].every((n) => Number.isFinite(n))) return DEFAULT_FILL;
  return `rgb(${r}, ${g}, ${b})`;
}

function sampleFillAnalysis(image: CanvasImageSource, width: number, height: number): FillAnalysis | null {
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_SAMPLE / Math.max(width, height));
  const canvasW = Math.max(1, Math.floor(width * scale));
  const canvasH = Math.max(1, Math.floor(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(image, 0, 0, canvasW, canvasH);
    const { data } = ctx.getImageData(0, 0, canvasW, canvasH);
    const counts = new Map<string, number>();

    const bump = (x: number, y: number, weight = 1) => {
      const i = (y * canvasW + x) * 4;
      const a = data[i + 3] ?? 0;
      if (a < 128) return;
      const key = rgbKey(data[i]!, data[i + 1]!, data[i + 2]!);
      counts.set(key, (counts.get(key) ?? 0) + weight);
    };

    for (let x = 0; x < canvasW; x += 1) {
      bump(x, 0, 2);
      bump(x, canvasH - 1, 2);
    }
    for (let y = 1; y < canvasH - 1; y += 1) {
      bump(0, y, 2);
      bump(canvasW - 1, y, 2);
    }
    const step = Math.max(2, Math.floor(Math.min(canvasW, canvasH) / 8));
    for (let y = step; y < canvasH - step; y += step) {
      for (let x = step; x < canvasW - step; x += step) {
        bump(x, y, 1);
      }
    }

    let bestKey = '';
    let bestCount = 0;
    for (const [key, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestKey = key;
      }
    }
    if (!bestKey) return null;

    // Side-edge uniformity: studio packs (Maltín on orange) score high;
    // tight food crops with busy edges score low.
    let sidePixels = 0;
    let sideMatches = 0;
    const band = Math.max(1, Math.floor(canvasW * 0.12));
    for (let y = 0; y < canvasH; y += 1) {
      for (let x = 0; x < canvasW; x += 1) {
        if (x >= band && x < canvasW - band) continue;
        const i = (y * canvasW + x) * 4;
        const a = data[i + 3] ?? 0;
        if (a < 128) continue;
        sidePixels += 1;
        if (rgbKey(data[i]!, data[i + 1]!, data[i + 2]!) === bestKey) {
          sideMatches += 1;
        }
      }
    }

    const sideUniformity = sidePixels > 0 ? sideMatches / sidePixels : 0;

    return {
      color: toCss(bestKey),
      sideUniformity,
    };
  } catch {
    return null;
  }
}

function loadCorsImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function getCachedImageFillColor(src: string): string | undefined {
  return analysisCache.get(src)?.color;
}

export function getCachedSideUniformity(src: string): number | undefined {
  return analysisCache.get(src)?.sideUniformity;
}

/**
 * Extract fill analysis without tainting the visible <img> (separate CORS probe).
 * Returns null when the CDN blocks pixel reads — UI falls back to blur backdrop.
 */
export async function extractImageFillAnalysis(src: string): Promise<FillAnalysis | null> {
  const cached = analysisCache.get(src);
  if (cached) return cached;

  const pending = inflight.get(src);
  if (pending) return pending;

  const task = (async () => {
    try {
      const image = await loadCorsImage(src);
      if (!image) return null;
      const analysis = sampleFillAnalysis(
        image,
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
      );
      if (analysis) analysisCache.set(src, analysis);
      return analysis;
    } finally {
      inflight.delete(src);
    }
  })();

  inflight.set(src, task);
  return task;
}

/** @deprecated Prefer extractImageFillAnalysis; kept for callers that only need color. */
export async function extractImageFillColor(src: string): Promise<string | null> {
  const analysis = await extractImageFillAnalysis(src);
  return analysis?.color ?? null;
}

export { DEFAULT_FILL as DEFAULT_IMAGE_FILL };
