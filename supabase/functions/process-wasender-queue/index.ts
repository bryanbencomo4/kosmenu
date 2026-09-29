/// <reference path="../_shared/edge-runtime.d.ts" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed.' },
      { status: 405, headers: corsHeaders },
    );
  }

  return Response.json(
    { ok: true, processed: false, skipped: true, reason: 'direct-whatsapp-only' },
    { status: 200, headers: corsHeaders },
  );
});
