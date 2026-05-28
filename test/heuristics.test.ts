import { describe, it, expect } from 'vitest';
import {
  classifyCategoryHeuristic,
  classifyImpactHeuristic,
  extractTagsHeuristic,
  classifyHeuristic,
} from '../src/llm/heuristics';

describe('classifyCategoryHeuristic', () => {
  it('detects security', () => {
    expect(classifyCategoryHeuristic('Critical security vulnerability (CVE) patched')).toBe('security');
  });
  it('detects pricing', () => {
    expect(classifyCategoryHeuristic('New lower pricing per token for the API')).toBe('pricing');
  });
  it('detects deprecation', () => {
    expect(classifyCategoryHeuristic('We are deprecating the old endpoint')).toBe('deprecation');
  });
  it('detects model', () => {
    expect(classifyCategoryHeuristic('Introducing our new frontier model GPT-5')).toBe('model');
  });
  it('detects sdk', () => {
    expect(classifyCategoryHeuristic('Released SDK version 2.0 with new client library')).toBe('sdk');
  });
  it('falls back to product', () => {
    expect(classifyCategoryHeuristic('Something entirely unrelated happened today')).toBe('product');
  });
});

describe('classifyImpactHeuristic', () => {
  it('rates security zero-days as critical', () => {
    expect(classifyImpactHeuristic('actively exploited zero-day in the platform')).toBe('critical');
  });
  it('rates deprecations / GA launches as high', () => {
    expect(classifyImpactHeuristic('General availability launch of the new model')).toBe('high');
    expect(classifyImpactHeuristic('We are deprecating v1')).toBe('high');
  });
  it('rates feature updates as medium', () => {
    expect(classifyImpactHeuristic('New feature: improved support for streaming')).toBe('medium');
  });
  it('defaults to low', () => {
    expect(classifyImpactHeuristic('A short note about our office')).toBe('low');
  });
});

describe('extractTagsHeuristic', () => {
  it('extracts known product tags', () => {
    const tags = extractTagsHeuristic('Claude and GPT-5 now support the new API and SDK');
    expect(tags).toContain('claude');
    expect(tags).toContain('api');
    expect(tags.length).toBeLessThanOrEqual(6);
  });
  it('never returns stopwords-only noise', () => {
    const tags = extractTagsHeuristic('the and or to of in on for with');
    expect(tags.every((t) => !['the', 'and', 'or', 'to', 'of'].includes(t))).toBe(true);
  });
});

describe('classifyHeuristic', () => {
  it('returns category, impact and tags together', () => {
    const out = classifyHeuristic('Deprecating GPT-4 API', 'The old model will be retired soon.');
    expect(out.category).toBe('deprecation');
    expect(out.impact).toBe('high');
    expect(Array.isArray(out.tags)).toBe(true);
  });
});
