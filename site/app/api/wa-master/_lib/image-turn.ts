/**
 * An inbound WhatsApp photo / PDF reaches the Master brain as one text turn that carries
 * what the vision model saw. Format (single line, parseable, readable in logs):
 *
 *   [imagen:comprobante] {"resumen":"…","texto":"…","monto":"…","pie":"…"}
 */

export type ImageTurnKind = 'plato' | 'menu' | 'comprobante' | 'logo' | 'captura' | 'otro';

export type ImageTurn = {
  tipo: ImageTurnKind;
  resumen: string;
  texto: string;
  busqueda: string;
  monto: string;
  referencia: string;
  banco: string;
  fecha: string;
  /** What the person typed together with the photo (caption). */
  pie: string;
};

const MARK = /^\[imagen:(plato|menu|comprobante|logo|captura|otro)\]\s*(\{[\s\S]*\})\s*$/;

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function buildImageTurnText(input: Partial<ImageTurn> & { tipo: ImageTurnKind }): string {
  const payload: Record<string, string> = {};
  const set = (k: keyof ImageTurn, n: number) => {
    const v = clip(input[k], n);
    if (v) payload[k] = v;
  };
  set('resumen', 300);
  set('texto', 500);
  set('busqueda', 60);
  set('monto', 40);
  set('referencia', 40);
  set('banco', 40);
  set('fecha', 30);
  set('pie', 200);
  return `[imagen:${input.tipo}] ${JSON.stringify(payload)}`;
}

/** Readable one-liner for conversation memory / logs / the reply composer. */
export function describeImageTurn(img: ImageTurn): string {
  const what =
    img.tipo === 'comprobante'
      ? `comprobante de pago${img.monto ? ` por ${img.monto}` : ''}${img.banco ? ` (${img.banco})` : ''}`
      : img.tipo === 'plato'
        ? `foto de comida${img.busqueda ? `: ${img.busqueda}` : ''}`
        : img.tipo === 'menu'
          ? 'foto de un menú'
          : img.tipo === 'logo'
            ? 'logo o imagen de marca'
            : img.resumen || 'imagen';
  return `📷 El usuario envió una ${what}.${img.pie ? ` Escribió: "${img.pie}".` : ''}`;
}

export function parseImageTurn(text: string): ImageTurn | null {
  const m = MARK.exec((text || '').trim());
  if (!m) return null;
  try {
    const j = JSON.parse(m[2]) as Record<string, unknown>;
    return {
      tipo: m[1] as ImageTurnKind,
      resumen: clip(j.resumen, 300),
      texto: clip(j.texto, 500),
      busqueda: clip(j.busqueda, 60),
      monto: clip(j.monto, 40),
      referencia: clip(j.referencia, 40),
      banco: clip(j.banco, 40),
      fecha: clip(j.fecha, 30),
      pie: clip(j.pie, 200),
    };
  } catch {
    return null;
  }
}
