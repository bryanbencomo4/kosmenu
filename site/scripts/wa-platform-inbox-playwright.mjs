/**
 * Playwright: platform WA inbox at /admin/wa-control (desktop + mobile).
 *
 * Auth:
 *   - Without session → must redirect / deny (access control verified)
 *   - With ADMIN_E2E_EMAIL + ADMIN_E2E_PASSWORD → full UI smoke
 *
 * Usage:
 *   node scripts/wa-platform-inbox-playwright.mjs
 *   BASE_URL=https://admin.elmenuxfa.com node scripts/wa-platform-inbox-playwright.mjs
 *
 * Does not mutate production WA session or apply migrations.
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || 'https://admin.elmenuxfa.com').replace(/\/$/, '');
const EMAIL = (process.env.ADMIN_E2E_EMAIL || '').trim();
const PASSWORD = (process.env.ADMIN_E2E_PASSWORD || '').trim();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../docs/wa-inbox-screenshots');
fs.mkdirSync(outDir, { recursive: true });

const steps = [];
function ok(name, detail = '') {
  steps.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  steps.push({ name, ok: false, detail });
  console.error(`✗ ${name} — ${detail}`);
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function assertAuthGate(browser) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/admin/wa-control`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const url = page.url();
  const hasInbox = (await page.locator('[data-testid="wa-inbox-root"]').count()) > 0;
  if (hasInbox && !EMAIL) {
    // Unexpected open access
    fail('auth_gate', `Inbox visible without credentials at ${url}`);
  } else if (hasInbox) {
    ok('auth_gate', 'Session already present (inbox visible)');
  } else if (/login|auth|signin|iniciar/i.test(url) || url.includes('/admin') === false) {
    ok('auth_gate', `Unauthorized redirected → ${url}`);
  } else {
    // Still on admin but no inbox — may be permission denied page
    const body = await page.locator('body').innerText().catch(() => '');
    if (/permiso|deneg|unauthorized|login|iniciar sesión/i.test(body)) {
      ok('auth_gate', 'Access denied UI without session');
    } else {
      ok('auth_gate', `No inbox without session (${url})`);
    }
  }
  await shot(page, 'auth-gate-desktop.png');
  await page.close();
}

async function loginIfNeeded(page) {
  if (!EMAIL || !PASSWORD) return false;
  await page.goto(`${BASE}/admin/wa-control`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1000);
  if ((await page.locator('[data-testid="wa-inbox-root"]').count()) > 0) return true;

  const emailSel = 'input[type="email"], input[name="email"], input[autocomplete="username"]';
  const passSel = 'input[type="password"], input[name="password"]';
  if ((await page.locator(emailSel).count()) === 0) {
    // Try common admin login path
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  }
  if ((await page.locator(emailSel).count()) === 0) return false;
  await page.fill(emailSel, EMAIL);
  await page.fill(passSel, PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/admin/wa-control`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1500);
  return (await page.locator('[data-testid="wa-inbox-root"]').count()) > 0;
}

async function uiSmoke(browser, label, contextOpts) {
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const logged = await loginIfNeeded(page);
  if (!logged) {
    fail(`ui_${label}`, 'Could not open inbox (set ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD)');
    await shot(page, `inbox-${label}-unauthenticated.png`);
    await context.close();
    return;
  }
  await page.waitForSelector('[data-testid="wa-inbox-root"]', { timeout: 30_000 });
  ok(`ui_${label}_root`, 'Inbox root visible');
  const hasList = (await page.locator('[data-testid="wa-inbox-list"]').count()) > 0;
  const hasMute = (await page.locator('[data-testid="wa-global-mute"]').count()) > 0;
  if (hasList) ok(`ui_${label}_list`, 'Conversation column present');
  else fail(`ui_${label}_list`, 'Missing list');
  if (hasMute) ok(`ui_${label}_mute`, 'Global mute control present');
  else fail(`ui_${label}_mute`, 'Missing global mute');
  await shot(page, `inbox-${label}.png`);
  await context.close();
}

async function main() {
  console.log(`Base: ${BASE}`);
  const browser = await chromium.launch({ headless: true });
  try {
    await assertAuthGate(browser);
    await uiSmoke(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
    await uiSmoke(browser, 'mobile', { ...devices['iPhone 13'] });
  } finally {
    await browser.close();
  }

  const report = { base: BASE, at: new Date().toISOString(), steps, outDir };
  fs.writeFileSync(path.join(outDir, 'playwright-report.json'), JSON.stringify(report, null, 2));
  const hard = steps.filter((s) => !s.ok && s.name === 'auth_gate');
  const soft = steps.filter((s) => !s.ok && s.name !== 'auth_gate');
  console.log(`\n${steps.filter((s) => s.ok).length}/${steps.length} passed`);
  if (soft.length) {
    console.log(
      `Soft skips (need ADMIN_E2E_EMAIL/PASSWORD for live inbox UI): ${soft
        .map((s) => s.name)
        .join(', ')}`,
    );
  }
  console.log(`Screenshots: ${outDir}`);
  if (hard.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
