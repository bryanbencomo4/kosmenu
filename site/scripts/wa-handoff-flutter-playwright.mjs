/**
 * Playwright against REAL Flutter web build (/asistente), not Next /asistente-negocio.
 *
 *   FLUTTER_E2E_BASE_URL=http://127.0.0.1:8080 \
 *   NEXT_E2E_BASE_URL=https://….vercel.app \
 *   node site/scripts/wa-handoff-flutter-playwright.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const shotDir = join(root, 'docs', 'wa-handoff-flutter-screenshots');
mkdirSync(shotDir, { recursive: true });

const FLUTTER = (process.env.FLUTTER_E2E_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const NEXT = (process.env.NEXT_E2E_BASE_URL || '').replace(/\/$/, '');

const report = {
  ok: false,
  flutterBase: FLUTTER,
  nextBase: NEXT || null,
  steps: [],
  errors: [],
  screenshots: [],
};

function step(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  if (!ok) report.errors.push(name);
}

async function shot(page, name) {
  const path = join(shotDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => null);
  report.screenshots.push(path);
  return path;
}

function mint(destination, extra = []) {
  if (process.env.CONFIRM_WA_HANDOFF_PREVIEW !== '1') return null;
  const r = spawnSync(
    'node',
    [
      join(__dirname, 'wa-handoff-preview-mint.mjs'),
      `--destination=${destination}`,
      `--flutterBase=${FLUTTER}/asistente`,
      ...extra,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, CONFIRM_WA_HANDOFF_PREVIEW: '1' },
    },
  );
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

async function waitFlutterShell(page) {
  await page
    .waitForSelector('flt-glass-pane, flutter-view, canvas', { timeout: 60_000 })
    .catch(() => null);
  await page.waitForTimeout(2500);
}

async function runViewport(browser, label, viewport, isMobile) {
  const ctxOpts = {
    viewport,
    isMobile,
    hasTouch: isMobile,
    userAgent: isMobile ? devices['iPhone 13'].userAgent : undefined,
  };

  // Cold open with minted handoff FIRST (real WhatsApp → Flutter path).
  const minted = mint('business_assistant', [
    '--hint=cambiar precio Margarita',
    '--op=edit_price',
  ]);
  if (minted?.code) {
    const cold = await browser.newContext(ctxOpts);
    const page = await cold.newPage();
    try {
      const bootWait = page.waitForResponse(
        (res) =>
          res.url().includes('/api/asistente-negocio') &&
          res.request().method() === 'POST' &&
          (res.request().postData() || '').includes(minted.code),
        { timeout: 60_000 },
      );
      await page.goto(`${FLUTTER}/asistente?h=${encodeURIComponent(minted.code)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
      const bootRes = await bootWait;
      const bootJson = await bootRes.json();
      await waitFlutterShell(page);
      const text = String(bootJson?.text || '');
      step(
        `${label}:minted_business_context`,
        bootJson?.handoffValid === true && /Margarita|precio|sesión|inicia/i.test(text),
        { handoffValid: bootJson?.handoffValid, text: text.slice(0, 200) },
      );
      await shot(page, `${label}-minted-business`);
    } catch (e) {
      step(`${label}:minted_business`, false, {
        error: String(e && e.message ? e.message : e),
      });
    }
    await cold.close();
  } else {
    step(`${label}:minted_business_skipped`, true, { reason: 'mint unavailable' });
  }

  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();

  try {
    const res = await page.goto(`${FLUTTER}/asistente`, {
      waitUntil: 'networkidle',
      timeout: 90_000,
    });
    step(`${label}:flutter_status`, (res?.status() ?? 0) < 400, { status: res?.status() });
    await waitFlutterShell(page);
    const hasCanvas = (await page.locator('flt-glass-pane, flutter-view, canvas').count()) > 0;
    const shotPath = await shot(page, `${label}-asistente`);
    const fs = await import('node:fs');
    const bytes = fs.existsSync(shotPath) ? fs.statSync(shotPath).size : 0;
    step(`${label}:business_assistant_screen`, hasCanvas && bytes > 8_000, {
      hasCanvas,
      screenshotBytes: bytes,
    });
  } catch (e) {
    step(`${label}:flutter_nav`, false, { error: String(e && e.message ? e.message : e) });
  }

  try {
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await waitFlutterShell(page);
    const url = page.url();
    const hasCanvas = (await page.locator('flt-glass-pane, flutter-view, canvas').count()) > 0;
    step(`${label}:reload_keeps_asistente`, /asistente/i.test(url) && hasCanvas, { url });
  } catch (e) {
    step(`${label}:reload`, false, { error: String(e) });
  }

  // Invalid code — cold context so boot includes #h=
  {
    const bad = await browser.newContext(ctxOpts);
    const p2 = await bad.newPage();
    try {
      let bootJson = null;
      const bootWait = p2.waitForResponse(
        (res) =>
          res.url().includes('/api/asistente-negocio') && res.request().method() === 'POST',
        { timeout: 45_000 },
      );
      await p2.goto(`${FLUTTER}/asistente?h=not-a-real-code`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      const bootRes = await bootWait;
      bootJson = await bootRes.json();
      const claimsPrepared = /solicitud ya está preparada/i.test(String(bootJson?.text || ''));
      step(`${label}:invalid_handoff_no_false_prepared`, !claimsPrepared, {
        handoffValid: bootJson?.handoffValid,
        handoffError: bootJson?.handoffError,
        text: String(bootJson?.text || '').slice(0, 160),
      });
    } catch (e) {
      step(`${label}:invalid_handoff`, false, { error: String(e) });
    }
    await bad.close();
  }

  if (NEXT) {
    try {
      const status = await page.evaluate(async (api) => {
        const r = await fetch(api, {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://app.elmenuxfa.com',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
          },
        });
        return r.status;
      }, `${NEXT}/api/asistente-negocio`);
      step(`${label}:cors_preflight`, status === 204 || status === 200, { status });
    } catch (e) {
      step(`${label}:cors_preflight`, false, { error: String(e) });
    }
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 'mobile', { width: 390, height: 844 }, true);
    await runViewport(browser, 'desktop', { width: 1280, height: 800 }, false);
    report.ok = report.errors.length === 0;
  } finally {
    await browser.close();
  }
  const out = join(shotDir, 'wa-handoff-flutter-report.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
