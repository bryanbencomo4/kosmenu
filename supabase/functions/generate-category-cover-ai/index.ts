/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import {
  AiUsageError,
  COST_IMAGE,
  addCredits,
  deductCredits,
  enforceAiLimits,
  hasEnoughCredits,
  recordGeminiUsage,
} from '../_shared/ai-usage.ts';
import { buildCategoryCoverPrompt } from '../_shared/category-cover-prompt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-comercio-id',
};

const IMAGE_MODEL = 'gemini-2.5-flash-image';
const IMAGE_MODEL_FALLBACKS = [
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-3.1-flash-image-preview',
];
const IMAGE_BUCKET = 'product-images';
const MAX_PRODUCT_REFS = 3;

type InlineImage = {
  mimeType: string;
  base64: string;
  label: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let creditsCharged = false;
  let commerceId = '';

  try {
    const body = await req.json();
    commerceId = normalizeString(body.comercio_id ?? body.commerce_id);
    const categoryId = normalizeString(body.category_id ?? body.categoria_id);
    const customNotes = normalizeString(body.custom_prompt ?? body.notes);

    if (!commerceId) {
      return jsonResponse(
        { error: 'missing_comercio_id', message: 'comercio_id is required' },
        400,
      );
    }
    if (!categoryId) {
      return jsonResponse(
        { error: 'missing_category_id', message: 'category_id is required' },
        400,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error: 'missing_env',
          message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
        },
        500,
      );
    }
    if (!geminiApiKey) {
      return jsonResponse(
        { error: 'missing_gemini', message: 'GEMINI_API_KEY is not configured' },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    await enforceAiLimits(supabase, commerceId);
    await hasEnoughCredits(supabase, commerceId, COST_IMAGE);
    await deductCredits(supabase, commerceId, COST_IMAGE, 'ai_category_cover', {
      function: 'generate-category-cover-ai',
      category_id: categoryId,
    });
    creditsCharged = true;

    const { data: category, error: categoryError } = await supabase
      .from('categorias')
      .select('id, nombre, comercio_id, imagen_url')
      .eq('id', categoryId)
      .eq('comercio_id', commerceId)
      .maybeSingle();
    if (categoryError) {
      throw new Error(`Error loading category: ${categoryError.message}`);
    }
    if (!category?.id) {
      throw new Error('Categoría no encontrada.');
    }

    const { data: commerce, error: commerceError } = await supabase
      .from('comercios')
      .select(
        'id, nombre, categoria, logo_url, color_principal, menu_palette_primary, branding_ia',
      )
      .eq('id', commerceId)
      .maybeSingle();
    if (commerceError) {
      throw new Error(`Error loading commerce: ${commerceError.message}`);
    }
    if (!commerce?.id) {
      throw new Error('Comercio no encontrado.');
    }

    const { data: products } = await supabase
      .from('productos')
      .select('id, nombre, imagen_url, disponible, orden')
      .eq('comercio_id', commerceId)
      .eq('categoria_id', categoryId)
      .eq('disponible', true)
      .order('orden', { ascending: true })
      .limit(24);

    const productRows = (products ?? []) as Array<{
      id: string;
      nombre?: string | null;
      imagen_url?: string | null;
    }>;
    const productNames = productRows
      .map((row) => normalizeString(row.nombre))
      .filter(Boolean);
    const productsWithImages = productRows.filter(
      (row) => normalizeString(row.imagen_url).length > 0,
    );

    const brandColor = resolveBrandColor(commerce);
    const logoUrl = normalizeString(commerce.logo_url);
    // Fetch logo for deterministic post-composite (never trust the model to draw it).
    const logoForOverlay = logoUrl
      ? await fetchAsInlineImage(logoUrl, 'brand_logo_exact')
      : null;

    const inlineImages: InlineImage[] = [];

    // Canonical style lock: branding_ia URL, else oldest AI cover (first good template).
    const styleLockUrl = await findStyleLockCoverUrl(
      supabase,
      commerceId,
      categoryId,
      commerce.branding_ia,
    );
    if (styleLockUrl) {
      const styleLock = await fetchAsInlineImage(styleLockUrl, 'style_lock_cover');
      if (styleLock) inlineImages.push(styleLock);
    }

    const productRefLimit = styleLockUrl ? Math.min(2, MAX_PRODUCT_REFS) : MAX_PRODUCT_REFS;
    for (const product of productsWithImages.slice(0, productRefLimit)) {
      const image = await fetchAsInlineImage(
        normalizeString(product.imagen_url),
        `product_${normalizeString(product.nombre) || product.id}`,
      );
      if (image) inlineImages.push(image);
    }

    // Logo as typography reference for first covers (not drawn — only matched).
    const hasStyleLockReference = inlineImages.some((img) =>
      img.label === 'style_lock_cover'
    );
    if (logoForOverlay && !hasStyleLockReference) {
      inlineImages.unshift({
        ...logoForOverlay,
        label: 'brand_type_reference',
      });
    }

    const productReferenceCount = inlineImages.filter((img) =>
      img.label.startsWith('product_'),
    ).length;
    const willOverlayLogo = Boolean(logoForOverlay);
    const brandMeta = resolveBrandTypography(commerce.branding_ia);

    const prompt = buildCategoryCoverPrompt({
      businessName: normalizeString(commerce.nombre),
      categoryName: normalizeString(category.nombre),
      brandColor,
      businessCategory: normalizeString(commerce.categoria) || undefined,
      productNames,
      willOverlayLogo,
      hasLogoTypeReference: inlineImages.some((img) =>
        img.label === 'brand_type_reference'
      ),
      hasStyleLockReference,
      productReferenceCount,
      titleFont: brandMeta.titleFont,
      brandMood: brandMeta.mood,
      brandVisualDescription: brandMeta.visualDescription,
      customNotes: customNotes || undefined,
    });

    const generated = await generateImageWithGemini({
      apiKey: geminiApiKey,
      prompt,
      inlineImages,
      supabase,
      commerceId,
    });

    let uploadBytes = base64ToBytes(generated.base64);
    if (logoForOverlay) {
      uploadBytes = await applyExactLogoOverlay(
        uploadBytes,
        base64ToBytes(logoForOverlay.base64),
      );
    }

    const objectPath =
      `${commerceId}/categories/ai_cat_${categoryId}_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(objectPath, uploadBytes, {
        contentType: 'image/png',
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Error uploading category cover: ${uploadError.message}`);
    }

    const publicUrl = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(objectPath)
      .data.publicUrl;

    const { error: updateError } = await supabase
      .from('categorias')
      .update({
        imagen_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .eq('comercio_id', commerceId);
    if (updateError) {
      throw new Error(`Error updating category image: ${updateError.message}`);
    }

    // Persist canonical style template once (prefer the lock we edited, else this cover).
    await ensureCategoryCoverStyleLock(
      supabase,
      commerceId,
      commerce.branding_ia,
      styleLockUrl || publicUrl,
    );

    return jsonResponse(
      {
        ok: true,
        image_url: publicUrl,
        credits_charged: COST_IMAGE,
        used_product_references: productReferenceCount,
        used_logo_overlay: willOverlayLogo,
        used_style_lock: hasStyleLockReference,
        message: 'Portada de categoría generada con IA.',
      },
      200,
    );
  } catch (error) {
    if (creditsCharged && commerceId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && serviceRoleKey) {
          const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false },
          });
          await addCredits(
            supabase,
            commerceId,
            COST_IMAGE,
            'ai_category_cover_refund',
            {
              function: 'generate-category-cover-ai',
              reason: error instanceof Error ? error.message : 'unknown',
            },
          );
        }
      } catch (refundError) {
        console.warn('Category cover credit refund failed', refundError);
      }
    }

    if (error instanceof AiUsageError) {
      return jsonResponse(error.toResponseBody(), error.status);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse(
      { error: 'category_cover_failed', message },
      500,
    );
  }
});

