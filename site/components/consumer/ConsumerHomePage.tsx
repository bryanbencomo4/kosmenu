import {
  categories,
  featuredBusinesses,
  promotedBusinesses,
} from '../../data/consumerBusinesses';
import { CategoryChips } from './CategoryChips';
import { ConsumerFooter } from './ConsumerFooter';
import { ConsumerNavbar } from './ConsumerNavbar';
import { FeaturedBusinessesSection } from './FeaturedBusinessesSection';
import { HeroSearchSection } from './HeroSearchSection';
import { MapDiscoverySection } from './MapDiscoverySection';
import { PromotedBusinessesSlider } from './PromotedBusinessesSlider';
import { UserBenefitsSection } from './UserBenefitsSection';

export function ConsumerHomePage() {
  return (
    <main className="min-h-screen bg-[#040814] text-white">
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.08),transparent_20%)]" />

        <ConsumerNavbar />
        <HeroSearchSection />
        <MapDiscoverySection />
        <PromotedBusinessesSlider businesses={promotedBusinesses} />
        <CategoryChips items={categories} />
        <FeaturedBusinessesSection businesses={featuredBusinesses} />
        <UserBenefitsSection />
        <ConsumerFooter />
      </div>
    </main>
  );
}