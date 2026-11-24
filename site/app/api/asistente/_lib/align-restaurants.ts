type NamedRestaurant = { nombre: string };

/**
 * Keep the carousel in sync with the reply text.
 * Gemini often names 2–5 places while tools returned a wider page —
 * the cards should show the same set the user just read (mention order).
 */
export function alignDiscoveryRestaurantsToReplyText<T extends NamedRestaurant>(
  text: string,
  restaurants: T[],
): T[] {
  if (!text?.trim() || restaurants.length <= 1) return restaurants;

  const lower = text.toLowerCase();

  type Hit = { restaurant: T; at: number; order: number };
  const hits: Hit[] = [];

  restaurants.forEach((restaurant, order) => {
    const name = (restaurant.nombre || '').trim();
    if (name.length < 2) return;

    let at = lower.indexOf(name.toLowerCase());
    if (at < 0) {
      const short = name.split(/\s*[—–\-|:·]\s*/)[0]?.trim() || '';
      if (short.length >= 4) {
        at = lower.indexOf(short.toLowerCase());
      }
    }
    if (at < 0) return;
    hits.push({ restaurant, at, order });
  });

  if (hits.length === 0) return restaurants;

  hits.sort((a, b) => a.at - b.at || a.order - b.order);

  // Reorder when every card was named; otherwise keep only the named subset.
  if (hits.length === restaurants.length) {
    return hits.map((h) => h.restaurant);
  }
  return hits.map((h) => h.restaurant);
}
