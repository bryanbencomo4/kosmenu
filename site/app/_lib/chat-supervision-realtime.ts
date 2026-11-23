/**
 * Shared Realtime topic for chat supervision hints (ids/types only).
 * Must match server `publishConversationEvent`.
 */
export function commerceChatChannelName(comercioId: string) {
  return `commerce:${comercioId}:chat`;
}
