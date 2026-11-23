import path from 'node:path';
import { NextResponse } from 'next/server';

import { assertSafeLocalConfig, loadWaEntryConfig } from '../../_lib/config';
import { processWaEntryEvent } from '../../_lib/process';
import { resetWaEntryRuntime, setWaEntryRuntime } from '../../_lib/runtime';
import { createSimWaEntrySender } from '../../_lib/sender';
import { createFileWaEntryStore } from '../../_lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function assertDevOnly() {
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'dev_only' }, { status: 404 });
  }
  return null;
}

/**
 * Local simulator endpoint — never registered as a WaSender webhook.
 * Forces sim adapter; ignores production keys.
 */
export async function POST(req: Request) {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as {
    text?: string;
    from?: string;
    messageId?: string;
    fromMe?: boolean;
    isGroup?: boolean;
    isStatus?: boolean;
    reset?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const config = loadWaEntryConfig({
    ...process.env,
    PLATFORM_WA_INBOUND: '1',
    PLATFORM_WA_ROUTER: '1',
    PLATFORM_WA_ADAPTER: 'sim',
    PLATFORM_WA_ALLOW_REAL_WASENDER: '0',
  });
  assertSafeLocalConfig(config);

  if (body.reset) {
    resetWaEntryRuntime();
  }

  const dataDir = path.isAbsolute(config.localDataDir)
    ? config.localDataDir
    : path.join(process.cwd(), config.localDataDir);
  const store = createFileWaEntryStore(dataDir);
  if (body.reset) store.clear();
  const sender = createSimWaEntrySender(store);
  setWaEntryRuntime({ config, store, sender });

  if (body.reset && !body.text) {
    return NextResponse.json({ ok: true, reset: true, outbound: [], threads: {} });
  }

  const from = body.from || '584129999999@s.whatsapp.net';
  const messageId =
    body.messageId || `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    event: 'messages.upsert',
    sessionId: 'ELMENUXFA1-SIM',
    data: {
      message: {
        id: messageId,
        from,
        fromMe: Boolean(body.fromMe),
        isGroup: Boolean(body.isGroup),
        isStatus: Boolean(body.isStatus),
        timestamp: Math.floor(Date.now() / 1000),
        text: String(body.text || ''),
      },
    },
  };

  const result = await processWaEntryEvent({
    config,
    store,
    sender,
    rawBody: JSON.stringify(payload),
    payload,
  });

  const snap = store.snapshot();
  return NextResponse.json({
    ok: true,
    result,
    thread: snap.threads[result.chatId || ''] || null,
    outbound: snap.outbound.slice(-10),
  });
}

export async function GET() {
  const blocked = assertDevOnly();
  if (blocked) return blocked;

  const config = loadWaEntryConfig({
    ...process.env,
    PLATFORM_WA_ADAPTER: 'sim',
  });
  const dataDir = path.isAbsolute(config.localDataDir)
    ? config.localDataDir
    : path.join(process.cwd(), config.localDataDir);
  const store = createFileWaEntryStore(dataDir);
  return NextResponse.json({
    ok: true,
    module: 'wa-entry-sim',
    snapshot: store.snapshot(),
    links: {
      consumer: config.consumerAssistantUrl,
      businessLanding: config.businessLandingUrl,
      businessRegister: config.businessRegisterUrl,
      businessManage: config.businessManageUrl,
    },
  });
}
