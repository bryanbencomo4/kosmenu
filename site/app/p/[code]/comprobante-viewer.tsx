'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  orderId: string;
  previewUrl: string | null;
  fileUrl: string;
  downloadUrl: string;
  isPdf: boolean;
};

const SCALES = [1, 2, 3] as const;
/** Never leave the spinner spinning — abort and offer retry. */
const LOAD_TIMEOUT_MS = 14_000;
const MAX_AUTO_RETRIES = 1;

function withRetryParam(url: string, attempt: number) {
  if (attempt <= 0) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}r=${attempt}`;
}

export function ComprobanteViewer({
  orderId,
  previewUrl,
  fileUrl,
  downloadUrl,
  isPdf,
}: Props) {
  const [attempt, setAttempt] = useState(0);
  const [useOriginal, setUseOriginal] = useState(!previewUrl);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [scale, setScale] = useState<(typeof SCALES)[number]>(1);
  const [notice, setNotice] = useState('');
  const autoRetriesRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  const requestUrl = useMemo(() => {
    const base = useOriginal || !previewUrl ? fileUrl : previewUrl;
    return withRetryParam(base, attempt);
  }, [attempt, fileUrl, previewUrl, useOriginal]);

  const downloadHref = useMemo(
    () => withRetryParam(downloadUrl, attempt),
    [attempt, downloadUrl],
  );

  useEffect(() => {
    if (!zoomed) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setZoomed(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [zoomed]);

  useEffect(() => {
    if (isPdf) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

    setLoaded(false);
    setFailed(false);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setObjectUrl(null);
    }

    void (async () => {
      try {
        const response = await fetch(requestUrl, {
          signal: controller.signal,
          cache: 'default',
          credentials: 'same-origin',
        });
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        if (!blob || blob.size <= 0) {
          throw new Error('EMPTY_BLOB');
        }
        const nextUrl = URL.createObjectURL(blob);
        objectUrlRef.current = nextUrl;
        setObjectUrl(nextUrl);
        setLoaded(true);
        setFailed(false);
        autoRetriesRef.current = 0;
      } catch {
        if (cancelled) return;
        handleLoadFailure();
      } finally {
        window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
    // handleLoadFailure reads latest state via functional updates / refs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestUrl, isPdf]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  function handleLoadFailure() {
    if (!useOriginal && previewUrl) {
      setUseOriginal(true);
      setLoaded(false);
      setFailed(false);
      return;
    }
    if (autoRetriesRef.current < MAX_AUTO_RETRIES) {
      autoRetriesRef.current += 1;
      setFailed(false);
      setLoaded(false);
      setUseOriginal(!previewUrl);
      setAttempt((value) => value + 1);
      return;
    }
    setFailed(true);
    setLoaded(false);
  }

  function retry() {
    autoRetriesRef.current = 0;
    setFailed(false);
    setLoaded(false);
    setUseOriginal(!previewUrl);
    setAttempt((value) => value + 1);
  }

  async function share() {
    const url = window.location.href;
    const title = `Comprobante ${orderId}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Enlace copiado');
    } catch {
      setNotice('No se pudo compartir');
    }
  }

  function zoomBy(step: number) {
    setScale((current) => {
      const index = SCALES.indexOf(current);
      const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, index + step))];
      return next ?? current;
    });
  }

  const displaySrc = objectUrl;

  return (
    <div>
      <style>{`@keyframes comprobante-spin{to{transform:rotate(360deg)}}`}</style>
      {isPdf ? (
        <p style={hintStyle}>Este comprobante es un PDF.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              if (!loaded || !displaySrc) return;
              setScale(1);
              setZoomed(true);
            }}
            aria-label={`Ampliar comprobante ${orderId}`}
            style={thumbButtonStyle}
          >
            <span style={frameStyle}>
              {!loaded && !failed ? (
                <span style={loadingWrapStyle} aria-live="polite">
                  <span style={spinnerStyle} aria-hidden="true" />
                  <span style={loadingTextStyle}>Cargando…</span>
                </span>
              ) : null}
              {failed ? (
                <span style={failBlockStyle}>
                  <span style={hintStyle}>No se pudo mostrar la imagen.</span>
                  <button
                    type="button"
                    style={retryStyle}
                    onClick={(event) => {
                      event.stopPropagation();
                      retry();
                    }}
                  >
                    Reintentar
                  </button>
                </span>
              ) : null}
              {loaded && displaySrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displaySrc}
                  alt={`Comprobante ${orderId}`}
                  decoding="async"
                  style={{
                    display: 'block',
                    width: 200,
                    maxWidth: '100%',
                    height: 'auto',
                    maxHeight: 280,
                    objectFit: 'contain',
                  }}
                />
              ) : null}
            </span>
          </button>
          <p style={hintStyle}>
            {failed ? 'Error al cargar' : loaded ? 'Toca para ampliar' : 'Cargando comprobante…'}
          </p>
        </>
      )}

      <div style={actionsStyle}>
        <button type="button" onClick={() => void share()} style={actionStyle}>
          Compartir
        </button>
        <a href={downloadHref} target="_blank" rel="noopener noreferrer" style={actionStyle}>
          Descargar
        </a>
        {isPdf ? (
          <a
            href={withRetryParam(fileUrl, attempt)}
            target="_blank"
            rel="noopener noreferrer"
            style={actionStyle}
          >
            Abrir PDF
          </a>
        ) : null}
        {failed ? (
          <button type="button" onClick={retry} style={actionStyle}>
            Reintentar
          </button>
        ) : null}
      </div>
      {notice ? <p style={hintStyle}>{notice}</p> : null}

      {zoomed && !isPdf && loaded && displaySrc ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Comprobante ${orderId}`}
          style={overlayStyle}
          onClick={() => setZoomed(false)}
        >
          <div style={overlayBarStyle} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setZoomed(false)} style={overlayButtonStyle}>
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => zoomBy(-1)}
              disabled={scale <= 1}
              style={overlayButtonStyle}
              aria-label="Reducir"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1)}
              disabled={scale >= 3}
              style={overlayButtonStyle}
              aria-label="Ampliar"
            >
              +
            </button>
          </div>
          <div style={overlayScrollStyle} onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displaySrc}
              alt={`Comprobante ${orderId}`}
              decoding="async"
              onDoubleClick={() => setScale((current) => (current >= 2 ? 1 : 2))}
              style={{
                display: 'block',
                width: scale === 1 ? 'min(100%, 440px)' : scale * 440,
                maxWidth: scale === 1 ? '100%' : 'none',
                height: 'auto',
                margin: '0 auto',
                background: '#fff',
                borderRadius: 12,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const thumbButtonStyle = {
  display: 'block',
  margin: '0 auto',
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'zoom-in',
} as const;

const frameStyle = {
  position: 'relative' as const,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 200,
  maxWidth: '100%',
  minHeight: 180,
  padding: 8,
  borderRadius: 16,
  background: '#fff',
  boxShadow: '0 10px 28px rgba(15, 23, 42, 0.12)',
};

const loadingWrapStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  minHeight: 160,
  width: '100%',
};

const spinnerStyle = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '3px solid #e2e8f0',
  borderTopColor: '#6d28d9',
  animation: 'comprobante-spin 0.8s linear infinite',
} as const;

const loadingTextStyle = {
  color: '#64748b',
  fontSize: 12,
  fontWeight: 700,
} as const;

const hintStyle = {
  margin: '10px 0 0',
  color: '#64748b',
  fontSize: 13,
  lineHeight: 1.4,
  textAlign: 'center' as const,
};

const failBlockStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 8,
  padding: 8,
};

const retryStyle = {
  border: 0,
  background: '#6d28d9',
  color: '#fff',
  borderRadius: 10,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const actionsStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 8,
  justifyContent: 'center',
  marginTop: 16,
};

const actionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '0 16px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
  fontWeight: 700,
  fontSize: 14,
  textDecoration: 'none',
  cursor: 'pointer',
} as const;

const overlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  zIndex: 40,
  display: 'flex',
  flexDirection: 'column' as const,
  background: 'rgba(15, 23, 42, 0.92)',
};

const overlayBarStyle = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
  padding: '12px 12px 8px',
};

const overlayButtonStyle = {
  minWidth: 44,
  minHeight: 40,
  padding: '0 12px',
  borderRadius: 10,
  border: 0,
  background: '#fff',
  color: '#0f172a',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const overlayScrollStyle = {
  flex: 1,
  overflow: 'auto',
  padding: '8px 16px 28px',
  WebkitOverflowScrolling: 'touch',
} as const;
