import type { RawEntry, Source } from '../../types';
import { config } from '../../config';
import { parseHtmlListing } from './html.fetcher';

// Minimal structural types for the bits of Playwright we use, so this file
// type-checks whether or not the optional `playwright` package is installed.
interface PwPage {
  goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
  waitForSelector(selector: string, opts: { timeout: number }): Promise<unknown>;
  content(): Promise<string>;
}
interface PwBrowser {
  newPage(opts: { userAgent: string }): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwModule {
  chromium: { launch(opts: { headless: boolean }): Promise<PwBrowser> };
}

/**
 * Render a JS-heavy official page with Playwright, then reuse the HTML parser.
 * Playwright is an OPTIONAL dependency — it is dynamically imported so the
 * service runs fine without it. Install with:
 *   npm i -D playwright && npx playwright install chromium
 */
export async function fetchPlaywright(source: Source, limit: number): Promise<RawEntry[]> {
  const cfg = source.extra?.html;
  if (!cfg) {
    throw new Error(`source ${source.id} is type 'playwright' but has no extra.html config`);
  }

  // Non-literal specifier so the type checker doesn't require the package.
  const moduleName = 'playwright';
  let pw: PwModule;
  try {
    pw = (await import(moduleName)) as unknown as PwModule;
  } catch {
    throw new Error(
      'Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`, ' +
        'or change this source to source_type "html".',
    );
  }

  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: config.http.userAgent });
    await page.goto(source.source_url, { waitUntil: 'networkidle', timeout: config.http.timeoutMs });
    if (cfg.itemSelector) {
      await page.waitForSelector(cfg.itemSelector, { timeout: config.http.timeoutMs }).catch(() => {});
    }
    const html = await page.content();
    const entries = parseHtmlListing(html, cfg, source.source_url);
    return entries.slice(0, limit);
  } finally {
    await browser.close();
  }
}
