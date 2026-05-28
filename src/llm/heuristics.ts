import { type Category, type ImpactLevel } from '../types';

// Keyword-driven classification used as the fallback when the LLM is disabled
// or fails. Order matters: earlier categories win ties. These never set
// `verified` — verification is purely domain-based.

// NOTE: patterns use a leading word boundary + stems (no trailing \b), because a
// trailing \b cannot fall between two word characters (e.g. /deprecat\b/ would
// never match "deprecating"). Short/ambiguous tokens carry their own \b…\b.
const CATEGORY_KEYWORDS: { category: Category; words: RegExp }[] = [
  { category: 'deprecation', words: /\b(?:deprecat|sunset|retir|end[- ]of[- ]life|\beol\b|shut(?:ting)? ?down|discontinu|\bremoved?\b)/i },
  { category: 'security', words: /\b(?:security|vulnerab|\bcve\b|exploit|breach|patch(?:ed|es)?|advisory|malicious|attack)/i },
  { category: 'pricing', words: /\b(?:pricing|\bpric(?:e|es|ed|ey)\b|\bcosts?\b|billing|free tier|discount|cheaper|per[- ]token)/i },
  { category: 'model', words: /\b(?:model|gpt[- ]?\d|claude|gemini|llama|mistral|frontier|flagship|opus|sonnet|haiku|reasoning model|multimodal)/i },
  { category: 'sdk', words: /\b(?:sdk|library|package|npm|\bpip\b|client library|version \d|release notes|changelog)/i },
  { category: 'api', words: /\b(?:api|endpoint|rate ?limit|param(?:eter)?s?|tokens?\/min|webhook)/i },
  { category: 'coding', words: /\b(?:copilot|cursor|code completion|autocomplete|\bide\b|coding agent|pull request|developer tool)/i },
  { category: 'research', words: /\b(?:research|paper|benchmark|eval(?:uation|s)?|study|findings|state[- ]of[- ]the[- ]art|arxiv)/i },
  { category: 'deprecation', words: /\bbreaking change/i },
  { category: 'product', words: /\b(?:launch|now available|general availability|\bga\b|introducing|announc|rollout|releas)/i },
  { category: 'company', words: /\b(?:funding|raise[ds]?|series [a-e]|partnership|acqui|hiring|appoint|valuation)/i },
  { category: 'tool', words: /\b(?:tool|feature|integration|plugin|extension|\bapps?\b|capabilit)/i },
];

const IMPACT_RULES: { impact: ImpactLevel; words: RegExp }[] = [
  { impact: 'critical', words: /\b(?:critical|zero[- ]day|actively exploited|severe|emergency|data breach|outage)/i },
  { impact: 'high', words: /\b(?:deprecat|breaking change|flagship|frontier|general availability|\bga\b|\bmajor\b|new model|price (?:increase|change|drop)|sunset|retir)/i },
  { impact: 'medium', words: /\b(?:new feature|update|improv|expand|support for|now available|sdk|api)/i },
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are',
  'now', 'new', 'our', 'we', 'you', 'your', 'this', 'that', 'from', 'by', 'at', 'as',
  'it', 'its', 'has', 'have', 'will', 'can', 'all', 'more', 'how', 'what', 'why',
]);

const KNOWN_TAGS = [
  'gpt-4', 'gpt-5', 'gpt', 'o1', 'o3', 'claude', 'opus', 'sonnet', 'haiku', 'gemini',
  'llama', 'mistral', 'deepseek', 'grok', 'copilot', 'cursor', 'replit', 'api', 'sdk',
  'pricing', 'security', 'model', 'agent', 'agents', 'mcp', 'embeddings', 'vision',
  'reasoning', 'fine-tuning', 'finetuning', 'rag', 'function-calling', 'tool-use',
  'multimodal', 'voice', 'audio', 'image', 'video', 'deprecation', 'beta', 'ga',
];

export function classifyCategoryHeuristic(text: string): Category {
  for (const { category, words } of CATEGORY_KEYWORDS) {
    if (words.test(text)) return category;
  }
  return 'product';
}

export function classifyImpactHeuristic(text: string): ImpactLevel {
  for (const { impact, words } of IMPACT_RULES) {
    if (words.test(text)) return impact;
  }
  return 'low';
}

export function extractTagsHeuristic(text: string, max = 6): string[] {
  const lower = text.toLowerCase();
  const tags = new Set<string>();

  for (const tag of KNOWN_TAGS) {
    if (lower.includes(tag)) tags.add(tag);
    if (tags.size >= max) break;
  }

  if (tags.size < max) {
    const freq = new Map<string, number>();
    for (const raw of lower.match(/[a-z][a-z0-9+.-]{2,}/g) ?? []) {
      if (STOPWORDS.has(raw)) continue;
      freq.set(raw, (freq.get(raw) ?? 0) + 1);
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
    for (const w of top) {
      if (tags.size >= max) break;
      tags.add(w);
    }
  }
  return [...tags].slice(0, max);
}

export function classifyHeuristic(title: string, body: string): {
  category: Category;
  impact: ImpactLevel;
  tags: string[];
} {
  const text = `${title}\n${body}`;
  return {
    category: classifyCategoryHeuristic(text),
    impact: classifyImpactHeuristic(text),
    tags: extractTagsHeuristic(text),
  };
}
