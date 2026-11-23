import { hashOutboundText, type WaOutboundRecord } from './contract';
import type { WaEntryAsyncStore } from './store-async';
import { asAsyncStore } from './store-async';
import type { WaEntryStore } from './store';
import type { WaEntrySender, WaSendRequest, WaSendResult } from './sender';

function toAsync(store: WaEntryStore | WaEntryAsyncStore): WaEntryAsyncStore {
  if ('hasSeenMessage' in store) return asAsyncStore(store as WaEntryStore);
  return store as WaEntryAsyncStore;
}

/**
 * Isolated Preview sender — NEVER calls production wasender_message_queue,
 * sendWhatsappText, or wasenderapi.com.
 *
 * Persists outbound rows in the Preview store for payload inspection,
 * idempotency, and retry simulation.
 */
export function createIsolatedPreviewSender(
  store: WaEntryStore | WaEntryAsyncStore,
): WaEntrySender {
  const asyncStore = toAsync(store);
  const sentKeys = new Set<string>();

  return {
    async send(req: WaSendRequest): Promise<WaSendResult> {
      if (sentKeys.has(req.dedupeKey)) {
        const existing = (await asyncStore.listOutbound(200)).find(
          (o) => o.dedupeKey === req.dedupeKey && o.result === 'simulated_ok',
        );
        return {
          ok: true,
          alreadySent: true,
          record:
            existing ||
            ({
              id: `iso_dup_${req.dedupeKey}`,
              to: req.to.replace(/\D/g, ''),
              text: req.text,
              eventId: req.eventId,
              dedupeKey: req.dedupeKey,
              result: 'simulated_ok',
              atMs: Date.now(),
              attempt: 1,
              origin: 'wa_entry_bot',
              textHash: hashOutboundText(req.text),
            } satisfies WaOutboundRecord),
        };
      }

      if (req.forceFail) {
        const record: WaOutboundRecord = {
          id: `iso_fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          to: req.to.replace(/\D/g, ''),
          text: req.text,
          eventId: req.eventId,
          dedupeKey: req.dedupeKey,
          result: 'simulated_fail',
          atMs: Date.now(),
          attempt: 1,
          origin: 'wa_entry_bot',
          textHash: hashOutboundText(req.text),
        };
        await asyncStore.appendOutbound(record);
        return { ok: false, alreadySent: false, record };
      }

      const record: WaOutboundRecord = {
        id: `iso_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        to: req.to.replace(/\D/g, ''),
        text: req.text,
        eventId: req.eventId,
        dedupeKey: req.dedupeKey,
        result: 'simulated_ok',
        atMs: Date.now(),
        attempt: 1,
        origin: 'wa_entry_bot',
        textHash: hashOutboundText(req.text),
      };
      await asyncStore.appendOutbound(record);
      sentKeys.add(req.dedupeKey);
      return { ok: true, alreadySent: false, record };
    },
  };
}
