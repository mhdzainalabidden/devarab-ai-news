import { describe, it, expect } from 'vitest';
import {
  classifyCategoryHeuristic,
  classifyImpactHeuristic,
  extractTagsHeuristic,
  classifyHeuristic,
  isVersionTagTitle,
  isContentlessBody,
  isContentlessVersionTag,
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

describe('isVersionTagTitle', () => {
  it('flags bare version / build / date tags', () => {
    for (const t of [
      'v0.111.0', 'b9724', '0.142.0-alpha.4', 'v1.8.0-pre', 'v2.9.0-rc.0',
      '2025-11-25-RC', '2025-06-18', 'OpenAI_2.11.0', '@ai-sdk/vue@4.0.0-beta.182',
      '@modelcontextprotocol/fastify@2.0.0-alpha.2',
    ]) {
      expect(isVersionTagTitle(t), t).toBe(true);
    }
  });
  it('flags slug/noise-prefixed versions', () => {
    for (const t of ['sdk: v0.105.0', 'aws-sdk: v0.5.0', 'bedrock-sdk: v0.31.0', 'Release 2026.1.26', 'CLI v3.0.26', 'Release v0.48.0-preview.0']) {
      expect(isVersionTagTitle(t), t).toBe(true);
    }
  });
  it('keeps real narrative headlines', () => {
    for (const t of [
      'Anthropic Python SDK v0.107.1 Fixes API Key Auth',
      'Ollama v0.30.10 Update: Cohere2MoE Support & llama.cpp Upgrade',
      'Introducing Forge',
      'Mothers who build',
      'GLM-5.2: Built for Long-Horizon Tasks',
    ]) {
      expect(isVersionTagTitle(t), t).toBe(false);
    }
  });
});

describe('isContentlessBody', () => {
  it('treats empty / tag-only / link-only bodies as contentless', () => {
    expect(isContentlessBody('')).toBe(true);
    expect(isContentlessBody('v0.111.0')).toBe(true);
    expect(isContentlessBody('Full Changelog: https://github.com/x/y/compare/v1...v2')).toBe(true);
  });
  it('keeps bodies with real release notes', () => {
    expect(isContentlessBody('Adds Amazon Bedrock support for the Responses API and fixes streaming.')).toBe(false);
  });
});

describe('isContentlessVersionTag', () => {
  it('drops a bare tag with an empty body', () => {
    expect(isContentlessVersionTag('b9724', 'b9724')).toBe(true);
    expect(isContentlessVersionTag('aws-sdk: v0.5.0', '')).toBe(true);
  });
  it('keeps a version tag that ships real notes (LLM can publish it)', () => {
    expect(
      isContentlessVersionTag('v2.40.0', 'Adds Amazon Bedrock support and new streaming options for the API.'),
    ).toBe(false);
  });
  it('keeps a real headline regardless of body', () => {
    expect(isContentlessVersionTag('Introducing Mistral Small 4', '')).toBe(false);
  });
});
