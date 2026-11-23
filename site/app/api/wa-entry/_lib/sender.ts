import { hashOutboundText, type WaOutboundRecord } from './contract';
import type { WaEntryConfig } from './config';
import { isAllowlisted } from './config';
import type { WaEntryAsyncStore } from './store-async';
import { asAsyncStore } from './store-async';
import type { WaEntryStore } from './store';

export type WaSendRequest = {
  to: string;
  text: string;
  eventId: string;
  dedupeKey: string;
  /** Simulate transient provider failure (tests). */
  forceFail?: boolean;
};

export type WaSendResult = {
  ok: boolean;
  record: WaOutboundRecord;
  alreadySent: boolean;
};

export interface WaEntrySender {
  send(req: WaSendRequest): Promise<WaSendResult>;
}

function toAsync(store: WaEntryStore | WaEntryAsyncStore): WaEntryAsyncStore {
  if ('hasSeenMessage' in store) return asAsyncStore(store as WaEntryStore);
  return store as WaEntryAsyncStore;
}

/**
 * Local simulated sender — never HTTP, never WaSender, never real phones.
 */
export function createSimWaEntrySender(store: WaEntryStore | WaEntryAsyncStore): WaEntrySender {
  const asyncStore = toAsync(store);
  const sentKeys = new Set<string>();

  return {
    async send(req) {
      if (sentKeys.has(req.dedupeKey)) {
        const existing = (await asyncStore.listOutbound()).find((o) => o.dedupeKey === req.dedupeKey);
        return {
          ok: true,
          alreadySent: true,
          record:
            existing ||
            ({
              id: `dup_${req.dedupeKey}`,
              to: req.to,
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
          id: `fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          to: req.to,
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
        id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        to: req.to,
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

/**
 * Prepared real Wasender adapter — reuses `sendWhatsappText` / queue, but
 * refuses unless allow flags + allowlist are set. Disabled by default.
 *
 * WARNING: enabling with production WASENDER_API_KEY sends via the existing
 * production queue worker (same session keys). Never enable without allowlist.
 */
export function createPreparedWasenderSender(params: {
  config: WaEntryConfig;
  store: WaEntryStore | WaEntryAsyncStore;
  enqueue?: (phone: string, text: string, meta: { source: string; dedupeKey: string }) => Promise<{
    ok: true;
    queued: boolean;
    response: unknown;
  }>;
}): WaEntrySender {
  const asyncStore = toAsync(params.store);
  const { config } = params;

  return {
    async send(req) {
      if (!config.allowRealWasender) {
        throw new Error('wa_entry_refused: PLATFORM_WA_ALLOW_REAL_WASENDER is off');
      }

      const digits = req.to.replace(/\D/g, '');
      if (!isAllowlisted({ ...config, enforceAllowlist: true }, digits)) {
        throw new Error('wa_entry_refused: recipient not in PLATFORM_WA_ALLOWLIST_DIGITS');
      }

      // Register bot outbound BEFORE enqueue so fromMe echo can match.
      const pending: WaOutboundRecord = {
        id: `queued_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        to: digits,
        text: req.text,
        eventId: req.eventId,
        dedupeKey: req.dedupeKey,
        result: 'queued',
        atMs: Date.now(),
        attempt: 1,
        origin: 'wa_entry_bot',
        textHash: hashOutboundText(req.text),
      };
      await asyncStore.appendOutbound(pending);

      const enqueue =
        params.enqueue ||
        (async (phone, text, meta) => {
          const mod = await import('../../_lib/send-order-whatsapp');
          return mod.sendWhatsappText(phone, text, {
            source: meta.source,
            dedupeKey: meta.dedupeKey,
          });
        });

      const result = await enqueue(req.to, req.text, {
        source: 'platform-wa-entry',
        dedupeKey: `wa-entry:${req.dedupeKey}`,
      });
      return {
        ok: true,
        alreadySent: result.queued === false,
        record: pending,
      };
    },
  };
}

/** Hard refuse — used when adapter=wasender is requested without preparation path. */
export function createRefusingWasenderSender(): WaEntrySender {
  return {
    async send() {
      throw new Error(
        'wa_entry_refused: real WaSender adapter disabled (use createPreparedWasenderSender with allow flags)',
      );
    },
  };
}
