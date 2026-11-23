import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getDiscoveryAssistantConfig } from '../app/api/asistente/_lib/config';
import { extractDiscoveryGeminiUsage } from '../app/api/asistente/_lib/gemini-usage';
import {
  __resetDiscoveryTokenIdempotencyForTests,
  recordDiscoveryTokens,
  reserveDiscoveryRequest,
} from '../app/api/asistente/_lib/quota';

describe('discovery token recording', () => {
  let dir: string;

  afterEach(() => {
    __resetDiscoveryTokenIdempotencyForTests();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('records tokens once per requestId on filesystem backend', async () => {
    dir = mkdtempSync(join(tmpdir(), 'disc-quota-'));
    const config = getDiscoveryAssistantConfig({
      NODE_ENV: 'test',
      DISCOVERY_ASSISTANT_QUOTA_BACKEND: 'filesystem',
      DISCOVERY_ASSISTANT_USAGE_DIR: dir,
      DISCOVERY_ASSISTANT_MAX_REQUESTS_PER_SESSION: '15',
      DISCOVERY_ASSISTANT_MAX_MONTHLY_REQUESTS: '200',
      DISCOVERY_ASSISTANT_MAX_MONTHLY_TOKENS: '500000',
    } as NodeJS.ProcessEnv);

    await reserveDiscoveryRequest({
      config,
      sessionId: 'session-token-test-001',
      requestId: 'r_tokenTest001abcdef12',
    });

    const first = await recordDiscoveryTokens({
      config,
      requestId: 'r_tokenTest001abcdef12',
      model: 'test-model',
      tokensInput: 100,
      tokensOutput: 40,
    });
    expect(first?.tokensInput).toBe(100);
    expect(first?.tokensOutput).toBe(40);

    // Same requestId must not double-count (durable filesystem ledger + in-process).
    const second = await recordDiscoveryTokens({
      config,
      requestId: 'r_tokenTest001abcdef12',
      model: 'test-model',
      tokensInput: 100,
      tokensOutput: 40,
    });
    expect(second).toBeNull();

    await reserveDiscoveryRequest({
      config,
      sessionId: 'session-token-test-001',
      requestId: 'r_tokenTest002abcdef34',
    });
    // Clear in-process map so durable ledger is the source of truth for the next assert path.
    __resetDiscoveryTokenIdempotencyForTests();
    const third = await recordDiscoveryTokens({
      config,
      requestId: 'r_tokenTest002abcdef34',
      model: 'test-model',
      tokensInput: 10,
      tokensOutput: 5,
    });
    expect(third?.tokensInput).toBe(110);
    expect(third?.tokensOutput).toBe(45);

    // Idempotent reserve: same requestId does not burn another session/month slot.
    const before = await reserveDiscoveryRequest({
      config,
      sessionId: 'session-token-test-001',
      requestId: 'r_tokenTest002abcdef34',
    });
    expect(before.session.requests).toBe(2);
    expect(before.period.requests).toBe(2);
  });

  it('rejects invalid server request ids', async () => {
    dir = mkdtempSync(join(tmpdir(), 'disc-quota-bad-'));
    const config = getDiscoveryAssistantConfig({
      NODE_ENV: 'test',
      DISCOVERY_ASSISTANT_QUOTA_BACKEND: 'filesystem',
      DISCOVERY_ASSISTANT_USAGE_DIR: dir,
    } as NodeJS.ProcessEnv);
    await expect(
      reserveDiscoveryRequest({
        config,
        sessionId: 'session-token-test-001',
        requestId: 'client-forged-id',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request_id' });
  });

  it('pilot budget defaults match Paso C', () => {
    const config = getDiscoveryAssistantConfig({
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv);
    expect(config.maxRequestsPerSession).toBe(15);
    expect(config.maxMonthlyRequests).toBe(200);
    expect(config.maxMonthlyTokens).toBe(500_000);
    expect(config.maxToolRounds).toBe(2);
    expect(config.maxGeminiHttpCallsPerRequest).toBe(3);
    expect(config.geminiHttpBudget).toBe(0);
    expect(config.maxOutputTokens).toBe(512);
  });

  it('honors explicit Gemini HTTP budget env', () => {
    const config = getDiscoveryAssistantConfig({
      NODE_ENV: 'test',
      DISCOVERY_ASSISTANT_GEMINI_HTTP_BUDGET: '15',
      DISCOVERY_ASSISTANT_MAX_GEMINI_HTTP_CALLS: '3',
    } as NodeJS.ProcessEnv);
    expect(config.geminiHttpBudget).toBe(15);
    expect(config.maxGeminiHttpCallsPerRequest).toBe(3);
  });

  it('extracts usageMetadata counts', () => {
    expect(
      extractDiscoveryGeminiUsage({
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
      }),
    ).toEqual({ in: 12, out: 8 });
    expect(extractDiscoveryGeminiUsage({})).toEqual({ in: 0, out: 0 });
  });
});
