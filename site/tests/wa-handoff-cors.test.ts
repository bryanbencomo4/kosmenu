import { describe, expect, it } from 'vitest';

import { appCorsHeaders } from '../app/api/_lib/app-cors';

describe('app CORS for Flutter → Next', () => {
  it('allows app.elmenuxfa.com with Authorization', () => {
    const req = new Request('https://elmenuxfa.com/api/asistente-negocio', {
      headers: { origin: 'https://app.elmenuxfa.com' },
    });
    const h = appCorsHeaders(req, {
      methods: 'POST, OPTIONS',
      headers: 'authorization, content-type, accept',
    });
    expect(h['Access-Control-Allow-Origin']).toBe('https://app.elmenuxfa.com');
    expect(h['Access-Control-Allow-Headers']).toMatch(/authorization/i);
  });

  it('rejects arbitrary origins', () => {
    const req = new Request('https://elmenuxfa.com/api/asistente-negocio', {
      headers: { origin: 'https://evil.example' },
    });
    const h = appCorsHeaders(req);
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
