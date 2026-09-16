'use client';

import Link from 'next/link';
import { ArrowUpRight, LoaderCircle, MapPin, Search, Store, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type DirectoryResult = {
  id: string;
  slug: string;
  nombre: string;
  logoUrl: string | null;
  categoria: string | null;
  direccion: string | null;
  negocioVirtual: boolean;
  menuUrl: string;
};

type DirectoryResponse = {
  ok?: boolean;
  data?: {
    query?: string;
    results?: DirectoryResult[];
  };
  error?: string;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

export function MenuDirectorySearch() {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedQuery = useDebouncedValue(query, 200);
  const trimmedQuery = debouncedQuery.trim();
  const hasQuery = trimmedQuery.length > 0;

  const helperText = useMemo(() => {
    if (loading) return 'Buscando…';
    if (error) return error;
    if (hasQuery && results.length === 0) {
      return 'Sin resultados. Prueba otra palabra clave o slug.';
    }
    if (hasQuery) {
      return `${results.length} resultado${results.length === 1 ? '' : 's'}.`;
    }
    return 'Destacados';
  }, [error, hasQuery, loading, results.length]);

  const openPanel = useCallback(() => {
    setIsPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    setActiveIndex(-1);
  }, []);

  const fetchResults = useCallback(async (searchQuery: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }
      params.set('limit', searchQuery.trim() ? '10' : '3');

      const response = await fetch(`/api/comercios/directory?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as DirectoryResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo cargar el directorio.');
      }

      setResults(Array.isArray(payload.data?.results) ? payload.data.results : []);
    } catch (fetchError) {
      setResults([]);
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo buscar menús.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isPanelOpen) return;
    void fetchResults(debouncedQuery);
  }, [debouncedQuery, fetchResults, isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closePanel, isPanelOpen]);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === '#buscar') {
        openPanel();
      }
    };

    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [openPanel]);

  useEffect(() => {
    setActiveIndex(results.length > 0 ? 0 : -1);
  }, [results]);

  const activeResult = activeIndex >= 0 ? results[activeIndex] ?? null : null;

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (results.length === 0) return -1;
        return prev >= results.length - 1 ? 0 : prev + 1;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (results.length === 0) return -1;
        return prev <= 0 ? results.length - 1 : prev - 1;
      });
      return;
    }

    if (event.key === 'Enter' && activeResult) {
      event.preventDefault();
      window.location.assign(activeResult.menuUrl);
    }
  }

  const panel = isPanelOpen ? (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-[#05070f]/72 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closePanel();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar menú"
        className="flex max-h-[min(88vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0a101b]/98 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.9)]"
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
          <Search className="h-5 w-5 shrink-0 text-violet-300/90" />
          <input
            ref={inputRef}
            id={`${listboxId}-input`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Buscar"
            autoComplete="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={`${listboxId}-listbox`}
            aria-activedescendant={activeResult ? `${listboxId}-option-${activeResult.id}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-500"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/6 hover:text-white"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          ) : loading ? (
            <LoaderCircle className="h-4 w-4 animate-spin text-violet-300/80" />
          ) : null}
          <button
            type="button"
            onClick={closePanel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:bg-white/6 hover:text-white"
            aria-label="Cerrar buscador"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-4 py-2 text-xs text-slate-400 sm:px-5">{helperText}</p>

        <ul
          id={`${listboxId}-listbox`}
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 sm:px-3 sm:pb-3"
        >
          {loading && results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-400">Buscando menús…</li>
          ) : null}

          {!loading && hasQuery && results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm leading-6 text-slate-400">
              No encontramos ese menú. Prueba con otra palabra clave o slug.
            </li>
          ) : null}

          {results.map((result, index) => {
            const isActive = index === activeIndex;

            return (
              <li
                key={result.id}
                role="option"
                aria-selected={isActive}
                id={`${listboxId}-option-${result.id}`}
              >
                <Link
                  href={result.menuUrl}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 transition ${
                    isActive
                      ? 'bg-violet-500/12 text-white ring-1 ring-violet-400/20'
                      : 'text-slate-100 hover:bg-white/5'
                  }`}
                >
                  <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#111827]">
                    {result.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-5 w-5 text-violet-200/80" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{result.nombre}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                      <span className="truncate text-slate-500">/{result.slug}</span>
                      {result.categoria ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                          {result.categoria}
                        </span>
                      ) : null}
                      {result.direccion && !result.negocioVirtual ? (
                        <span className="inline-flex min-w-0 items-center gap-1 truncate">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{result.direccion}</span>
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <ArrowUpRight className={`h-4 w-4 shrink-0 ${isActive ? 'text-violet-200' : 'text-slate-500'}`} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        id="buscar"
        type="button"
        onClick={openPanel}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white/5 px-6 py-4 text-base font-semibold text-white/92 transition-all duration-300 hover:border-violet-400/30 hover:bg-white/8 hover:text-white sm:w-auto"
      >
        <Search className="h-4 w-4" />
        Buscar menú
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
