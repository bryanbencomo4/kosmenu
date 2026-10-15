type AppDownloadButtonsProps = {
  androidHref?: string;
  /** e.g. "1.0.1" from latest.json versionName */
  androidVersionName?: string | null;
  /** e.g. 7 from latest.json versionCode */
  androidVersionCode?: number | null;
  className?: string;
  size?: 'default' | 'compact';
};

function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.6 9.48l1.84-3.18a.5.5 0 10-.86-.5l-1.86 3.22A7.87 7.87 0 0012 8c-1.68 0-3.23.52-4.52 1.4L5.62 5.8a.5.5 0 10-.86.5l1.84 3.18A7.94 7.94 0 004 15.5V16a1 1 0 001 1h1v3.25a1.25 1.25 0 002.5 0V17h7v3.25a1.25 1.25 0 002.5 0V17h1a1 1 0 001-1v-.5a7.94 7.94 0 00-2.4-6.02zM9 14.25a1 1 0 110-2 1 1 0 010 2zm6 0a1 1 0 110-2 1 1 0 010 2z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M16.7 12.6c-.03-2.1 1.72-3.12 1.8-3.17-1-1.45-2.54-1.65-3.08-1.67-1.31-.13-2.56.77-3.22.77-.67 0-1.7-.75-2.8-.73-1.44.02-2.77.84-3.51 2.13-1.5 2.6-.38 6.45 1.08 8.56.71 1.03 1.56 2.19 2.68 2.15 1.08-.04 1.48-.69 2.78-.69 1.29 0 1.66.69 2.8.67 1.16-.02 1.89-1.05 2.6-2.09.82-1.19 1.15-2.34 1.17-2.4-.03-.01-2.24-.86-2.27-3.53zM14.9 6.4c.58-.7.97-1.68.86-2.65-.83.03-1.84.55-2.44 1.25-.53.61-.99 1.6-.87 2.54.92.07 1.86-.47 2.45-1.14z" />
    </svg>
  );
}

function formatAndroidVersionLabel(
  versionName?: string | null,
  versionCode?: number | null,
) {
  const name = (versionName ?? '').trim();
  if (name && versionCode != null && Number.isFinite(versionCode)) {
    return `v${name} (${versionCode})`;
  }
  if (name) return `v${name}`;
  if (versionCode != null && Number.isFinite(versionCode)) {
    return `versión ${versionCode}`;
  }
  return null;
}

export function AppDownloadButtons({
  androidHref = '/api/app/android-download',
  androidVersionName,
  androidVersionCode,
  className = '',
  size = 'default',
}: AppDownloadButtonsProps) {
  const compact = size === 'compact';
  const versionLabel = formatAndroidVersionLabel(androidVersionName, androidVersionCode);

  return (
    <div
      className={`flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center ${className}`.trim()}
    >
      <a
        href={androidHref}
        className={`group inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-emerald-300/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.22),rgba(5,150,105,0.12))] font-semibold text-emerald-50 shadow-[0_18px_40px_-28px_rgba(16,185,129,0.95)] transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-300/55 hover:bg-[linear-gradient(135deg,rgba(16,185,129,0.32),rgba(5,150,105,0.18))] hover:text-white sm:w-auto ${
          compact ? 'px-5 py-3.5 text-sm' : 'px-6 py-4 text-base'
        }`}
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-300/30 transition group-hover:bg-emerald-400/30">
          <AndroidIcon className="h-[1.1rem] w-[1.1rem]" />
        </span>
        <span className="text-left leading-tight">
          <span className="block">Descargar APK Android</span>
          <span className="block text-[11px] font-medium text-emerald-100/70">
            {versionLabel
              ? `${versionLabel} · instalación directa`
              : 'App del panel · instalación directa'}
          </span>
        </span>
      </a>

      <span
        title="La app para iPhone estará disponible pronto"
        className={`inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] font-semibold text-slate-300/85 sm:w-auto ${
          compact ? 'px-4 py-3 text-[13px]' : 'px-5 py-3.5 text-sm'
        }`}
      >
        <AppleIcon className="h-4 w-4 text-slate-200/80" />
        <span>
          iPhone <span className="text-slate-400">próximamente</span>
        </span>
      </span>
    </div>
  );
}
