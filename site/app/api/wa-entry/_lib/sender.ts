import type { WaOutboundRecord } from './contract';
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

/**
 * Local simulated sender — never HTTP, never WaSender, never real phones.
 */
export function createSimWaEntrySender(store: WaEntryStore): WaEntrySender {
  const sentKeys = new Set(
    store.listOutbound().filter((o) => o.result === 'simulated_ok').map((o) => o.dedupeKey),
  );

  return {
    async send(req) {
      if (sentKeys.has(req.dedupeKey)) {
        const existing = store.listOutbound().find((o) => o.dedupeKey === req.dedupeKey);
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
            } satisfies WaOutboundRecord),
        };
      }

      const attempt = 1;
      if (req.forceFail) {
        const record: WaOutboundRecord = {
          id: `fail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          to: req.to,
          text: req.text,
          eventId: req.eventId,
          dedupeKey: req.dedupeKey,
          result: 'simulated_fail',
          atMs: Date.now(),
          attempt,
        };
        store.appendOutbound(record);
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
        attempt,
      };
      store.appendOutbound(record);
      sentKeys.add(req.dedupeKey);
      return { ok: true, alreadySent: false, record };
    },
  };
}

/**
 * Intentionally unimplemented for this phase.
 * Calling it must throw — production outbound queue must not be used here.
 */
export function createRefusingWasenderSender(): WaEntrySender {
  return {
    async send() {
      throw new Error(
        'wa_entry_refused: real WaSender adapter disabled in this phase (use PLATFORM_WA_ADAPTER=sim)',
      );
    },
  };
}
