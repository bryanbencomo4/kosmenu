import {
  COMPROBANTE_ALLOWED_MIME,
  COMPROBANTE_MAX_BYTES,
  resolveComprobanteMime,
  sanitizeComprobanteFileName,
  sniffComprobanteMime,
} from '../api/_lib/comprobante-upload';

const LOAD_ERROR = 'Ese comprobante no se pudo cargar. Prueba otra foto en JPEG o PNG.';
const SIZE_ERROR = 'El comprobante supera el tamano maximo (5 MB).';
const EMPTY_ERROR = 'El comprobante esta vacio.';

function baseName(fileName: string): string {
  const safe = sanitizeComprobanteFileName(fileName) || 'comprobante';
  const dot = safe.lastIndexOf('.');
  return dot > 0 ? safe.slice(0, dot) : safe;
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/jpeg', quality);
  });
  if (!blob || blob.size <= 0) {
    throw new Error(LOAD_ERROR);
  }
  return blob;
}

async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall through to <img> (some camera formats decode only that way).
    }
  }

  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(LOAD_ERROR));
    };
    image.src = url;
  });
}

async function encodeJpegFromImage(
  source: ImageBitmap | HTMLImageElement,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width;
  const sourceHeight =
    'naturalHeight' in source ? source.naturalHeight || source.height : source.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error(LOAD_ERROR);
  }

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(LOAD_ERROR);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvasToJpegBlob(canvas, quality);
}

/**
 * Normalize gallery/camera picks so checkout upload accepts them:
 * - empty MIME / HEIC / oversized camera shots → re-encode as JPEG under 5 MB
 * - PDF passes through when already valid
 */
export async function prepareComprobanteFile(file: File): Promise<File> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error(EMPTY_ERROR);
  }

  const bytes = await file.arrayBuffer();
  const mime = resolveComprobanteMime({ declaredMime: file.type, bytes });

  if (mime === 'application/pdf') {
    if (file.size > COMPROBANTE_MAX_BYTES) {
      throw new Error(SIZE_ERROR);
    }
    const name = `${baseName(file.name)}.pdf`;
    return new File([bytes], name, { type: 'application/pdf', lastModified: file.lastModified });
  }

  const sniffed = sniffComprobanteMime(bytes);
  const alreadyOk =
    COMPROBANTE_ALLOWED_MIME.has(mime) &&
    mime.startsWith('image/') &&
    file.size <= COMPROBANTE_MAX_BYTES;

  // Prefer a re-encode for camera/HEIC/unknown types so Storage always gets a clean JPEG.
  const needsReencode =
    !alreadyOk ||
    sniffed === 'image/heic' ||
    !(file.type || '').trim() ||
    (file.type || '').toLowerCase() === 'application/octet-stream';

  if (!needsReencode) {
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    return new File([bytes], `${baseName(file.name)}.${ext}`, {
      type: mime,
      lastModified: file.lastModified,
    });
  }

  const blobForDecode = new Blob([bytes], {
    type: mime.startsWith('image/') ? mime : 'application/octet-stream',
  });

  let decoded: ImageBitmap | HTMLImageElement;
  try {
    decoded = await decodeImage(blobForDecode);
  } catch {
    if (alreadyOk) {
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      return new File([bytes], `${baseName(file.name)}.${ext}`, {
        type: mime,
        lastModified: file.lastModified,
      });
    }
    throw new Error(LOAD_ERROR);
  }

  try {
    let maxEdge = 1920;
    let quality = 0.84;
    let out = await encodeJpegFromImage(decoded, maxEdge, quality);

    while (out.size > COMPROBANTE_MAX_BYTES && quality > 0.5) {
      quality -= 0.12;
      out = await encodeJpegFromImage(decoded, maxEdge, quality);
    }
    while (out.size > COMPROBANTE_MAX_BYTES && maxEdge > 960) {
      maxEdge = Math.round(maxEdge * 0.75);
      out = await encodeJpegFromImage(decoded, maxEdge, Math.max(0.55, quality));
    }

    if (out.size > COMPROBANTE_MAX_BYTES) {
      throw new Error(SIZE_ERROR);
    }

    return new File([out], `${baseName(file.name)}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    if (typeof ImageBitmap !== 'undefined' && decoded instanceof ImageBitmap) {
      decoded.close();
    }
  }
}
