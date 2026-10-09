export type PromoDeliveryStats = {
  comercioId: string;
  impressions: number;
  uniqueVisitors: number;
  clicks: number;
  orders: number;
};

export type PromoRankCandidate = {
  id: string;
  isOpen?: boolean | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Deterministic 32-bit hash for stable shuffle buckets. */
export function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scorePromoDelivery(options: {
  stats: PromoDeliveryStats | undefined;
  totalImpressions: number;
  cohortSize: number;
  isOpen?: boolean | null;
}) {
  const impressions = options.stats?.impressions ?? 0;
  const clicks = options.stats?.clicks ?? 0;
  const orders = options.stats?.orders ?? 0;
  const cohortSize = Math.max(1, options.cohortSize);
  const fairShare = 1 / cohortSize;
  const actualShare =
    options.totalImpressions > 0 ? impressions / options.totalImpressions : fairShare;

  // Pacing: boost under-delivered ads toward fair share.
  const underDeliveryBoost = clamp(fairShare / Math.max(actualShare, 0.02), 0.75, 4.5);

  // Learning phase: explore until enough impressions.
  const exploreFactor = impressions < 40 ? 1.35 : impressions < 120 ? 1.12 : 1;

  // Smoothed CTR / CVR (Laplace-style cold start).
  const eCtr = (clicks + 1) / (impressions + 20);
  const eCvr = (orders + 0.5) / (clicks + 10);
  const performance = 0.55 * eCtr + 0.45 * eCvr;

  const openFactor =
    options.isOpen === true ? 1.12 : options.isOpen === false ? 0.88 : 1;

  return underDeliveryBoost * performance * openFactor * exploreFactor;
}

/**
 * Rank promoted businesses with Meta-like pacing + performance.
 * Ties are broken with a stable seeded shuffle so order rotates hourly.
 */
export function rankPromotedDelivery<T extends PromoRankCandidate>(
  candidates: T[],
  statsById: Map<string, PromoDeliveryStats>,
  seedKey: string,
): T[] {
  if (candidates.length <= 1) return [...candidates];

  const totalImpressions = [...statsById.values()].reduce(
    (sum, row) => sum + row.impressions,
    0,
  );
  const cohortSize = candidates.length;

  const scored = candidates.map((entry) => ({
    entry,
    score: scorePromoDelivery({
      stats: statsById.get(entry.id),
      totalImpressions,
      cohortSize,
      isOpen: entry.isOpen,
    }),
  }));

  scored.sort((left, right) => right.score - left.score);

  // Bucket near-ties and shuffle within bucket for fairness across reloads.
  const buckets: Array<typeof scored> = [];
  for (const item of scored) {
    const last = buckets[buckets.length - 1];
    if (!last || Math.abs(last[0]!.score - item.score) > 0.015) {
      buckets.push([item]);
    } else {
      last.push(item);
    }
  }

  const out: T[] = [];
  for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex += 1) {
    const bucket = [...buckets[bucketIndex]!];
    const rand = mulberry32(hashSeed(`${seedKey}:b${bucketIndex}`));
    for (let i = bucket.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = bucket[i]!;
      bucket[i] = bucket[j]!;
      bucket[j] = tmp;
    }
    for (const item of bucket) out.push(item.entry);
  }

  return out;
}
