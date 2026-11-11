'use client';

import { useEffect, useRef, useState } from 'react';

type DeliveryMapPreviewProps = {
  lat: number;
  lng: number;
  locating?: boolean;
  className?: string;
  onOpenMap?: () => void;
};

type GoogleMapInstance = {
  panTo: (point: { lat: number; lng: number }) => void;
  setCenter: (point: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  addListener: (event: string, listener: () => void) => { remove?: () => void };
};

type GoogleMapsApi = {
  maps: {
    Map: new (el: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    event?: {
      trigger: (instance: GoogleMapInstance, eventName: string) => void;
    };
  };
};

type WindowWithGoogle = Window & {
  google?: GoogleMapsApi;
  [key: string]: unknown;
};

const googleMapsJsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
let googleMapsScriptPromise: Promise<GoogleMapsApi | null> | null = null;

function waitForGoogleMaps(timeoutMs = 10000) {
  return new Promise<GoogleMapsApi | null>((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const startedAt = Date.now();
    const tick = () => {
      const maps = (window as WindowWithGoogle).google;
      if (maps?.maps?.Map) {
        resolve(maps);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Google Maps API no termino de cargar.'));
        return;
      }
      window.setTimeout(tick, 60);
    };
    tick();
  });
}

function loadGoogleMapsApi() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const win = window as WindowWithGoogle;
  if (win.google?.maps?.Map) return Promise.resolve(win.google);
  if (!googleMapsJsApiKey) return Promise.resolve(null);
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-kosmenu-google-maps="1"]',
    ) as HTMLScriptElement | null;
    if (existing) {
      waitForGoogleMaps().then(resolve).catch(reject);
      existing.addEventListener('load', () => {
        waitForGoogleMaps().then(resolve).catch(reject);
      });
      existing.addEventListener('error', reject);
      return;
    }

    const callbackName = '__kosmenuGoogleMapsReady';
    win[callbackName] = () => {
      waitForGoogleMaps()
        .then((google) => {
          delete win[callbackName];
          resolve(google);
        })
        .catch((error) => {
          delete win[callbackName];
          reject(error);
        });
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsJsApiKey)}&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.kosmenuGoogleMaps = '1';
    script.onerror = (error) => {
      delete win[callbackName];
      reject(error);
    };
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

export function DeliveryMapPreview({
  lat,
  lng,
  locating = false,
  className,
  onOpenMap,
}: DeliveryMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleListener: { remove?: () => void } | null = null;
    let tilesListener: { remove?: () => void } | null = null;
    let readyTimer: number | null = null;
    setReady(false);
    setFailed(false);

    void (async () => {
      try {
        const google = await loadGoogleMapsApi();
        if (cancelled) return;
        if (!google?.maps?.Map || !containerRef.current) {
          setFailed(true);
          return;
        }

        const point = { lat, lng };
        // Recreate each time so Strict Mode / step remounts always paint like the picker.
        mapRef.current = null;
        containerRef.current.innerHTML = '';

        const map = new google.maps.Map(containerRef.current, {
          center: point,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          clickableIcons: false,
          draggable: false,
          scrollwheel: false,
          disableDoubleClickZoom: true,
          keyboardShortcuts: false,
          gestureHandling: 'none',
        });
        mapRef.current = map;

        const markReady = () => {
          if (!cancelled) setReady(true);
        };
        idleListener = map.addListener('idle', markReady);
        tilesListener = map.addListener('tilesloaded', markReady);
        readyTimer = window.setTimeout(markReady, 1600);

        window.requestAnimationFrame(() => {
          if (cancelled || !mapRef.current) return;
          google.maps.event?.trigger(mapRef.current, 'resize');
          mapRef.current.setCenter(point);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (readyTimer != null) window.clearTimeout(readyTimer);
      idleListener?.remove?.();
      tilesListener?.remove?.();
      mapRef.current = null;
    };
  }, [lat, lng]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        height: 168,
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: '#e7e5e4',
        border: '1px solid var(--menu-border)',
      }}
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {/* Same center pin as the full “Punto de entrega” picker */}
      <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
        <div
          className="-mt-6 text-4xl leading-none drop-shadow-[0_8px_8px_rgba(15,23,42,0.22)]"
          aria-hidden="true"
        >
          📍
        </div>
      </div>
      {locating || (!ready && !failed) ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
          style={{ backgroundColor: 'rgba(231, 229, 228, 0.82)' }}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
            <p className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-900 shadow-sm">
              {locating ? 'Obteniendo tu ubicación…' : 'Cargando mapa…'}
            </p>
          </div>
        </div>
      ) : null}
      {failed ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[#e7e5e4]">
          <p className="max-w-[220px] rounded-2xl bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-700 shadow-sm">
            Toca el mapa para marcar tu ubicación
          </p>
        </div>
      ) : null}
      {onOpenMap ? (
        <button
          type="button"
          onClick={onOpenMap}
          className="absolute inset-0 z-20 cursor-pointer bg-transparent"
          aria-label="Cambiar ubicación en el mapa"
        />
      ) : null}
    </div>
  );
}
