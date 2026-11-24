/**
 * Bridge to Discovery tools without static server-only imports at module load
 * (keeps Vitest/wa-entry unit tests importable).
 */

export type WaMasterDiscoveryCard = {
  id: string;
  slug: string;
  nombre: string;
  menuUrl: string;
  chatUrl?: string | null;
  isOpen?: boolean | null;
  openLabel?: string | null;
};

export type WaMasterDiscoveryToolResult = {
  ok: boolean;
  tool: string;
  text?: string;
  restaurants?: WaMasterDiscoveryCard[];
  restaurant?: WaMasterDiscoveryCard | null;
  menuUrl?: string;
  chatUrl?: string | null;
  error?: string;
};

export type WaMasterDiscoveryCtx = {
  lat?: number;
  lng?: number;
  region?: string;
  pageSize?: number;
  listDirectory?: (opts: Record<string, unknown>) => Promise<{
    results: unknown[];
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  }>;
};

export type WaMasterDiscoveryExecute = (
  name: string,
  args: Record<string, unknown>,
  ctx: WaMasterDiscoveryCtx,
) => Promise<WaMasterDiscoveryToolResult>;

/** Lazy load real Discovery executor (server runtime only). */
export async function loadDefaultDiscoveryExecute(): Promise<WaMasterDiscoveryExecute> {
  const mod = await import('../../asistente/_lib/tools');
  return async (name, args, ctx) => {
    const result = await mod.executeDiscoveryTool(name, args, ctx as never);
    return {
      ok: result.ok,
      tool: result.tool,
      text: result.text,
      restaurants: result.restaurants?.map((r) => ({
        id: r.id,
        slug: r.slug,
        nombre: r.nombre,
        menuUrl: r.menuUrl,
        chatUrl: r.chatUrl,
        isOpen: r.isOpen,
        openLabel: r.openLabel,
      })),
      restaurant: result.restaurant
        ? {
            id: result.restaurant.id,
            slug: result.restaurant.slug,
            nombre: result.restaurant.nombre,
            menuUrl: result.restaurant.menuUrl,
            chatUrl: result.restaurant.chatUrl,
          }
        : result.restaurant,
      menuUrl: result.menuUrl,
      chatUrl: result.chatUrl,
      error: result.error,
    };
  };
}
