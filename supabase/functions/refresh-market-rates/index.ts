/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ProviderName = 'bcv' | 'p2p_binance';

type GlobalRatesRow = {
  id?: number;
  bcv_rate?: number | string;
  p2p_binance_rate?: number | string;
  payload?: Record<string, unknown> | null;
  updated_at?: string;
};

type GoogleAnchorKey = 'USD/COP' | 'USD/EUR' | 'VES/USD';

type GoogleAnchorRates = Record<GoogleAnchorKey, number>;

type GoogleFetchResult = {
  ok: boolean;
  rates: GoogleAnchorRates;
  warnings: string[];
  payload: Record<string, unknown>;
};

type ProviderFetchResult = {
  provider: ProviderName;
  ok: boolean;
  fetchedRate: number | null;
  appliedRate: number | null;
  responseStatus: number | null;
  responseTimeMs: number;
  sourceUrl: string;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  fallbackUsed: boolean;
};

type RefreshRequest = {
  dry_run?: boolean;
  max_delta_percent?: number;
  max_spread_percent?: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-rate-refresh-secret',
};

const BCV_URL = 'https://www.bcv.org.ve/estadisticas/tipo-cambio-de-referencia-smc';
const BCV_TEXT_MIRROR_URL = 'https://r.jina.ai/http://www.bcv.org.ve/estadisticas/tipo-cambio-de-referencia-smc';
const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const GOOGLE_FINANCE_MIRROR_URL = 'https://r.jina.ai/http://www.google.com/finance/quote/';
const DEFAULT_MAX_DELTA_PERCENT = 35;
const DEFAULT_MAX_SPREAD_PERCENT = 50;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return jsonResponse(
      {
        ok: true,
        function: 'refresh-market-rates',
        providers: ['bcv', 'p2p_binance', 'google'],
        expectedUnit: 'VES por 1 USD',
      },
      200,
    );
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    authorizeRequest(req);

    const body = await readRequestBody(req);
    const dryRun = body.dry_run === true;
    const maxDeltaPercent = normalizePositiveNumber(body.max_delta_percent) ||
      DEFAULT_MAX_DELTA_PERCENT;
    const maxSpreadPercent = normalizePositiveNumber(body.max_spread_percent) ||
      DEFAULT_MAX_SPREAD_PERCENT;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error: 'Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const previous = await loadLatestGlobalRates(supabase);
    const runId = crypto.randomUUID();

    const previousGoogleRates = extractGoogleAnchorRates(previous?.payload);

    const [bcvRaw, p2pRaw, google] = await Promise.all([
      fetchBcvRate(),
      fetchBinanceP2PRate(),
      fetchGoogleAnchorRates(previousGoogleRates),
    ]);

    const bcv = resolveAppliedRate({
      result: bcvRaw,
      previousRate: parseRate(previous?.bcv_rate),
      maxDeltaPercent,
    });
    const p2p = resolveAppliedRate({
      result: p2pRaw,
      previousRate: parseRate(previous?.p2p_binance_rate),
      maxDeltaPercent,
    });

    const providerResults = [bcv, p2p];
    const freshProviderCount = providerResults.filter((item) => item.ok && !item.fallbackUsed).length;

    if (bcv.appliedRate == null || p2p.appliedRate == null || !google.ok) {
      await insertFetchLogs(supabase, runId, providerResults);
      return jsonResponse(
        {
          ok: false,
          error: 'No fue posible resolver todas las tasas con datos frescos o fallback previo.',
          run_id: runId,
          providers: providerResults,
          google,
        },
        502,
      );
    }

    const warnings = buildWarnings({
      bcvRate: bcv.appliedRate,
      p2pRate: p2p.appliedRate,
      maxSpreadPercent,
      freshProviderCount,
    });

    const previousBcv = parseRate(previous?.bcv_rate);
    const previousP2p = parseRate(previous?.p2p_binance_rate);
    const previousGoogleChanged =
      previousGoogleRates['USD/COP'] !== google.rates['USD/COP'] ||
      previousGoogleRates['USD/EUR'] !== google.rates['USD/EUR'] ||
      previousGoogleRates['VES/USD'] !== google.rates['VES/USD'];
    const shouldInsert =
      !dryRun &&
      (previous == null ||
        previousBcv !== bcv.appliedRate ||
        previousP2p !== p2p.appliedRate ||
        previousGoogleChanged);

    if (shouldInsert) {
      const payload = {
        run_id: runId,
        source: 'refresh-market-rates',
        warnings: [...warnings, ...google.warnings],
        google_rates: google.rates,
        providers: providerResults.map((item) => ({
          provider: item.provider,
          ok: item.ok,
          fetched_rate: item.fetchedRate,
          applied_rate: item.appliedRate,
          fallback_used: item.fallbackUsed,
          response_status: item.responseStatus,
          response_time_ms: item.responseTimeMs,
          source_url: item.sourceUrl,
          error_message: item.errorMessage,
          payload: item.payload,
        })),
        google_provider: google.payload,
      };

      const { error } = await supabase.from('global_market_rates').insert({
        bcv_rate: bcv.appliedRate,
        p2p_binance_rate: p2p.appliedRate,
        provider: 'refresh-market-rates',
        payload,
      });

      if (error) {
        throw new Error(`Error inserting global_market_rates: ${error.message}`);
      }
    }

    await insertFetchLogs(supabase, runId, providerResults);

    return jsonResponse(
      {
        ok: true,
        run_id: runId,
        dry_run: dryRun,
        inserted: shouldInsert,
        previous_rates: {
          bcv: previousBcv,
          p2p_binance: previousP2p,
          google: previousGoogleRates,
        },
        next_rates: {
          bcv: bcv.appliedRate,
          p2p_binance: p2p.appliedRate,
          google: google.rates,
        },
        warnings: [...warnings, ...google.warnings],
        providers: providerResults,
        google,
      },
      200,
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unknown refresh-market-rates error.';
    return jsonResponse({ ok: false, error: message }, status);
  }
});

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function authorizeRequest(req: Request): void {
  const expectedSecret = (Deno.env.get('RATE_REFRESH_SECRET') ?? '').trim();
  if (!expectedSecret) {
    throw new HttpError('Missing env var RATE_REFRESH_SECRET.', 500);
  }

  const secretHeader = (req.headers.get('x-rate-refresh-secret') ?? '').trim();
  const authHeader = (req.headers.get('authorization') ?? '').trim();
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (secretHeader === expectedSecret || bearer === expectedSecret) {
    return;
  }

  throw new HttpError('Unauthorized request. Missing valid RATE_REFRESH_SECRET.', 401);
}

