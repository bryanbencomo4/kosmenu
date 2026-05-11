'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, LoaderCircle, LocateFixed, Minus, Plus, Star } from 'lucide-react';

import {
  discoveryPins,
  nearbyBusinesses,
  type DiscoveryPin,
} from '../../data/consumerBusinesses';
import { NearbyBusinessCard } from './NearbyBusinessCard';
import { FoodArtwork } from './FoodArtwork';

type GoogleMapInstance = {
  setCenter: (location: { lat: number; lng: number }) => void;
};

type GoogleMapMarker = {
  setMap: (map: GoogleMapInstance | null) => void;
};

type GoogleMapSize = unknown;
type GoogleMapPoint = unknown;

type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMapMarker;
    Size: new (width: number, height: number) => GoogleMapSize;
    Point: new (x: number, y: number) => GoogleMapPoint;
  };
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    __elMenuConsumerMapsReady?: () => void;
  }
}

const googleMapsJsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
const mapCenter = { lat: 10.4966, lng: -66.8535 };

const darkMapStyles: Array<Record<string, unknown>> = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#07111f' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#07111f' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b7a99' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#17253b' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#1c2e49' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#213657' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8493b2' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#091728' }],
  },
];

let googleMapsPromise: Promise<GoogleMapsApi | null> | null = null;