/** Canonical style lock: saved branding URL, else oldest AI cover (first template). */
async function findStyleLockCoverUrl(
  supabase: ReturnType<typeof createClient>,
  commerceId: string,
  currentCategoryId: string,
  brandingIa: unknown,
): Promise<string | null> {
  if (brandingIa && typeof brandingIa === 'object') {
    const saved = normalizeString(
      (brandingIa as Record<string, unknown>).category_cover_style_url,
    );
    if (saved) return saved;
  }

  const { data, error } = await supabase
    .from('categorias')
    .select('id, imagen_url')
    .eq('comercio_id', commerceId)
    .neq('id', currentCategoryId)
    .not('imagen_url', 'is', null)
    .limit(40);

  if (error || !data?.length) return null;

  const aiCovers = (data as Array<{ imagen_url?: string | null }>)
    .map((row) => normalizeString(row.imagen_url))
    .filter((url) => url.includes('/categories/ai_cat_'));

  if (aiCovers.length === 0) return null;

  aiCovers.sort((a, b) => aiCoverTimestamp(a) - aiCoverTimestamp(b));
  return aiCovers[0] || null;
}

function aiCoverTimestamp(url: string): number {
  const match = url.match(/ai_cat_[^/_]+_(\d+)\./i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

/** Save the first AI cover as the forever brand template (do not overwrite). */
async function ensureCategoryCoverStyleLock(
  supabase: ReturnType<typeof createClient>,
  commerceId: string,
  brandingIa: unknown,
  coverUrl: string,
): Promise<void> {
  const existing = brandingIa && typeof brandingIa === 'object'
    ? { ...(brandingIa as Record<string, unknown>) }
    : {};
  if (normalizeString(existing.category_cover_style_url)) return;

  existing.category_cover_style_url = coverUrl;
  const { error } = await supabase
    .from('comercios')
    .update({ branding_ia: existing })
    .eq('id', commerceId);
  if (error) {
    console.warn('Could not persist category_cover_style_url', error.message);
  }
}

/**
 * Paste the commerce logo centered at the top — keep its plate/background,
 * crisp rounded corners (NO edge blur/feather), light opacity.
 */
async function applyExactLogoOverlay(
  imageBytes: Uint8Array,
  logoBytes: Uint8Array,
): Promise<Uint8Array> {
  try {
    const base = await Image.decode(imageBytes);
    const logo = await Image.decode(logoBytes);
    if (!base || !logo) return imageBytes;

    // Compact mark (~14% width) so it never fights the category title.
    const maxLogoWidth = Math.max(40, Math.floor(base.width * 0.14));
    const maxLogoHeight = Math.max(40, Math.floor(base.height * 0.11));
    const scale = Math.min(
      maxLogoWidth / Math.max(1, logo.width),
      maxLogoHeight / Math.max(1, logo.height),
    );
    const logoWidth = Math.max(1, Math.floor(logo.width * scale));
    const logoHeight = Math.max(1, Math.floor(logo.height * scale));
    const resized = logo.resize(logoWidth, logoHeight);
    const styled = styleLogoPlate(resized, 0.72);

    const logoX = Math.floor((base.width - logoWidth) / 2);
    const logoY = Math.floor(base.height * 0.02);
    base.composite(styled, logoX, logoY);
    return await base.encode();
  } catch (error) {
    console.warn('Logo overlay failed, uploading raw AI image', error);
    return imageBytes;
  }
}

/** Keep logo plate; crisp rounded corners + uniform opacity (no feathered edges). */
function styleLogoPlate(logo: Image, opacity: number): Image {
  const w = logo.width;
  const h = logo.height;
  const radius = Math.max(10, Math.round(Math.min(w, h) * 0.22));
  const opacityClamp = Math.min(0.9, Math.max(0.45, opacity));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = Image.colorToRGBA(logo.getPixelAt(x + 1, y + 1));
      const inside = isInsideRoundedRect(x, y, w, h, radius);
      const nextA = inside ? Math.round(a * opacityClamp) : 0;
      logo.setPixelAt(x + 1, y + 1, Image.rgbaToColor(r, g, b, nextA));
    }
  }
  return logo;
}

function isInsideRoundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): boolean {
  const r = Math.min(radius, Math.floor(width / 2), Math.floor(height / 2));
  let dx = 0;
  let dy = 0;
  if (x < r) dx = r - x;
  else if (x > width - 1 - r) dx = x - (width - 1 - r);
  if (y < r) dy = r - y;
  else if (y > height - 1 - r) dy = y - (height - 1 - r);
  if (dx === 0 || dy === 0) return true;
  return (dx * dx + dy * dy) <= (r * r);
}

function resolveBrandTypography(brandingIa: unknown): {
  titleFont?: string;
  mood?: string;
  visualDescription?: string;
} {
  if (!brandingIa || typeof brandingIa !== 'object') return {};
  const map = brandingIa as Record<string, unknown>;
  const titleFont = normalizeString(map.fuente_titulos) || undefined;
  const visualDescription = normalizeString(map.descripcion_visual) || undefined;
  const moodTags = Array.isArray(map.mood_tags)
    ? map.mood_tags.map((tag) => normalizeString(tag)).filter(Boolean)
    : [];
  const mood = moodTags.length > 0 ? moodTags.join(', ') : undefined;
  return { titleFont, mood, visualDescription };
}

function resolveBrandColor(commerce: Record<string, unknown>): string {
  const branding = commerce.branding_ia;
  if (branding && typeof branding === 'object') {
    const map = branding as Record<string, unknown>;
    const fromBranding = normalizeString(map.color_principal);
    if (/^#?[0-9a-fA-F]{6}$/.test(fromBranding)) {
      return fromBranding.startsWith('#') ? fromBranding : `#${fromBranding}`;
    }
  }

  const principal = normalizeString(commerce.color_principal);
  if (/^#?[0-9a-fA-F]{6}$/.test(principal)) {
    return principal.startsWith('#') ? principal : `#${principal}`;
  }

  const palette = commerce.menu_palette_primary;
  if (typeof palette === 'number' && Number.isFinite(palette)) {
    const hex = (palette >>> 0).toString(16).padStart(8, '0').slice(-6);
    return `#${hex}`;
  }

  return '#111111';
}

