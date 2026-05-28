import { describe, it, expect } from 'vitest';
import { parseRobots, isPathAllowed } from '../src/ingestion/robots';

const UA = 'DevArabAINewsBot/0.1';

describe('parseRobots + isPathAllowed', () => {
  it('allows everything when robots is empty', () => {
    const r = parseRobots('');
    expect(isPathAllowed(r, '/anything', UA)).toBe(true);
  });

  it('disallows a path for the wildcard agent', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private');
    expect(isPathAllowed(r, '/private/x', UA)).toBe(false);
    expect(isPathAllowed(r, '/public/x', UA)).toBe(true);
  });

  it('honours an empty Disallow as allow-all', () => {
    const r = parseRobots('User-agent: *\nDisallow:');
    expect(isPathAllowed(r, '/anything', UA)).toBe(true);
  });

  it('uses longest-match precedence between Allow and Disallow', () => {
    const r = parseRobots('User-agent: *\nDisallow: /docs\nAllow: /docs/public');
    expect(isPathAllowed(r, '/docs/secret', UA)).toBe(false);
    expect(isPathAllowed(r, '/docs/public/page', UA)).toBe(true);
  });

  it('prefers a specific user-agent group over the wildcard', () => {
    const content = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: devarabainewsbot',
      'Allow: /',
    ].join('\n');
    const r = parseRobots(content);
    expect(isPathAllowed(r, '/news', UA)).toBe(true);
  });

  it('supports * wildcard and $ end-anchor patterns', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$');
    expect(isPathAllowed(r, '/files/report.pdf', UA)).toBe(false);
    expect(isPathAllowed(r, '/files/report.pdf?x=1', UA)).toBe(true);
  });

  it('ignores comments', () => {
    const r = parseRobots('# comment\nUser-agent: * # inline\nDisallow: /x # nope');
    expect(isPathAllowed(r, '/x/y', UA)).toBe(false);
  });
});
