type PreviewPalette = {
  background: string;
  primary: string;
  text: string;
};

type MenuPreviewMockupProps = {
  businessName: string;
  logoUrl?: string | null;
  palette: PreviewPalette;
};

const fallbackLogo =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
      '<rect width="128" height="128" rx="24" fill="#111827"/>' +
      '<text x="64" y="74" text-anchor="middle" font-size="42" font-family="Arial" fill="#F9FAFB">M</text>' +
      '</svg>',
  );

export function MenuPreviewMockup({
  businessName,
  logoUrl,
  palette,
}: MenuPreviewMockupProps) {
  const safeName = businessName.trim() || 'Tu negocio';
  const safeLogo = (logoUrl ?? '').trim() || fallbackLogo;

  return (
    <aside className="w-full max-w-[340px] rounded-[2rem] border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/10">
      <div className="mx-auto h-3 w-24 rounded-full bg-slate-300" />
      <div
        className="mt-3 overflow-hidden rounded-[1.6rem] border border-slate-200"
        style={{
          backgroundColor: palette.background,
          color: palette.text,
        }}
      >
        <div className="p-4">
          <div className="flex items-center gap-3">
            <img
              src={safeLogo}
              alt={`Logo de ${safeName}`}
              className="h-11 w-11 rounded-xl border border-white/20 object-cover"
            />
            <div>
              <p className="text-xs uppercase tracking-[0.14em] opacity-80">Vista previa</p>
              <p className="text-base font-semibold">{safeName}</p>
            </div>
          </div>

          <button
            type="button"
            className="mt-4 w-full rounded-xl px-3 py-2 text-sm font-semibold"
            style={{
              backgroundColor: palette.primary,
              color: palette.text,
            }}
          >
            Producto destacado
          </button>

          <div className="mt-4 space-y-2">
            {['Especial del dia', 'Combo casa', 'Recomendado'].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-white/20 px-3 py-2 text-sm"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