async function readRequestBody(req: Request): Promise<RefreshRequest> {
  const contentLength = req.headers.get('content-length');
  if (contentLength == null || contentLength == '0') {
    return {};
  }

  try {
    const body = await req.json();
    return isRecord(body) ? body as RefreshRequest : {};
  } catch {
    return {};
  }
}

async function loadLatestGlobalRates(
  supabase: ReturnType<typeof createClient>,
): Promise<GlobalRatesRow | null> {
  const { data, error } = await supabase
    .from('global_market_rates')
    .select('id, bcv_rate, p2p_binance_rate, payload, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Error loading latest global rates: ${error.message}`);
  }

  return data as GlobalRatesRow | null;
}

async function fetchBcvRate(): Promise<ProviderFetchResult> {
  const startedAt = Date.now();
  try {
    const primaryAttempt = await fetchBcvDocument(BCV_URL);
    let selectedAttempt = primaryAttempt;

    if (!primaryAttempt.ok || primaryAttempt.rate <= 0) {
      const mirrorAttempt = await fetchBcvDocument(BCV_TEXT_MIRROR_URL);
      if (mirrorAttempt.ok && mirrorAttempt.rate > 0) {
        selectedAttempt = mirrorAttempt;
      } else if (!primaryAttempt.ok && mirrorAttempt.errorMessage.length > 0) {
        selectedAttempt = {
          ...primaryAttempt,
          errorMessage: `${primaryAttempt.errorMessage} | mirror: ${mirrorAttempt.errorMessage}`,
        };
      }
    }

    const responseTimeMs = Date.now() - startedAt;
    if (!selectedAttempt.ok || selectedAttempt.rate <= 0) {
      return providerFailure(
        'bcv',
        selectedAttempt.sourceUrl,
        selectedAttempt.responseStatus,
        responseTimeMs,
        selectedAttempt.errorMessage.length === 0
          ? 'Could not parse BCV USD rate.'
          : selectedAttempt.errorMessage,
        {
          snippet: selectedAttempt.textSnippet,
          parser: selectedAttempt.parser,
        },
      );
    }

    return {
      provider: 'bcv',
      ok: true,
      fetchedRate: selectedAttempt.rate,
      appliedRate: selectedAttempt.rate,
      responseStatus: selectedAttempt.responseStatus,
      responseTimeMs,
      sourceUrl: selectedAttempt.sourceUrl,
      payload: {
        parsed_rate: selectedAttempt.rate,
        parser: selectedAttempt.parser,
        fallback_used: selectedAttempt.sourceUrl !== BCV_URL,
      },
      errorMessage: null,
      fallbackUsed: false,
    };
  } catch (error) {
    return providerFailure(
      'bcv',
      BCV_URL,
      null,
      Date.now() - startedAt,
      error instanceof Error ? error.message : 'Unknown BCV error.',
    );
  }
}

