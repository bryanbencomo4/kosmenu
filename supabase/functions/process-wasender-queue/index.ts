/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type WasenderQueueJob = {
  queue_id: string;
  recipient: string;
  message: string;
  wait_ms: number;
  source: string;
  comercio_id: string | null;
  pedido_id: string | null;
  order_id: string | null;
  dedup_event_type: string | null;
  dedup_status_key: string | null;
  delivery_invitation_id: string | null;
  delivery_actor: string | null;
  attempts: number;
  session_key: 'primary' | 'secondary';
};

type WasenderPayload = {
  success?: boolean;
  message?: string;
  error?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wasender-worker-secret',
};

const DEFAULT_WASENDER_ENDPOINT = 'https://www.wasenderapi.com/api/send-message';
const SESSION_INTERVAL_MS = 5_200;
const REQUEST_TIMEOUT_MS = 15_000;

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  const primaryApiKey = Deno.env.get('WASENDER_API_KEY')?.trim() ?? '';
  const secondaryApiKey = Deno.env.get('WASENDER_API_KEY_SECONDARY')?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey || !primaryApiKey) {
    return jsonResponse({ error: 'WASender queue worker is not configured.', stage: 'configuration' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let stage = 'authorization';
  try {
    await authorizeWorker(request, supabase);
    const workerId = crypto.randomUUID();
    stage = 'claim';
    const { data, error } = await supabase.rpc('claim_wasender_message', {
      p_worker_id: workerId,
      p_has_secondary: Boolean(secondaryApiKey),
    });
    if (error) {
      throw new Error(`Unable to claim queued WhatsApp message: ${error.message}`);
    }

    const job = Array.isArray(data) ? (data[0] as WasenderQueueJob | undefined) : undefined;
    if (!job) {
      return jsonResponse({ ok: true, processed: false, reason: 'queue-empty-or-busy' }, 200);
    }

    if (job.wait_ms > 0) {
      stage = 'session-cooldown';
      await delay(job.wait_ms);
    }

    stage = 'send';
    const result = await sendMessage({
      apiKey: job.session_key === 'secondary' ? secondaryApiKey : primaryApiKey,
      endpoint: Deno.env.get('WASENDER_API_ENDPOINT')?.trim() || DEFAULT_WASENDER_ENDPOINT,
      recipient: job.recipient,
      text: job.message,
    });

    if (result.ok === false && result.retryable && job.attempts < 4) {
      stage = 'requeue';
      const { data: requeued, error: retryError } = await supabase.rpc('retry_wasender_message', {
        p_queue_id: job.queue_id,
        p_worker_id: workerId,
        p_delay_ms: SESSION_INTERVAL_MS,
        p_error: result.error,
      });
      if (retryError) {
        throw new Error(`Unable to requeue WASender message: ${retryError.message}`);
      }

      if (requeued === true) {
        await delay(SESSION_INTERVAL_MS);
        stage = 'kick-retry';
        const { error: kickError } = await supabase.rpc('kick_wasender_message_worker');
        if (kickError) {
          console.error('Unable to wake WASender queue after retry', kickError.message);
        }
        return jsonResponse({ ok: true, processed: true, queuedRetry: true }, 200);
      }
    }

    stage = 'complete';
    const { error: completeError } = await supabase.rpc('complete_wasender_message', {
      p_queue_id: job.queue_id,
      p_worker_id: workerId,
      p_sent: result.ok,
      p_error: result.error ?? null,
    });
    if (completeError) {
      throw new Error(`Unable to complete queued WhatsApp message: ${completeError.message}`);
    }

    if (!result.ok) {
      console.error('Queued WASender message failed', {
        queueId: job.queue_id,
        source: job.source,
        comercioId: job.comercio_id,
        orderId: job.order_id,
        reason: result.error?.slice(0, 160),
      });
    }

    return jsonResponse({
      ok: result.ok,
      processed: true,
      queueId: job.queue_id,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown queue worker error.';
    console.error('WASender queue worker failed', { stage, error: message.slice(0, 180) });
    return jsonResponse({ error: 'WASender queue worker failed.', stage }, 500);
  }
});

async function authorizeWorker(
  request: Request,
  supabase: ReturnType<typeof createClient>,
) {
  const providedSecret = request.headers.get('x-wasender-worker-secret')?.trim() ?? '';
  if (!providedSecret) {
    throw new Error('Unauthorized WASender queue request.');
  }

  const { data, error } = await supabase
    .from('internal_worker_secrets')
    .select('secret')
    .eq('worker_name', 'wasender_queue_worker')
    .maybeSingle();
  if (error || !data?.secret || data.secret !== providedSecret) {
    throw new Error('Unauthorized WASender queue request.');
  }
}

async function sendMessage(params: {
  apiKey: string;
  endpoint: string;
  recipient: string;
  text: string;
}) {
  try {
    const response = await fetch(params.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ to: params.recipient, text: params.text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const rawBody = await response.text();
    const payload = parsePayload(rawBody);
    const providerMessage = typeof payload === 'object' && payload !== null
      ? String((payload as WasenderPayload).message ?? (payload as WasenderPayload).error ?? '')
      : String(payload ?? '');
    const providerRejected =
      typeof payload === 'object' &&
      payload !== null &&
      (payload as WasenderPayload).success === false;

    if (response.ok && !providerRejected) {
      return { ok: true as const };
    }

    const error = providerMessage || `WASender rejected the message with status ${response.status}.`;
    return {
      ok: false as const,
      error,
      retryable: isRetryable(response.status, error),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'WASender request failed.',
      retryable: true,
    };
  }
}

function isRetryable(status: number, message: string) {
  const normalized = message.toLowerCase();
  return status === 429 ||
    status >= 500 ||
    normalized.includes('rate limit') ||
    normalized.includes('only send 1 message every 5 seconds') ||
    normalized.includes('one message every 5 seconds');
}

function parsePayload(rawBody: string): unknown {
  try {
    return rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return rawBody;
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}