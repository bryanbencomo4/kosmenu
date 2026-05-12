'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  type ConsumerCategory,
  type DiscoveryPin,
  type FeaturedBusiness,
  type NearbyBusiness,
  type PromotedBusiness,
} from '../../data/consumerBusinesses';
import { CategoryChips } from './CategoryChips';
import { ConsumerFooter } from './ConsumerFooter';
import { ConsumerNavbar } from './ConsumerNavbar';
import { FeaturedBusinessesSection } from './FeaturedBusinessesSection';
import { HeroSearchSection } from './HeroSearchSection';
import { MapDiscoverySection } from './MapDiscoverySection';
import { PromotedBusinessesSlider } from './PromotedBusinessesSlider';
import { UserBenefitsSection } from './UserBenefitsSection';

const favoritesStorageKey = 'elmenuxfa:consumer-favorites:v1';

type UserLocationState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error';

function normalizeText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => (value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function formatDistance(distanceKm: number) {
  return `${Math.max(0.2, Math.round(distanceKm * 10) / 10).toFixed(1)} km`;
}

function formatEta(distanceKm: number) {
  return `${Math.max(6, Math.round(distanceKm * 11) + 6)} min`;
}

type ConsumerHomePageProps = {
  categories: ConsumerCategory[];
  featuredBusinesses: FeaturedBusiness[];
  promotedBusinesses: PromotedBusiness[];
  nearbyBusinesses: NearbyBusiness[];
  discoveryPins: DiscoveryPin[];
  mapCenter: {
    lat: number;
    lng: number;
  };
  hasRealNearbyData: boolean;
  totalBusinesses: number;
  totalPages: number;
};

export function ConsumerHomePage({
  categories,
  featuredBusinesses,
  promotedBusinesses,
  nearbyBusinesses,
  discoveryPins,
  mapCenter,
  hasRealNearbyData,
}: ConsumerHomePageProps) {
  const [draftSearch, setDraftSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState({
    openNow: false,
    delivery: false,
    pickup: false,
    promotions: false,
  });
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocationState, setUserLocationState] = useState<UserLocationState>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedFavorites = window.localStorage.getItem(favoritesStorageKey);
    if (!storedFavorites) {
      return;
    }

    try {
      const parsedFavorites = JSON.parse(storedFavorites);
      if (Array.isArray(parsedFavorites)) {
        setFavoriteKeys(parsedFavorites.filter((item): item is string => typeof item === 'string'));
      }
    } catch {
      window.localStorage.removeItem(favoritesStorageKey);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(favoritesStorageKey, JSON.stringify(favoriteKeys));
  }, [favoriteKeys]);

  const favoriteKeySet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);
  const promotedKeySet = useMemo(
    () => new Set(promotedBusinesses.map((business) => business.href ?? business.id)),
    [promotedBusinesses],
  );
  const locationAwareBusinesses = useMemo(() => {
    if (!userLocation) {
      return [];
    }

    return featuredBusinesses
      .filter((business) => business.hasPreciseLocation !== false)
      .map((business) => ({
        business,
        distanceKm: haversineKm(userLocation.lat, userLocation.lng, business.location.lat, business.location.lng),
      }))
      .filter(({ distanceKm }) => Number.isFinite(distanceKm))
      .sort((a, b) => a.distanceKm - b.distanceKm || a.business.name.localeCompare(b.business.name, 'es'));
  }, [featuredBusinesses, userLocation]);
  const resolvedNearbyBusinesses = useMemo<NearbyBusiness[]>(() => {
    if (locationAwareBusinesses.length === 0) {
      return nearbyBusinesses;
    }

    return locationAwareBusinesses.slice(0, 3).map(({ business, distanceKm }) => ({
      id: business.id,
      name: business.name,
      category: business.category,
      href: business.href,
      imageUrl: business.imageUrl,
      rating: business.rating,
      distance: formatDistance(distanceKm),
      eta: formatEta(distanceKm),
      status: 'ABIERTO',
      artwork: business.artwork,
      accent: business.accent,
      hasPreciseLocation: true,
      zone: business.zone,
      location: business.location,
    }));
  }, [locationAwareBusinesses, nearbyBusinesses]);
  const resolvedDiscoveryPins = useMemo<DiscoveryPin[]>(() => {
    if (!userLocation) {
      return discoveryPins;
    }

    const businessPins = locationAwareBusinesses.slice(0, 8).map(({ business }) => ({
      id: `pin-${business.id}`,
      name: business.name,
      accent: business.accent,
      category: business.category,
      location: business.location,
    }));

    return [
      {
        id: 'pin-user-location',
        name: 'Tu ubicación',
        accent: '#FACC15',
        category: 'Tu ubicación',
        location: userLocation,
      },
      ...businessPins,
    ];
  }, [discoveryPins, locationAwareBusinesses, userLocation]);
  const normalizedQuery = normalizeText(searchQuery);
  const normalizedCategory = normalizeText(activeCategory);
  const hasActiveFilters = Boolean(
    searchQuery.trim() || activeCategory || activeFilters.openNow || activeFilters.delivery || activeFilters.pickup || activeFilters.promotions,
  );

  const filteredFeaturedBusinesses = useMemo(() => {
    return featuredBusinesses.filter((business) => {
      const matchesQuery =
        !normalizedQuery ||
        normalizeText(business.name, business.category, business.cuisine, business.zone, business.tags.join(' ')).includes(normalizedQuery);
      const matchesCategory = !normalizedCategory || normalizeText(business.category, business.cuisine).includes(normalizedCategory);
      const matchesOpenNow = !activeFilters.openNow || business.status === 'ABIERTO';
      const matchesDelivery = !activeFilters.delivery || business.tags.includes('Delivery');
      const matchesPickup = !activeFilters.pickup || business.tags.includes('Retiro');
      const matchesPromotions =
        !activeFilters.promotions || business.isPromoted === true || promotedKeySet.has(business.href ?? business.id);

      return matchesQuery && matchesCategory && matchesOpenNow && matchesDelivery && matchesPickup && matchesPromotions;
    });
  }, [activeFilters, featuredBusinesses, normalizedCategory, normalizedQuery, promotedKeySet]);

  const activeSummary = useMemo(() => {
    const summary: string[] = [];

    if (searchQuery.trim()) {
      summary.push(`Buscar: ${searchQuery.trim()}`);
    }

    if (activeCategory) {
      summary.push(`Categoría: ${activeCategory}`);
    }

    if (activeFilters.openNow) {
      summary.push('Abiertos ahora');
    }

    if (activeFilters.delivery) {
      summary.push('Delivery');
    }

    if (activeFilters.pickup) {
      summary.push('Retiro');
    }

    if (activeFilters.promotions) {
      summary.push('Con promociones');
    }

    return summary;
  }, [activeCategory, activeFilters, searchQuery]);

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') {
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSearchSubmit = () => {
    setSearchQuery(draftSearch.trim());
    scrollToSection('favoritos');
  };

  const requestUserLocation = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setUserLocationState('unsupported');
      return;
    }

    setUserLocationState('requesting');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setUserLocationState('ready');
      },
      (error) => {
        setUserLocationState(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  };

  const handleQuickFilterSelect = (filter: 'categories' | 'location' | 'openNow' | 'delivery' | 'pickup' | 'promotions') => {
    if (filter === 'categories') {
      scrollToSection('categorias');
      return;
    }

    if (filter === 'location') {
      requestUserLocation();
      scrollToSection('mapa');
      return;
    }

    setActiveFilters((currentFilters) => ({
      ...currentFilters,
      [filter]: !currentFilters[filter],
    }));
    scrollToSection('favoritos');
  };

  const handleSelectCategory = (category: string) => {
    setActiveCategory((currentCategory) => (currentCategory === category ? null : category));
    scrollToSection('favoritos');
  };

  const clearCategory = () => {
    setActiveCategory(null);
    scrollToSection('favoritos');
  };

  const clearAllFilters = () => {
    setDraftSearch('');
    setSearchQuery('');
    setActiveCategory(null);
    setActiveFilters({
      openNow: false,
      delivery: false,
      pickup: false,
      promotions: false,
    });
    scrollToSection('favoritos');
  };

  const toggleFavorite = (businessKey: string) => {
    setFavoriteKeys((currentFavorites) =>
      currentFavorites.includes(businessKey)
        ? currentFavorites.filter((favoriteKey) => favoriteKey !== businessKey)
        : [...currentFavorites, businessKey],
    );
  };

  const showPromotionsInDirectory = () => {
    setActiveFilters((currentFilters) => ({
      ...currentFilters,
      promotions: true,
    }));
    scrollToSection('favoritos');
  };

  return (
    <main className="min-h-screen bg-[#040814] text-white">
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.08),transparent_20%)]" />

        <ConsumerNavbar />
        <HeroSearchSection
          searchValue={draftSearch}
          activeCategory={activeCategory}
          activeFilters={activeFilters}
          onSearchValueChange={setDraftSearch}
          onSearchSubmit={handleSearchSubmit}
          onQuickFilterSelect={handleQuickFilterSelect}
        />
        <PromotedBusinessesSlider
          businesses={promotedBusinesses}
          favoriteKeys={favoriteKeySet}
          onToggleFavorite={toggleFavorite}
          onViewAllPromotions={showPromotionsInDirectory}
        />
        <MapDiscoverySection
          nearbyBusinesses={resolvedNearbyBusinesses}
          discoveryPins={resolvedDiscoveryPins}
          initialMapCenter={userLocation ?? mapCenter}
          hasRealNearbyData={hasRealNearbyData}
          userLocation={userLocation}
          locationState={userLocationState}
          onRequestUserLocation={requestUserLocation}
        />
        <CategoryChips items={categories} activeCategory={activeCategory} onSelectCategory={handleSelectCategory} onViewAll={clearCategory} />
        <FeaturedBusinessesSection
          businesses={filteredFeaturedBusinesses}
          totalBusinesses={filteredFeaturedBusinesses.length}
          allBusinessesTotal={featuredBusinesses.length}
          hasActiveFilters={hasActiveFilters}
          activeSummary={activeSummary}
          favoriteKeys={favoriteKeySet}
          onToggleFavorite={toggleFavorite}
          onClearFilters={clearAllFilters}
          onOpenFilters={() => scrollToSection('explorar')}
        />
        <UserBenefitsSection />
        <ConsumerFooter />
      </div>
    </main>
  );
}