import type { UpsertSourceInput } from '../../repositories/sources.repo';
import type { HtmlFetchConfig } from '../../types';

/**
 * EXTENDED CATALOG of official / primary AI sources — a *menu to select from*.
 *
 * Everything here is seeded `active: false`. Nothing in this file is crawled
 * until you turn it on, so it adds ZERO load/quota until you opt in:
 *
 *   npm run seed:catalog                      # load the whole menu (inactive)
 *   npm run sources:activate -- "huggingface" # preview what matches (dry run)
 *   npm run sources:activate -- "huggingface" --yes   # actually activate them
 *
 * Design rules honored here:
 *  - Official / primary sources ONLY (vendor-owned blogs, changelogs, and the
 *    vendor's own GitHub orgs). No third-party news/aggregators/rumor mills.
 *  - No fabricated URLs. GitHub `/releases` feeds are used heavily because the
 *    org/repo slugs are stable and the releases API is reliable; blog/RSS URLs
 *    are included only where the path is known-good. HTML blogs use best-effort
 *    GENERIC selectors, so messy parses land as `needs_review`, never published
 *    blindly (same policy as the base seed).
 *  - GitHub release items verify against `github.com` (the vendor publishes them
 *    from their own org) — identical treatment to the base seed's repo sources.
 *
 * Tuning after activation: adjust `priority` / `crawl_interval_minutes` per row,
 * or via POST /api/admin/sources. Lower intervals = faster detection; the LLM
 * only runs on genuinely new (deduped) items, so it's quota-safe.
 */

const GENERIC: HtmlFetchConfig = {
  itemSelector: 'article, li.post, .changelog-entry, main a[href]',
  titleSelector: 'h1, h2, h3',
  linkSelector: 'a',
  dateSelector: 'time',
  contentSelector: 'p',
};

interface Opt {
  product?: string;
  priority?: number;
  interval?: number;
}

/** A GitHub Releases feed for a vendor-owned repo. */
const gh = (company: string, owner: string, repo: string, o: Opt = {}): UpsertSourceInput => ({
  company,
  product: o.product ?? repo,
  source_url: `https://github.com/${owner}/${repo}/releases`,
  source_type: 'github',
  official_domain: 'github.com',
  priority: o.priority ?? 55,
  crawl_interval_minutes: o.interval ?? 180,
  active: false,
  extra: { github: { owner, repo, mode: 'releases' } },
});

/** An RSS/Atom feed with a known-good URL. */
const rss = (
  company: string,
  product: string,
  source_url: string,
  official_domain: string,
  o: Opt = {},
): UpsertSourceInput => ({
  company,
  product,
  source_url,
  source_type: 'rss',
  official_domain,
  priority: o.priority ?? 40,
  crawl_interval_minutes: o.interval ?? 90,
  active: false,
});

/** A best-effort HTML listing (GENERIC selectors unless overridden). */
const html = (
  company: string,
  product: string,
  source_url: string,
  official_domain: string,
  o: Opt & { selectors?: HtmlFetchConfig } = {},
): UpsertSourceInput => ({
  company,
  product,
  source_url,
  source_type: 'html',
  official_domain,
  priority: o.priority ?? 45,
  crawl_interval_minutes: o.interval ?? 120,
  active: false,
  extra: { html: o.selectors ?? GENERIC },
});

