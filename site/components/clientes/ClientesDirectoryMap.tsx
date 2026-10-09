'use client';

import Link from 'next/link';
import { ArrowRight, ChevronUp, LoaderCircle, MapPin, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type MapBusiness = {
  id: string;
  nombre: string;
  menuUrl: string;
  categoria: string | null;
  ratingAverage: number;
  ratingCount: number;
  distanceKm: number | null;
  lat: number | null;
  lng: number | null;
  promovido: boolean;
};

type LatLng = { lat: number; lng: number };

type GoogleMapsBounds = {
  extend(point: LatLng): void;
};

type GoogleMapsMap = {
  fitBounds(bounds: GoogleMapsBounds, padding?: number): void;
  panTo(point: LatLng): void;
  setZoom(zoom: number): void;
};

type GoogleMapsMarker = {
  setMap(map: GoogleMapsMap | null): void;
  setIcon(icon: unknown): void;
  addListener(event: string, handler: () => void): void;
};

type GoogleMapsApi = {
  Map: new (
    element: HTMLElement,
    options: {
      center: LatLng;
      zoom: number;
      mapTypeControl: boolean;
      streetViewControl: boolean;
      fullscreenControl: boolean;
      zoomControl: boolean;
      gestureHandling: 'greedy' | 'cooperative';
      styles?: Array<Record<string, unknown>>;
    },
  ) => GoogleMapsMap;
  Marker: new (options: {
    position: LatLng;
    map: GoogleMapsMap;
    title?: string;
    icon?: unknown;
    zIndex?: number;
  }) => GoogleMapsMarker;
  LatLngBounds: new () => GoogleMapsBounds;
  SymbolPath?: { CIRCLE: unknown };
};

type GoogleMapsWindow = Window & { google?: { maps?: GoogleMapsApi } };

const googleMapsJsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
let googleMapsPromise: Promise<GoogleMapsApi> | null = null;

const MAP_STYLES: Array<Record<string, unknown>> = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
];

function loadGoogleMapsApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps solo funciona en el navegador.'));
  }
  if (!googleMapsJsApiKey) {
    return Promise.reject(new Error('Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.'));
  }

  const current = (window as GoogleMapsWindow).google?.maps;
  if (current?.Map && current.Marker && current.LatLngBounds) {
    return Promise.resolve(current);
  }
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-kosmenu-google-maps="1"], script[src*="maps.googleapis.com/maps/api/js"]',
    );
    const startedAt = Date.now();
    let settled = false;

    const finish = (maps: GoogleMapsApi | undefined) => {
      if (settled) return;
      if (maps?.Map && maps.Marker && maps.LatLngBounds) {
        settled = true;
        resolve(maps);
      }
    };

    const poll = () => {
      if (settled) return;
      const maps = (window as GoogleMapsWindow).google?.maps;
      finish(maps);
      if (settled) return;
      if (Date.now() - startedAt >= 15_000) {
        settled = true;
        reject(new Error('Google Maps no terminó de cargar.'));
        return;
      }
      window.setTimeout(poll, 50);
    };

    if (!existing) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsJsApiKey)}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      script.dataset.kosmenuGoogleMaps = '1';
      script.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        reject(new Error('No se pudo cargar Google Maps.'));
      });
      document.head.appendChild(script);
    }

    poll();
  }).catch((error) => {
    googleMapsPromise = null;
    throw error;
  });

  return googleMapsPromise;
}

function pinIcon(maps: GoogleMapsApi, active: boolean, promoted: boolean) {
  const fill = active ? '#4C1D95' : promoted ? '#7C3AED' : '#6D28D9';
  return {
    path: maps.SymbolPath?.CIRCLE ?? 0,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: active ? 3 : 2,
    scale: active ? 12 : promoted ? 10 : 9,
  };
}

function userIcon(maps: GoogleMapsApi) {
  return {
    path: maps.SymbolPath?.CIRCLE ?? 0,
    fillColor: '#0EA5E9',
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 3,
    scale: 8,
  };
}

