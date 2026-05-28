import { createHash } from 'node:crypto';
import { canonicalizeUrl } from './url';
import { collapseWhitespace } from './clean';

/**
 * Stable content hash from canonical URL + title + cleaned body.
 * Used as the dedup key (also enforced by a UNIQUE constraint in the DB).
 * The body is whitespace-normalized and lowercased so trivial formatting
 * changes do not produce a "new" item, while real edits do.
 */
export function contentHash(url: string, title: string, body: string): string {
  const canonicalUrl = canonicalizeUrl(url);
  const normTitle = collapseWhitespace(title).toLowerCase();
  const normBody = collapseWhitespace(body).toLowerCase();
  const basis = `${canonicalUrl}\n${normTitle}\n${normBody}`;
  return createHash('sha256').update(basis, 'utf8').digest('hex');
}