export const CATALOG_SOURCES: UpsertSourceInput[] = [
  // ============================================================
  // FRONTIER LABS — official blogs + first-party SDK/tool repos
  // ============================================================

  // ---- OpenAI ----
  // NOTE: `openai/openai-node` is intentionally omitted — it already lives in
  // the base seed (sources.seed.ts) as an active source. Re-listing it here
  // would let `seed:catalog` (active:false) clobber its active flag.
  gh('OpenAI', 'openai', 'openai-python', { product: 'Python SDK', priority: 45, interval: 120 }),
  gh('OpenAI', 'openai', 'openai-go', { product: 'Go SDK' }),
  gh('OpenAI', 'openai', 'openai-java', { product: 'Java SDK' }),
  gh('OpenAI', 'openai', 'openai-dotnet', { product: '.NET SDK' }),
  gh('OpenAI', 'openai', 'openai-agents-python', { product: 'Agents SDK (Python)', priority: 40, interval: 90 }),
  gh('OpenAI', 'openai', 'openai-agents-js', { product: 'Agents SDK (JS)', priority: 40, interval: 90 }),
  gh('OpenAI', 'openai', 'codex', { product: 'Codex CLI', priority: 35, interval: 90 }),
  gh('OpenAI', 'openai', 'whisper', { product: 'Whisper' }),
  gh('OpenAI', 'openai', 'tiktoken', { product: 'tiktoken' }),
  gh('OpenAI', 'openai', 'evals', { product: 'Evals' }),

  // ---- Anthropic / Claude ----
  gh('Anthropic', 'anthropics', 'anthropic-sdk-python', { product: 'Python SDK', priority: 40, interval: 120 }),
  gh('Anthropic', 'anthropics', 'anthropic-sdk-typescript', { product: 'TypeScript SDK', priority: 40, interval: 120 }),
  gh('Anthropic', 'anthropics', 'anthropic-sdk-go', { product: 'Go SDK' }),
  gh('Anthropic', 'anthropics', 'anthropic-sdk-java', { product: 'Java SDK' }),
  gh('Anthropic', 'anthropics', 'claude-code', { product: 'Claude Code (releases)', priority: 30, interval: 60 }),
  gh('Anthropic', 'anthropics', 'claude-agent-sdk-python', { product: 'Agent SDK (Python)', priority: 40 }),
  gh('Anthropic', 'anthropics', 'claude-agent-sdk-typescript', { product: 'Agent SDK (TS)', priority: 40 }),
  gh('Anthropic', 'anthropics', 'dxt', { product: 'Desktop Extensions (DXT)' }),
  html('Anthropic', 'Engineering', 'https://www.anthropic.com/engineering', 'anthropic.com', { priority: 30, interval: 90 }),

  // ---- Google / DeepMind ----
  gh('Google', 'googleapis', 'python-genai', { product: 'Gen AI SDK (Python)', priority: 35, interval: 90 }),
  gh('Google', 'googleapis', 'js-genai', { product: 'Gen AI SDK (JS)', priority: 35, interval: 90 }),
  gh('Google', 'googleapis', 'go-genai', { product: 'Gen AI SDK (Go)' }),
  gh('Google', 'googleapis', 'java-genai', { product: 'Gen AI SDK (Java)' }),
  gh('Google', 'google-gemini', 'gemini-cli', { product: 'Gemini CLI', priority: 30, interval: 90 }),
  gh('Google', 'google-gemini', 'generative-ai-python', { product: 'Generative AI (Python, legacy)' }),
  gh('Google', 'google-gemini', 'generative-ai-js', { product: 'Generative AI (JS, legacy)' }),
  gh('Google', 'google', 'jax', { product: 'JAX' }),
  gh('Google', 'google', 'flax', { product: 'Flax' }),
  gh('Google', 'keras-team', 'keras', { product: 'Keras' }),
  gh('Google', 'tensorflow', 'tensorflow', { product: 'TensorFlow' }),
  gh('Google DeepMind', 'google-deepmind', 'mujoco', { product: 'MuJoCo' }),
  gh('Google DeepMind', 'google-deepmind', 'optax', { product: 'Optax' }),
  gh('Google DeepMind', 'google-deepmind', 'dm-haiku', { product: 'Haiku' }),
  gh('Google DeepMind', 'google-deepmind', 'alphafold', { product: 'AlphaFold' }),
  rss('Google', 'Developers Blog', 'https://developers.googleblog.com/en/rss/', 'googleblog.com', { priority: 30, interval: 60 }),

  // ---- Microsoft / Azure AI ----
  gh('Microsoft', 'microsoft', 'semantic-kernel', { product: 'Semantic Kernel', priority: 40 }),
  gh('Microsoft', 'microsoft', 'autogen', { product: 'AutoGen', priority: 40 }),
  gh('Microsoft', 'microsoft', 'promptflow', { product: 'PromptFlow' }),
  gh('Microsoft', 'microsoft', 'guidance', { product: 'Guidance' }),
  gh('Microsoft', 'microsoft', 'DeepSpeed', { product: 'DeepSpeed' }),
  gh('Microsoft', 'microsoft', 'onnxruntime', { product: 'ONNX Runtime' }),
  gh('Microsoft', 'microsoft', 'markitdown', { product: 'MarkItDown' }),
  gh('Microsoft', 'microsoft', 'graphrag', { product: 'GraphRAG' }),
  gh('Microsoft', 'microsoft', 'TypeChat', { product: 'TypeChat' }),
  gh('Microsoft', 'microsoft', 'presidio', { product: 'Presidio' }),
  gh('Microsoft', 'microsoft', 'playwright', { product: 'Playwright' }),
  gh('Microsoft', 'microsoft', 'vscode', { product: 'VS Code', priority: 35, interval: 90 }),
  html('Microsoft', 'AI Blog', 'https://blogs.microsoft.com/ai/', 'microsoft.com', { priority: 30, interval: 90 }),
  rss('Microsoft', 'Research Blog', 'https://www.microsoft.com/en-us/research/feed/', 'microsoft.com'),

  // ---- Meta AI ----
  gh('Meta AI', 'meta-llama', 'llama-stack', { product: 'Llama Stack', priority: 40 }),
  gh('Meta AI', 'meta-llama', 'llama-models', { product: 'Llama Models' }),
  gh('Meta AI', 'pytorch', 'pytorch', { product: 'PyTorch' }),
  gh('Meta AI', 'pytorch', 'vision', { product: 'TorchVision' }),
  gh('Meta AI', 'pytorch', 'audio', { product: 'TorchAudio' }),
  gh('Meta AI', 'facebookresearch', 'faiss', { product: 'FAISS' }),
  gh('Meta AI', 'facebookresearch', 'xformers', { product: 'xFormers' }),

  // ---- NVIDIA ----
  gh('NVIDIA', 'NVIDIA', 'NeMo', { product: 'NeMo' }),
  gh('NVIDIA', 'NVIDIA', 'TensorRT', { product: 'TensorRT' }),
  gh('NVIDIA', 'NVIDIA', 'TensorRT-LLM', { product: 'TensorRT-LLM' }),
  gh('NVIDIA', 'NVIDIA', 'cuda-python', { product: 'CUDA Python' }),
  gh('NVIDIA', 'NVIDIA', 'NeMo-Guardrails', { product: 'NeMo Guardrails' }),
  gh('NVIDIA', 'triton-inference-server', 'server', { product: 'Triton Inference Server' }),
  rss('NVIDIA', 'Developer Blog', 'https://developer.nvidia.com/blog/feed', 'nvidia.com', { priority: 35, interval: 90 }),
  rss('NVIDIA', 'Blog', 'https://blogs.nvidia.com/feed/', 'nvidia.com', { priority: 35, interval: 90 }),

  // ============================================================
  // OTHER MODEL PROVIDERS
  // ============================================================
  gh('Mistral', 'mistralai', 'client-python', { product: 'Python client' }),
  gh('Mistral', 'mistralai', 'client-js', { product: 'JS client' }),
  gh('Mistral', 'mistralai', 'mistral-inference', { product: 'Inference' }),
  gh('Mistral', 'mistralai', 'mistral-common', { product: 'mistral-common' }),

  gh('Cohere', 'cohere-ai', 'cohere-python', { product: 'Python SDK' }),
  gh('Cohere', 'cohere-ai', 'cohere-typescript', { product: 'TypeScript SDK' }),
  gh('Cohere', 'cohere-ai', 'cohere-go', { product: 'Go SDK' }),

  gh('Alibaba Qwen', 'QwenLM', 'qwen-code', { product: 'Qwen Code', priority: 40 }),
  gh('Alibaba Qwen', 'QwenLM', 'Qwen-Agent', { product: 'Qwen-Agent' }),

  html('AI21 Labs', 'Blog', 'https://www.ai21.com/blog', 'ai21.com'),
  html('Stability AI', 'News', 'https://stability.ai/news', 'stability.ai', { priority: 35, interval: 90 }),
  gh('Stability AI', 'Stability-AI', 'generative-models', { product: 'Generative Models' }),

  gh('ElevenLabs', 'elevenlabs', 'elevenlabs-python', { product: 'Python SDK' }),
  gh('ElevenLabs', 'elevenlabs', 'elevenlabs-js', { product: 'JS SDK' }),
  html('ElevenLabs', 'Blog', 'https://elevenlabs.io/blog', 'elevenlabs.io'),

  gh('Groq', 'groq', 'groq-python', { product: 'Python SDK' }),
  gh('Groq', 'groq', 'groq-typescript', { product: 'TypeScript SDK' }),

  // ============================================================
  // HUGGING FACE ECOSYSTEM (very release-active)
  // ============================================================
  gh('Hugging Face', 'huggingface', 'transformers', { product: 'Transformers', priority: 35, interval: 90 }),
  gh('Hugging Face', 'huggingface', 'diffusers', { product: 'Diffusers' }),
  gh('Hugging Face', 'huggingface', 'datasets', { product: 'Datasets' }),
  gh('Hugging Face', 'huggingface', 'accelerate', { product: 'Accelerate' }),
  gh('Hugging Face', 'huggingface', 'peft', { product: 'PEFT' }),
  gh('Hugging Face', 'huggingface', 'tokenizers', { product: 'Tokenizers' }),
  gh('Hugging Face', 'huggingface', 'text-generation-inference', { product: 'TGI' }),
  gh('Hugging Face', 'huggingface', 'text-embeddings-inference', { product: 'TEI' }),
  gh('Hugging Face', 'huggingface', 'huggingface_hub', { product: 'Hub client' }),
  gh('Hugging Face', 'huggingface', 'trl', { product: 'TRL' }),
  gh('Hugging Face', 'huggingface', 'candle', { product: 'Candle' }),
  gh('Hugging Face', 'huggingface', 'smolagents', { product: 'smolagents', priority: 40 }),
  gh('Hugging Face', 'huggingface', 'lerobot', { product: 'LeRobot' }),
  gh('Hugging Face', 'huggingface', 'optimum', { product: 'Optimum' }),
  gh('Hugging Face', 'huggingface', 'autotrain-advanced', { product: 'AutoTrain' }),
  gh('Hugging Face', 'huggingface', 'setfit', { product: 'SetFit' }),
  gh('Hugging Face', 'huggingface', 'evaluate', { product: 'Evaluate' }),

  // ============================================================
  // ORCHESTRATION / AGENT FRAMEWORKS
  // ============================================================
  gh('LangChain', 'langchain-ai', 'langchain', { product: 'LangChain (Python)', priority: 35 }),
  gh('LangChain', 'langchain-ai', 'langchainjs', { product: 'LangChain.js' }),
  gh('LangChain', 'langchain-ai', 'langgraph', { product: 'LangGraph', priority: 40 }),
  gh('LangChain', 'langchain-ai', 'langsmith-sdk', { product: 'LangSmith SDK' }),
  gh('LlamaIndex', 'run-llama', 'llama_index', { product: 'LlamaIndex (Python)', priority: 40 }),
  gh('LlamaIndex', 'run-llama', 'LlamaIndexTS', { product: 'LlamaIndex.TS' }),
  gh('LlamaIndex', 'run-llama', 'create-llama', { product: 'create-llama' }),
  gh('CrewAI', 'crewAIInc', 'crewAI', { product: 'CrewAI', priority: 40 }),
  gh('DSPy', 'stanfordnlp', 'dspy', { product: 'DSPy' }),
  gh('Haystack', 'deepset-ai', 'haystack', { product: 'Haystack' }),
  gh('LiteLLM', 'BerriAI', 'litellm', { product: 'LiteLLM', priority: 40 }),
  gh('Pydantic', 'pydantic', 'pydantic-ai', { product: 'Pydantic AI', priority: 40 }),
  gh('Ragas', 'explodinggradients', 'ragas', { product: 'Ragas' }),
  gh('AutoGPT', 'Significant-Gravitas', 'AutoGPT', { product: 'AutoGPT' }),
  gh('MetaGPT', 'geekan', 'MetaGPT', { product: 'MetaGPT' }),
  gh('Langflow', 'langflow-ai', 'langflow', { product: 'Langflow' }),
  gh('Flowise', 'FlowiseAI', 'Flowise', { product: 'Flowise' }),
  gh('Dify', 'langgenius', 'dify', { product: 'Dify', priority: 40 }),
  gh('Mem0', 'mem0ai', 'mem0', { product: 'Mem0' }),
  gh('Marvin', 'PrefectHQ', 'marvin', { product: 'Marvin' }),

  // ============================================================
  // MODEL CONTEXT PROTOCOL (MCP)
  // ============================================================
  gh('Anthropic', 'modelcontextprotocol', 'servers', { product: 'MCP Servers', priority: 35, interval: 90 }),
  gh('Anthropic', 'modelcontextprotocol', 'python-sdk', { product: 'MCP Python SDK', priority: 40 }),
  gh('Anthropic', 'modelcontextprotocol', 'typescript-sdk', { product: 'MCP TypeScript SDK', priority: 40 }),
  gh('Anthropic', 'modelcontextprotocol', 'inspector', { product: 'MCP Inspector' }),
  gh('Anthropic', 'modelcontextprotocol', 'specification', { product: 'MCP Spec' }),

  // ============================================================
  // INFERENCE / SERVING / LOCAL RUNTIMES
  // ============================================================
  gh('vLLM', 'vllm-project', 'vllm', { product: 'vLLM', priority: 40 }),
  gh('llama.cpp', 'ggml-org', 'llama.cpp', { product: 'llama.cpp', priority: 40 }),
  gh('Ollama', 'ollama', 'ollama', { product: 'Ollama', priority: 35, interval: 90 }),
  gh('SGLang', 'sgl-project', 'sglang', { product: 'SGLang' }),
  gh('MLC LLM', 'mlc-ai', 'mlc-llm', { product: 'MLC LLM' }),
  gh('Ray', 'ray-project', 'ray', { product: 'Ray (Anyscale)' }),
  gh('GPT4All', 'nomic-ai', 'gpt4all', { product: 'GPT4All' }),
  gh('LocalAI', 'mudler', 'LocalAI', { product: 'LocalAI' }),
  gh('Jan', 'janhq', 'jan', { product: 'Jan' }),
  gh('Text Generation WebUI', 'oobabooga', 'text-generation-webui', { product: 'Text Generation WebUI' }),
  gh('BentoML', 'bentoml', 'BentoML', { product: 'BentoML' }),
  gh('BentoML', 'bentoml', 'OpenLLM', { product: 'OpenLLM' }),

  // ============================================================
  // VECTOR DBs / RETRIEVAL
  // ============================================================
  gh('Pinecone', 'pinecone-io', 'pinecone-python-client', { product: 'Python client' }),
  html('Pinecone', 'Blog', 'https://www.pinecone.io/blog/', 'pinecone.io'),
  gh('Weaviate', 'weaviate', 'weaviate', { product: 'Weaviate' }),
  html('Weaviate', 'Blog', 'https://weaviate.io/blog', 'weaviate.io'),
  gh('Qdrant', 'qdrant', 'qdrant', { product: 'Qdrant' }),
  gh('Chroma', 'chroma-core', 'chroma', { product: 'Chroma' }),
  gh('Milvus', 'milvus-io', 'milvus', { product: 'Milvus' }),
  gh('pgvector', 'pgvector', 'pgvector', { product: 'pgvector' }),
  gh('Marqo', 'marqo-ai', 'marqo', { product: 'Marqo' }),
  gh('txtai', 'neuml', 'txtai', { product: 'txtai' }),

  // ============================================================
  // AI CODING TOOLS (dev-focused — most relevant to Dev Arab)
  // ============================================================
  gh('Continue', 'continuedev', 'continue', { product: 'Continue', priority: 30, interval: 90 }),
  gh('Cline', 'cline', 'cline', { product: 'Cline', priority: 30, interval: 90 }),
  gh('Aider', 'Aider-AI', 'aider', { product: 'Aider', priority: 30, interval: 90 }),
  gh('Sourcegraph', 'sourcegraph', 'cody', { product: 'Cody' }),
  gh('Zed', 'zed-industries', 'zed', { product: 'Zed', priority: 30, interval: 90 }),
  gh('Tabby', 'TabbyML', 'tabby', { product: 'Tabby' }),
  gh('OpenHands', 'All-Hands-AI', 'OpenHands', { product: 'OpenHands', priority: 30 }),
  gh('Goose', 'block', 'goose', { product: 'Goose' }),
  gh('opencode', 'sst', 'opencode', { product: 'opencode' }),
  html('Windsurf', 'Changelog', 'https://windsurf.com/changelog', 'windsurf.com', { priority: 30, interval: 90 }),
  html('Tabnine', 'Blog', 'https://www.tabnine.com/blog/', 'tabnine.com'),

  // ============================================================
  // IMAGE / VIDEO / AUDIO GENERATION
  // ============================================================
  gh('ComfyUI', 'comfyanonymous', 'ComfyUI', { product: 'ComfyUI', priority: 40 }),
  gh('Stable Diffusion WebUI', 'AUTOMATIC1111', 'stable-diffusion-webui', { product: 'SD WebUI' }),
  gh('InvokeAI', 'invoke-ai', 'InvokeAI', { product: 'InvokeAI' }),
  gh('Fooocus', 'lllyasviel', 'Fooocus', { product: 'Fooocus' }),
  gh('whisper.cpp', 'ggml-org', 'whisper.cpp', { product: 'whisper.cpp' }),
  gh('Coqui', 'coqui-ai', 'TTS', { product: 'Coqui TTS' }),

  // ============================================================
  // ML OPS / DATA / EVAL / OBSERVABILITY
  // ============================================================
  gh('Weights & Biases', 'wandb', 'wandb', { product: 'W&B SDK' }),
  gh('MLflow', 'mlflow', 'mlflow', { product: 'MLflow' }),
  gh('DVC', 'iterative', 'dvc', { product: 'DVC' }),
  gh('ZenML', 'zenml-io', 'zenml', { product: 'ZenML' }),
  gh('Kubeflow', 'kubeflow', 'kubeflow', { product: 'Kubeflow' }),
  gh('Label Studio', 'HumanSignal', 'label-studio', { product: 'Label Studio' }),
  gh('Argilla', 'argilla-io', 'argilla', { product: 'Argilla' }),
  gh('Great Expectations', 'great-expectations', 'great_expectations', { product: 'Great Expectations' }),
  gh('spaCy', 'explosion', 'spaCy', { product: 'spaCy' }),
  gh('Sentence Transformers', 'UKPLab', 'sentence-transformers', { product: 'Sentence Transformers' }),
  gh('scikit-learn', 'scikit-learn', 'scikit-learn', { product: 'scikit-learn' }),
  gh('XGBoost', 'dmlc', 'xgboost', { product: 'XGBoost' }),
  gh('LightGBM', 'microsoft', 'LightGBM', { product: 'LightGBM' }),
  gh('ONNX', 'onnx', 'onnx', { product: 'ONNX' }),
  gh('Gradio', 'gradio-app', 'gradio', { product: 'Gradio' }),
  gh('Streamlit', 'streamlit', 'streamlit', { product: 'Streamlit' }),
  gh('Chainlit', 'Chainlit', 'chainlit', { product: 'Chainlit' }),

  // ============================================================
  // GUARDRAILS / EVAL / TRACING
  // ============================================================
  gh('Guardrails AI', 'guardrails-ai', 'guardrails', { product: 'Guardrails' }),
  gh('DeepEval', 'confident-ai', 'deepeval', { product: 'DeepEval' }),
  gh('promptfoo', 'promptfoo', 'promptfoo', { product: 'promptfoo' }),
  gh('Giskard', 'Giskard-AI', 'giskard', { product: 'Giskard' }),
  gh('Langfuse', 'langfuse', 'langfuse', { product: 'Langfuse', priority: 40 }),
  gh('Helicone', 'Helicone', 'helicone', { product: 'Helicone' }),
  gh('Arize Phoenix', 'Arize-ai', 'phoenix', { product: 'Phoenix' }),

  // ============================================================
  // AI CLOUD / INFRA PROVIDERS
  // ============================================================
  gh('Replicate', 'replicate', 'replicate-python', { product: 'Python client' }),
  gh('Replicate', 'replicate', 'replicate-javascript', { product: 'JS client' }),
  gh('Replicate', 'replicate', 'cog', { product: 'Cog' }),
  html('Replicate', 'Blog', 'https://replicate.com/blog', 'replicate.com'),
  gh('Modal', 'modal-labs', 'modal-client', { product: 'Modal client' }),
  gh('Baseten', 'basetenlabs', 'truss', { product: 'Truss' }),
  rss('AWS', 'Machine Learning Blog', 'https://aws.amazon.com/blogs/machine-learning/feed/', 'amazon.com', { priority: 35, interval: 90 }),
];