async function fetchAsInlineImage(
  url: string,
  label: string,
): Promise<InlineImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
        'User-Agent': 'KosMenuCategoryCover/1.0',
      },
    });
    if (!response.ok) return null;
    const contentType = normalizeString(response.headers.get('content-type')) ||
      'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 200 || bytes.length > 4_500_000) return null;
    return {
      label,
      mimeType: contentType.split(';')[0] || 'image/jpeg',
      base64: bytesToBase64(bytes),
    };
  } catch {
    return null;
  }
}

async function generateImageWithGemini(params: {
  apiKey: string;
  prompt: string;
  inlineImages: InlineImage[];
  supabase: ReturnType<typeof createClient>;
  commerceId: string;
}): Promise<{ base64: string; mimeType: string }> {
  let lastError = 'Gemini no devolvio una imagen valida.';
  const parts: Array<Record<string, unknown>> = [{ text: params.prompt }];

  for (const image of params.inlineImages) {
    let caption = `Referencia visual (${image.label}):`;
    if (image.label === 'style_lock_cover') {
      caption =
        'style_lock_cover: ESTA es la plantilla base a EDITAR. Conserva tipografía, color y layout. Solo cambia el texto del título de categoría y el collage inferior. NO dibujes ningún logo (se añade después).';
    } else if (image.label === 'brand_type_reference') {
      caption =
        'brand_type_reference: logo real del negocio. Úsalo SOLO para igualar la tipografía/personalidad del título hero. NO lo redibujes en la imagen.';
    } else if (image.label.startsWith('product_')) {
      caption =
        `${image.label}: solo inspira el collage de comida/bebida abajo. Ignorar para tipografía/color.`;
    }
    parts.push({ text: caption });
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64,
      },
    });
  }

  for (const model of IMAGE_MODEL_FALLBACKS) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
      `?key=${encodeURIComponent(params.apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            // Vertical story / menu category tile (not landscape).
            aspectRatio: '9:16',
            imageSize: '1K',
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError =
        `Gemini image generation failed (${model}, ${response.status}): ${errorText.slice(0, 240)}`;
      console.warn('Category cover model failed', { model, status: response.status });
      continue;
    }

    const completion = await response.json();
    await recordGeminiUsage(params.supabase, params.commerceId, completion?.usageMetadata);

    const responseParts = completion?.candidates?.[0]?.content?.parts ?? [];
    for (const part of responseParts) {
      const inlineData = part?.inlineData ?? part?.inline_data;
      const base64 = normalizeString(inlineData?.data);
      const mimeType =
        normalizeString(inlineData?.mimeType ?? inlineData?.mime_type) ||
        'image/png';
      if (base64.length > 0) {
        return { base64, mimeType };
      }
    }

    lastError = `Gemini no devolvio una imagen valida (${model}).`;
  }

  throw new Error(lastError);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