type BcvDocumentAttempt = {
  ok: boolean;
  rate: number;
  responseStatus: number | null;
  sourceUrl: string;
  parser: string;
  textSnippet: string;
  errorMessage: string;
};

async function fetchBcvDocument(url: string): Promise<BcvDocumentAttempt> {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'kosmenu-app/1.0 refresh-market-rates',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/markdown;q=0.8,*/*;q=0.7',
      },
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        rate: 0,
        responseStatus: response.status,
        sourceUrl: url,
        parser: 'none',
        textSnippet: text.slice(0, 1500),
        errorMessage: 'BCV request failed.',
      };
    }

    const rate = parseBcvUsdRate(text);
    return {
      ok: rate > 0,
      rate,
      responseStatus: response.status,
      sourceUrl: url,
      parser: 'regex_usd_fecha_valor',
      textSnippet: text.slice(0, 1500),
      errorMessage: rate > 0 ? '' : 'Could not parse BCV USD rate.',
    };
  } catch (error) {
    return {
      ok: false,
      rate: 0,
      responseStatus: null,
      sourceUrl: url,
      parser: 'none',
      textSnippet: '',
      errorMessage: error instanceof Error ? error.message : 'Unknown BCV fetch error.',
    };
  }
}

function parseBcvUsdRate(html: string): number {
  const normalized = html
    .replace(/[*_`#]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const patterns = [
    /USD\s*([0-9.,]+)\s*Fecha\s*Valor/i,
    /USD\s*[^0-9]{0,20}([0-9.,]+)\s*Fecha\s*Valor/i,
    /dollar-04_2\.png\s*USD\s*([0-9.,]+)/i,
    /USD\s*<[^>]*>\s*([0-9.,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const rate = parseLocaleNumber(match?.[1]);
    if (rate > 0) {
      return rate;
    }
  }

  return 0;
}

async function fetchBinanceP2PRate(): Promise<ProviderFetchResult> {
  const startedAt = Date.now();
  const requestBody = {
    page: 1,
    rows: 20,
    payTypes: [],
    asset: 'USDT',
    tradeType: 'SELL',
    fiat: 'VES',
    publisherType: null,
  };

  try {
    const response = await fetch(BINANCE_P2P_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (compatible; kosmenu-app/1.0; +https://kosmenu.app)',
      },
      body: JSON.stringify(requestBody),
    });

    const json = await response.json().catch(() => null);
    const responseTimeMs = Date.now() - startedAt;
    if (!response.ok) {
      return providerFailure(
        'p2p_binance',
        BINANCE_P2P_URL,
        response.status,
        responseTimeMs,
        'Binance P2P request failed.',
        isRecord(json) ? json : undefined,
      );
    }

    const selection = selectBinanceReferenceRate(json);
    if (selection.rate <= 0) {
      return providerFailure(
        'p2p_binance',
        BINANCE_P2P_URL,
        response.status,
        responseTimeMs,
        'Could not derive Binance P2P rate.',
        isRecord(json) ? json : undefined,
      );
    }

    return {
      provider: 'p2p_binance',
      ok: true,
      fetchedRate: selection.rate,
      appliedRate: selection.rate,
      responseStatus: response.status,
      responseTimeMs,
      sourceUrl: BINANCE_P2P_URL,
      payload: selection.payload,
      errorMessage: null,
      fallbackUsed: false,
    };
  } catch (error) {
    return providerFailure(
      'p2p_binance',
      BINANCE_P2P_URL,
      null,
      Date.now() - startedAt,
      error instanceof Error ? error.message : 'Unknown Binance P2P error.',
      requestBody,
    );
  }
}

function defaultGoogleAnchorRates(): GoogleAnchorRates {
  return {
    'USD/COP': 0,
    'USD/EUR': 0,
    'VES/USD': 0,
  };
}

function extractGoogleAnchorRates(payload: unknown): GoogleAnchorRates {
  const rates = defaultGoogleAnchorRates();
  if (!isRecord(payload) || !isRecord(payload.google_rates)) {
    return rates;
  }

  for (const key of Object.keys(rates) as GoogleAnchorKey[]) {
    const value = normalizePositiveNumber(payload.google_rates[key]);
    if (value > 0) {
      rates[key] = value;
    }
  }

  return rates;
}

async function fetchGoogleAnchorRates(
  previousRates: GoogleAnchorRates,
): Promise<GoogleFetchResult> {
  const warnings: string[] = [];
  const payload: Record<string, unknown> = { queries: [] };
  const rates = defaultGoogleAnchorRates();

  const queries: Array<{
    key: GoogleAnchorKey;
    pair: string;
    parser: string;
  }> = [
    {
      key: 'USD/COP',
      pair: 'USD-COP',
      parser: 'google_finance_quote_header',
    },
    {
      key: 'USD/EUR',
      pair: 'USD-EUR',
      parser: 'google_finance_quote_header',
    },
    {
      key: 'VES/USD',
      pair: 'VES-USD',
      parser: 'google_finance_quote_header',
    },
  ];

  for (const item of queries) {
    const result = await fetchGoogleFinanceRate(item.pair);
    (payload.queries as Array<Record<string, unknown>>).push({
      key: item.key,
      pair: item.pair,
      ok: result.ok,
      fetched_rate: result.rate,
      response_status: result.responseStatus,
      source_url: result.sourceUrl,
      parser: item.parser,
      snippet: result.snippet,
      error_message: result.errorMessage,
    });

    if (result.rate > 0) {
      rates[item.key] = result.rate;
      continue;
    }

    if (previousRates[item.key] > 0) {
      rates[item.key] = previousRates[item.key];
      warnings.push(`Google ${item.key} uso fallback previo.`);
      continue;
    }

    warnings.push(`Google ${item.key} no pudo resolverse.`);
  }

  return {
    ok: (Object.keys(rates) as GoogleAnchorKey[]).every((key) => rates[key] > 0),
    rates,
    warnings,
    payload,
  };
}

async function fetchGoogleFinanceRate(
  pair: string,
): Promise<{
  ok: boolean;
  rate: number;
  responseStatus: number | null;
  sourceUrl: string;
  snippet: string;
  errorMessage: string | null;
}> {
  const sourceUrl = `${GOOGLE_FINANCE_MIRROR_URL}${encodeURIComponent(pair)}`;

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'user-agent': 'kosmenu-app/1.0 refresh-market-rates',
        accept: 'text/plain, text/markdown;q=0.9, */*;q=0.8',
      },
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        rate: 0,
        responseStatus: response.status,
        sourceUrl,
        snippet: text.slice(0, 1200),
        errorMessage: 'Google mirrored query failed.',
      };
    }

    const normalized = text.replace(/[*_`#]/g, ' ').replace(/\s+/g, ' ').trim();
    const rate = parseGoogleFinanceQuoteRate(normalized, pair);
    return {
      ok: rate > 0,
      rate,
      responseStatus: response.status,
      sourceUrl,
      snippet: normalized.slice(0, 1200),
      errorMessage: rate > 0 ? null : 'Could not parse Google Finance mirrored quote.',
    };
  } catch (error) {
    return {
      ok: false,
      rate: 0,
      responseStatus: null,
      sourceUrl,
      snippet: '',
      errorMessage: error instanceof Error ? error.message : 'Unknown Google Finance mirrored query error.',
    };
  }
}

function parseGoogleFinanceQuoteRate(text: string, pair: string): number {
  const pairWithSlash = pair.replace('-', '/');
  const pairWithSpaces = pair.replace('-', ' / ');
  const patterns = [
    new RegExp(`(?:^|\\s)${pairWithSlash.replace('/', '\\/')}\\s+([0-9.,]+)\\s*\\(`, 'i'),
    new RegExp(
      `${pairWithSpaces.replace('/', '\\/')}\\s*•\\s*Currency.*?\\b([0-9]+[0-9.,]*)\\b\\s*(?:Apr|Mar|Feb|Jan|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)`,
      'is',
    ),
  ];

  for (const pattern of patterns) {
    const rate = parseLocaleNumber(text.match(pattern)?.[1]);
    if (rate > 0) {
      return rate;
    }
  }

  return 0;
}

function selectBinanceReferenceRate(response: unknown): {
  rate: number;
  payload: Record<string, unknown>;
} {
  const data = isRecord(response) && Array.isArray(response.data) ? response.data : [];
  const offers = data
    .map((entry) => extractBinanceOffer(entry))
    .filter((offer): offer is BinanceOffer => offer != null && offer.price > 0);

  if (offers.length === 0) {
    return { rate: 0, payload: { reason: 'no_offers' } };
  }

  const premiumOffers = offers.filter((offer) =>
    offer.monthFinishRate >= 0.9 &&
    offer.positiveRate >= 0.9 &&
    (offer.monthOrderCount >= 20 || offer.userType === 'merchant' || offer.userIdentity === 'MASS_MERCHANT')
  );

  const sample = (premiumOffers.length >= 3 ? premiumOffers : offers)
    .sort((left, right) => left.price - right.price)
    .slice(0, 7);

  const priceList = sample.map((offer) => offer.price);
  const rate = median(priceList);

  return {
    rate,
    payload: {
      sample_size: sample.length,
      total_offers: offers.length,
      premium_offers: premiumOffers.length,
      selected_prices: priceList,
      selected_offers: sample.map((offer) => ({
        price: offer.price,
        user_type: offer.userType,
        user_identity: offer.userIdentity,
        month_order_count: offer.monthOrderCount,
        month_finish_rate: offer.monthFinishRate,
        positive_rate: offer.positiveRate,
      })),
      strategy: premiumOffers.length >= 3 ? 'median_premium_offers' : 'median_top_offers',
    },
  };
}

type BinanceOffer = {
  price: number;
  userType: string;
  userIdentity: string;
  monthOrderCount: number;
  monthFinishRate: number;
  positiveRate: number;
};

function extractBinanceOffer(entry: unknown): BinanceOffer | null {
  if (!isRecord(entry)) {
    return null;
  }

  const adv = isRecord(entry.adv) ? entry.adv : null;
  const advertiser = isRecord(entry.advertiser) ? entry.advertiser : null;
  if (!adv || !advertiser) {
    return null;
  }

  return {
    price: normalizePositiveNumber(adv.price),
    userType: normalizeString(advertiser.userType),
    userIdentity: normalizeString(advertiser.userIdentity),
    monthOrderCount: normalizePositiveNumber(advertiser.monthOrderCount),
    monthFinishRate: normalizePositiveNumber(advertiser.monthFinishRate),
    positiveRate: normalizePositiveNumber(advertiser.positiveRate),
  };
}

function resolveAppliedRate(params: {
  result: ProviderFetchResult;
  previousRate: number | null;
  maxDeltaPercent: number;
}): ProviderFetchResult {
  const next = { ...params.result };
  const fetchedRate = next.fetchedRate;

  if (next.ok && fetchedRate != null && fetchedRate > 0) {
    if (params.previousRate != null && params.previousRate > 0) {
      const deltaPercent = relativeDeltaPercent(params.previousRate, fetchedRate);
      if (deltaPercent > params.maxDeltaPercent) {
        next.ok = false;
        next.errorMessage =
          `Rejected outlier for ${next.provider}: delta ${deltaPercent.toFixed(2)}% exceeds ${params.maxDeltaPercent.toFixed(2)}%.`;
      }
    }
  }

  if (!next.ok || fetchedRate == null || fetchedRate <= 0) {
    if (params.previousRate != null && params.previousRate > 0) {
      next.appliedRate = params.previousRate;
      next.fallbackUsed = true;
      next.payload = {
        ...next.payload,
        fallback_previous_rate: params.previousRate,
      };
      return next;
    }

    next.appliedRate = null;
    next.fallbackUsed = false;
    return next;
  }

  next.appliedRate = fetchedRate;
  next.fallbackUsed = false;
  return next;
}

function buildWarnings(params: {
  bcvRate: number;
  p2pRate: number;
  maxSpreadPercent: number;
  freshProviderCount: number;
}): string[] {
  const warnings: string[] = [];

  if (params.freshProviderCount < 2) {
    warnings.push('Una o mas tasas se resolvieron usando fallback de la ultima referencia valida.');
  }

  const spreadPercent = relativeDeltaPercent(params.bcvRate, params.p2pRate);
  if (spreadPercent > params.maxSpreadPercent) {
    warnings.push(
      'La brecha entre BCV y Binance P2P supera el umbral configurado, pero la corrida se mantuvo por tratarse de fuentes distintas.',
    );
  }

  return warnings;
}

async function insertFetchLogs(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  results: ProviderFetchResult[],
): Promise<void> {
  const rows = results.map((result) => ({
    run_id: runId,
    provider: result.provider,
    ok: result.ok,
    fetched_rate: result.fetchedRate,
    applied_rate: result.appliedRate,
    response_status: result.responseStatus,
    response_time_ms: result.responseTimeMs,
    source_url: result.sourceUrl,
    payload: result.payload,
    error_message: result.errorMessage,
  }));

  const { error } = await supabase.from('market_rate_fetch_logs').insert(rows);
  if (error) {
    throw new Error(`Error inserting market_rate_fetch_logs: ${error.message}`);
  }
}

function providerFailure(
  provider: ProviderName,
  sourceUrl: string,
  responseStatus: number | null,
  responseTimeMs: number,
  errorMessage: string,
  payload: Record<string, unknown> | undefined = undefined,
): ProviderFetchResult {
  return {
    provider,
    ok: false,
    fetchedRate: null,
    appliedRate: null,
    responseStatus,
    responseTimeMs,
    sourceUrl,
    payload: payload ?? {},
    errorMessage,
    fallbackUsed: false,
  };
}

function parseRate(value: unknown): number | null {
  const rate = normalizePositiveNumber(value);
  return rate > 0 ? rate : null;
}

function parseLocaleNumber(value: unknown): number {
  const raw = normalizeString(value);
  if (!raw) {
    return 0;
  }

  const normalizedSource = raw.replace(/[^0-9.,-]/g, '');
  if (!normalizedSource) {
    return 0;
  }

  const lastDot = normalizedSource.lastIndexOf('.');
  const lastComma = normalizedSource.lastIndexOf(',');
  let normalized = normalizedSource;

  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastDot > lastComma
        ? normalizedSource.replace(/,/g, '')
        : normalizedSource.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    const digitsAfter = normalizedSource.length - lastComma - 1;
    normalized = digitsAfter == 3
        ? normalizedSource.replace(/,/g, '')
        : normalizedSource.replace(',', '.');
  } else if (lastDot >= 0) {
    const digitsAfter = normalizedSource.length - lastDot - 1;
    normalized = digitsAfter == 3 && normalizedSource.indexOf('.') != lastDot
        ? normalizedSource.replace(/\./g, '')
        : normalizedSource;
  } else {
    normalized = normalizedSource;
  }

  return normalizePositiveNumber(normalized);
}

function normalizePositiveNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Number(value.toFixed(4)) : 0;
  }

  const raw = normalizeString(value);
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Number(parsed.toFixed(4));
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return Number(sorted[middle].toFixed(4));
  }

  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(4));
}

function relativeDeltaPercent(baseValue: number, nextValue: number): number {
  if (baseValue <= 0 || nextValue <= 0) {
    return 0;
  }
  return Math.abs(nextValue - baseValue) / baseValue * 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value == 'object' && !Array.isArray(value);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}