import * as cheerio from 'cheerio';

/** Strip HTML tags + collapse whitespace into clean plain text. */
export function htmlToText(html: string): string {
  if (!html) return '';
  // If it doesn't look like HTML, just normalize whitespace.
  if (!/[<&]/.test(html)) return collapseWhitespace(html);
  const $ = cheerio.load(html);
  $('script, style, noscript, template, svg').remove();
  // Insert line breaks for block elements so text doesn't run together.
  $('p, br, div, li, h1, h2, h3, h4, h5, h6, tr').each((_, el) => {
    $(el).append('\n');
  });
  const text = $.root().text();
  return collapseWhitespace(text);
}

export function collapseWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Collapse all whitespace (including newlines) to single spaces — for titles. */
export function normalizeTitle(title: string): string {
  return collapseWhitespace(title).replace(/\s*\n\s*/g, ' ').trim();
}

/** Truncate to a max length on a word boundary, appending an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

/** Heuristic language detection limited to ar vs en (Arabic script presence). */
export function detectLanguage(text: string): 'ar' | 'en' {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin ? 'ar' : 'en';
}

/** Parse a loosely-formatted date string. Returns null if not parseable. */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