function buildMarkerSvg(pin: DiscoveryPin) {
  const label = pin.name.trim().slice(0, 1).toUpperCase();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52" fill="none"><circle cx="26" cy="26" r="20" fill="${pin.accent}" fill-opacity="0.95"/><circle cx="26" cy="26" r="24" fill="${pin.accent}" fill-opacity="0.16"/><path d="M26 7c7.732 0 14 6.268 14 14 0 8.648-9.277 19.256-12.64 22.775a1.8 1.8 0 0 1-2.72 0C21.277 40.256 12 29.648 12 21 12 13.268 18.268 7 26 7Z" fill="${pin.accent}"/><circle cx="26" cy="21" r="7.5" fill="#08111f" fill-opacity="0.95"/><text x="26" y="24.8" text-anchor="middle" fill="#F8FAFC" font-size="9" font-family="Arial, sans-serif" font-weight="700">${label}</text></svg>`,
  )}`;
}

function waitForGoogleMapsReady(timeoutMs = 10000) {
  return new Promise<GoogleMapsApi | null>((resolve) => {
    const startedAt = Date.now();

    const poll = () => {
      if (window.google?.maps) {
        resolve(window.google);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        resolve(null);
        return;
      }

      window.setTimeout(poll, 60);
    };

    poll();
  });
}

function loadGoogleMapsApi() {
  if (!googleMapsJsApiKey || typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve) => {
    const existingScript = document.querySelector(
      'script[data-elmenuxfa-consumer-maps="1"]',
    ) as HTMLScriptElement | null;

    if (existingScript) {
      waitForGoogleMapsReady().then(resolve);
      existingScript.addEventListener('load', () => {
        waitForGoogleMapsReady().then(resolve);
      });
      existingScript.addEventListener('error', () => resolve(null));
      return;
    }

    const callbackName = '__elMenuConsumerMapsReady';

    window[callbackName] = () => {
      waitForGoogleMapsReady().then((google) => {
        delete window[callbackName];
        resolve(google);
      });
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsJsApiKey)}&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.elmenuxfaConsumerMaps = '1';
    script.onerror = () => {
      delete window[callbackName];
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function MapPlaceholder({ pins }: { pins: DiscoveryPin[] }) {
  const positions = [
    'left-[14%] top-[32%]',
    'left-[40%] top-[22%]',
    'left-[58%] top-[54%]',
    'right-[22%] top-[30%]',
    'right-[10%] bottom-[20%]',
  ];

  return (
    <div className="absolute inset-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#07111f_0%,#091728_100%)]">
      <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.85)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.85)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="absolute left-[5%] top-[16%] h-1.5 w-[42%] rotate-[10deg] rounded-full bg-slate-500/35" />
      <div className="absolute left-[24%] top-[48%] h-1.5 w-[38%] -rotate-[18deg] rounded-full bg-slate-500/35" />
      <div className="absolute right-[8%] top-[20%] h-1.5 w-[28%] rotate-[24deg] rounded-full bg-slate-500/35" />
      <div className="absolute bottom-[18%] right-[18%] h-1.5 w-[36%] -rotate-[15deg] rounded-full bg-slate-500/35" />
      <div className="absolute left-[-8%] top-[-18%] h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="absolute bottom-[-12%] right-[-4%] h-44 w-44 rounded-full bg-cyan-400/14 blur-3xl" />

      {pins.map((pin, index) => (
        <div key={pin.id} className={`absolute ${positions[index] ?? positions[0]}`}>
          <div className="relative flex flex-col items-center gap-2">
            <div className="absolute inset-x-2 top-7 h-6 rounded-full bg-black/45 blur-lg" />
            <div className="relative rounded-full border border-white/14 bg-[#07111f]/90 p-1.5">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-xs font-black text-[#08111f]"
                style={{ backgroundColor: pin.accent }}
              >
                {pin.name.slice(0, 1).toUpperCase()}
              </div>
            </div>
            <span className="rounded-full border border-white/10 bg-[#08111f]/90 px-3 py-1 text-[11px] font-semibold text-white/88">
              {pin.name}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MapDiscoverySection() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<GoogleMapMarker[]>([]);
  const [mapMode, setMapMode] = useState<'loading' | 'google' | 'placeholder'>(
    googleMapsJsApiKey ? 'loading' : 'placeholder',
  );

  useEffect(() => {
    let cancelled = false;

    async function attachMap() {
      if (!googleMapsJsApiKey || !mapRef.current) {
        setMapMode('placeholder');
        return;
      }

      const google = await loadGoogleMapsApi();

      if (cancelled || !mapRef.current || !google?.maps) {
        if (!cancelled) {
          setMapMode('placeholder');
        }
        return;
      }

      const map = new google.maps.Map(mapRef.current, {
        center: mapCenter,
        zoom: 13.3,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        styles: darkMapStyles,
      });

      markersRef.current = discoveryPins.map(
        (pin) =>
          new google.maps.Marker({
            map,
            position: pin.location,
            title: pin.name,
            icon: {
              url: buildMarkerSvg(pin),
              scaledSize: new google.maps.Size(46, 46),
              anchor: new google.maps.Point(23, 40),
            },
          }),
      );

      setMapMode('google');
    }

    attachMap();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, []);

  return (
    <section id="mapa" className="px-4 pb-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px] rounded-[1.6rem] border border-white/8 bg-[#07101d]/78 p-2.5 shadow-[0_35px_90px_-55px_rgba(15,23,42,1)]">
        <div className="relative min-h-[220px] overflow-hidden rounded-[1.35rem] border border-white/8 bg-[#08111f] sm:min-h-[238px] lg:min-h-[248px]">
          <div ref={mapRef} className={`absolute inset-0 ${mapMode === 'google' ? 'opacity-100' : 'opacity-0'}`} />

          {mapMode !== 'google' ? <MapPlaceholder pins={discoveryPins} /> : null}

          {mapMode === 'loading' ? (
            <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#07111f]/88 px-3 py-2 text-xs font-semibold text-slate-200 backdrop-blur">
              <LoaderCircle className="h-4 w-4 animate-spin text-cyan-300" />
              Cargando mapa...
            </div>
          ) : null}

          <div className="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(7,17,31,0.95)_0%,rgba(7,17,31,0)_100%)]" />

          <div className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-2 md:flex">
            <button type="button" aria-label="Acercar mapa" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0a1120]/90 text-white backdrop-blur">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Alejar mapa" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0a1120]/90 text-white backdrop-blur">
              <Minus className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Centrar mapa" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0a1120]/90 text-white backdrop-blur">
              <LocateFixed className="h-4 w-4" />
            </button>
          </div>

          <div className="absolute left-3 top-3 z-10 hidden w-[236px] rounded-[1.05rem] border border-white/10 bg-[#08111f]/94 p-2.5 shadow-[0_30px_60px_-30px_rgba(15,23,42,1)] backdrop-blur xl:block">
            <p className="text-sm font-black text-white">Cerca de ti</p>
            <div className="mt-2 space-y-2">
              {nearbyBusinesses.map((business) => (
                <div key={business.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-[0.85rem] border border-white/8 bg-white/5 px-2 py-1.5">
                  <FoodArtwork theme={business.artwork} title={business.name} className="min-h-[36px]" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-white">{business.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] text-slate-300">
                      <span className="inline-flex items-center gap-1"><Star className="h-2.5 w-2.5 text-[#FACC15]" />{business.rating}</span>
                      <span>• {business.distance}</span>
                      <span>• {business.eta}</span>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/12 px-1.5 py-0.5 text-[7px] font-black tracking-[0.12em] text-emerald-300">ABIERTO</span>
                </div>
              ))}
            </div>
            <button type="button" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-300">
              Ver más negocios cercanos
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="absolute bottom-3 left-3 z-10 right-14 hidden rounded-full border border-white/10 bg-[#08111f]/88 px-4 py-2 text-sm font-medium text-slate-200 backdrop-blur lg:flex xl:hidden">
            Mapa oscuro, pines por categoría y negocios cercanos abiertos ahora.
          </div>
        </div>

        <div className="mt-3 xl:hidden">
          <div className="rounded-[1.15rem] border border-white/10 bg-[#08111f]/94 p-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-white">Cerca de ti</p>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-300">
                Ver más
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {nearbyBusinesses.map((business) => (
                <NearbyBusinessCard key={business.id} business={business} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}