export function ClientesDirectoryMap({
  businesses,
  selectedId,
  userCoords,
  onSelect,
}: {
  businesses: MapBusiness[];
  selectedId: string | null;
  userCoords: LatLng | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapsMap | null>(null);
  const markersRef = useRef<Map<string, GoogleMapsMarker>>(new Map());
  const userMarkerRef = useRef<GoogleMapsMarker | null>(null);
  const mapsApiRef = useRef<GoogleMapsApi | null>(null);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(true);

  useEffect(() => {
    // Re-open the floating card when the user picks another pin.
    setCardOpen(true);
  }, [selectedId]);

  const located = useMemo(
    () =>
      businesses
        .filter((item) => {
          if (item.lat == null || item.lng == null) return false;
          if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return false;
          // Ignore null-island / unset coords that explode fitBounds.
          if (Math.abs(item.lat) < 0.01 && Math.abs(item.lng) < 0.01) return false;
          if (Math.abs(item.lat) > 85 || Math.abs(item.lng) > 180) return false;
          return true;
        })
        .slice(0, 24),
    [businesses],
  );
  const selected = located.find((item) => item.id === selectedId) ?? located[0] ?? null;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!containerRef.current) return;
      if (located.length === 0 && !userCoords) {
        setStatus('empty');
        return;
      }

      setStatus('loading');
      setErrorMessage(null);

      try {
        const maps = await loadGoogleMapsApi();
        if (cancelled || !containerRef.current) return;
        mapsApiRef.current = maps;

        const center = userCoords ?? {
          lat: located[0]?.lat ?? 10.48,
          lng: located[0]?.lng ?? -66.9,
        };

        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center,
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true,
            gestureHandling: 'greedy',
            styles: MAP_STYLES,
          });
        }

        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Error al cargar el mapa');
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [located.length, userCoords]);

  useEffect(() => {
    const maps = mapsApiRef.current;
    const map = mapRef.current;
    if (!maps || !map || status !== 'ready') return;

    for (const marker of markersRef.current.values()) {
      marker.setMap(null);
    }
    markersRef.current.clear();

    const bounds = new maps.LatLngBounds();
    let hasPoint = false;
    const nearbyForBounds = userCoords
      ? located.filter(
          (item) => item.distanceKm == null || item.distanceKm <= 40,
        )
      : located;
    const boundsSource = nearbyForBounds.length > 0 ? nearbyForBounds : located;

    for (const business of located) {
      const position = { lat: business.lat!, lng: business.lng! };
      const marker = new maps.Marker({
        position,
        map,
        title: business.nombre,
        icon: pinIcon(maps, business.id === selected?.id, business.promovido),
        zIndex: business.id === selected?.id ? 20 : business.promovido ? 10 : 5,
      });
      marker.addListener('click', () => onSelectRef.current(business.id));
      markersRef.current.set(business.id, marker);
      hasPoint = true;
    }

    for (const business of boundsSource) {
      bounds.extend({ lat: business.lat!, lng: business.lng! });
    }

    if (userCoords) {
      if (userMarkerRef.current) userMarkerRef.current.setMap(null);
      userMarkerRef.current = new maps.Marker({
        position: userCoords,
        map,
        title: 'Tu ubicación',
        icon: userIcon(maps),
        zIndex: 30,
      });
      bounds.extend(userCoords);
      hasPoint = true;
    } else if (userMarkerRef.current) {
      userMarkerRef.current.setMap(null);
      userMarkerRef.current = null;
    }

    if (!hasPoint) {
      setStatus('empty');
      return;
    }

    if (boundsSource.length + (userCoords ? 1 : 0) <= 1) {
      const only = userCoords ?? { lat: located[0]!.lat!, lng: located[0]!.lng! };
      map.panTo(only);
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, 56);
      window.setTimeout(() => {
        const zoom = (map as GoogleMapsMap & { getZoom?: () => number }).getZoom?.();
        if (typeof zoom === 'number' && zoom > 15) map.setZoom(15);
        if (typeof zoom === 'number' && zoom < 11 && userCoords) map.setZoom(12);
      }, 0);
    }
  }, [located, selected?.id, status, userCoords]);

  useEffect(() => {
    const maps = mapsApiRef.current;
    const map = mapRef.current;
    if (!maps || !map || !selected || status !== 'ready') return;
    map.panTo({ lat: selected.lat!, lng: selected.lng! });
    for (const [id, marker] of markersRef.current) {
      const business = located.find((item) => item.id === id);
      if (!business) continue;
      marker.setIcon(pinIcon(maps, id === selected.id, business.promovido));
    }
  }, [located, selected, status]);

  return (
    <div className="relative">
      <div className="relative h-44 overflow-hidden rounded-2xl bg-violet-50 ring-1 ring-violet-100 sm:h-64 sm:rounded-[24px] md:h-[22rem]">
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />

        {status === 'loading' ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-violet-50/80 text-sm font-semibold text-violet-700">
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Cargando Google Maps…
            </span>
          </div>
        ) : null}

        {status === 'empty' ? (
          <div className="absolute inset-0 z-10 grid place-items-center px-6 text-center text-sm text-violet-700/80">
            Activa tu ubicación o elige una región para ver restaurantes en el mapa.
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="absolute inset-0 z-10 grid place-items-center px-6 text-center text-sm text-rose-600">
            {errorMessage ?? 'No se pudo mostrar Google Maps.'}
          </div>
        ) : null}

        <div className="absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow sm:px-3 sm:py-1.5 sm:text-[11px]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#6D28D9]" />
            <span className="truncate">
              {located.length} en mapa
              {userCoords ? ' · cerca' : ''}
            </span>
          </div>
          {status === 'ready' && selected && !cardOpen ? (
            <button
              type="button"
              onClick={() => setCardOpen(true)}
              className="inline-flex items-center gap-1 rounded-full bg-[#6D28D9] px-2.5 py-1 text-[10px] font-bold text-white shadow sm:text-[11px]"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Ver ficha
            </button>
          ) : null}
        </div>

        {status === 'ready' && selected && cardOpen ? (
          <div className="absolute bottom-12 left-3 right-3 z-30 sm:bottom-14 sm:right-auto sm:w-72">
            <div className="relative rounded-2xl border-l-4 border-[#6D28D9] bg-white/97 p-3 shadow-lg ring-1 ring-violet-100 backdrop-blur">
              <button
                type="button"
                aria-label="Ocultar ficha"
                onClick={() => setCardOpen(false)}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="pr-8 text-[10px] font-bold uppercase tracking-wide text-[#6D28D9]">
                En el mapa
              </p>
              <p className="truncate pr-8 text-sm font-extrabold text-slate-900">{selected.nombre}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {selected.distanceKm != null ? `${selected.distanceKm} km · ` : ''}
                {selected.categoria || 'Restaurante'}
                {selected.ratingCount > 0 ? ` · ★ ${selected.ratingAverage.toFixed(1)}` : ''}
              </p>
              <Link
                href={selected.menuUrl}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#6D28D9]"
              >
                Abrir menú <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
