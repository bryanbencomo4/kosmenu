import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getAnonServerSupabaseClient,
  getServerSupabaseClient,
  getServiceSupabaseClient,
} from '../../app/api/_lib/supabase-server';

describe('getServiceSupabaseClient privilege failure', () => {
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    if (originalServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;

    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;

    if (originalAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
  });

  it('fails controlled when service role is missing even if anon exists', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-test';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getServiceSupabaseClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    try {
      getServiceSupabaseClient();
    } catch (error) {
      expect(String(error)).not.toContain('anon-key-for-test');
    }
  });

  it('does not fall back to anon via getServerSupabaseClient alias', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-test';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getServerSupabaseClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('anon helper still works without service role', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-test';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(getAnonServerSupabaseClient()).toBeTruthy();
  });
});
