import { fileURLToPath } from 'node:url';
import { query, closePool } from '../db/pool';

/**
 * Select sources from the catalog and turn them on.
 *
 *   npm run sources:activate -- "huggingface"          # DRY RUN: list matches
 *   npm run sources:activate -- "huggingface" --yes    # activate the matches
 *   npm run sources:activate -- "github.com/openai" --yes
 *   npm run sources:activate -- "vllm" "ollama" --yes  # multiple terms (OR)
 *
 * Matching is case-insensitive substring over company, product, and source_url.
 * Dry run by default so you always see exactly what you're about to enable.
 */

interface Row {
  id: number;
  company: string;
  product: string | null;
  source_url: string;
  source_type: string;
  active: boolean;
}

function buildWhere(terms: string[]): { clause: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  for (const t of terms) {
    const i = params.push(`%${t.toLowerCase()}%`);
    parts.push(
      `(lower(company) LIKE $${i} OR lower(coalesce(product,'')) LIKE $${i} OR lower(source_url) LIKE $${i})`,
    );
  }
  return { clause: parts.join(' OR '), params };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--yes');
  const terms = args.filter((a) => !a.startsWith('--'));

  if (terms.length === 0) {
    console.log('Usage: npm run sources:activate -- "<term>" [more terms] [--yes]');
    console.log('  (dry run lists matches; add --yes to activate the inactive ones)');
    return;
  }

  const { clause, params } = buildWhere(terms);
  const { rows } = await query<Row>(
    `SELECT id, company, product, source_url, source_type, active
       FROM sources
      WHERE ${clause}
      ORDER BY active ASC, company ASC, product ASC NULLS FIRST`,
    params,
  );

  if (rows.length === 0) {
    console.log(`No sources match: ${terms.map((t) => `"${t}"`).join(', ')}`);
    return;
  }

  const inactive = rows.filter((r) => !r.active);
  console.log(`\nMatches for ${terms.map((t) => `"${t}"`).join(', ')} (${rows.length}):\n`);
  for (const r of rows) {
    const flag = r.active ? '[ON ]' : '[off]';
    const prod = r.product ? ` · ${r.product}` : '';
    console.log(`  ${flag} #${r.id} ${r.company}${prod}  (${r.source_type})`);
    console.log(`        ${r.source_url}`);
  }

  if (!apply) {
    console.log(
      `\nDry run. ${inactive.length} inactive source(s) would be activated. ` +
        `Re-run with --yes to apply.`,
    );
    return;
  }

  if (inactive.length === 0) {
    console.log('\nNothing to do — all matches are already active.');
    return;
  }

  const ids = inactive.map((r) => r.id);
  const { rowCount } = await query(
    `UPDATE sources SET active = TRUE, updated_at = now() WHERE id = ANY($1::int[])`,
    [ids],
  );
  console.log(`\nActivated ${rowCount} source(s): #${ids.join(', #')}`);
  if (inactive.length >= 15) {
    console.log(
      'Heads up: that is a lot of new sources. They draw on the Gemini free-tier ' +
        'quota (capped/paced per run) and GitHub API rate limits — set GITHUB_TOKEN ' +
        'if you activate many GitHub repos.',
    );
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main()
    .catch((err) => {
      console.error('sources:activate failed:', (err as Error).message);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
