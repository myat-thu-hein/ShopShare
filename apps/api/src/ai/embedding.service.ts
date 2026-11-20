import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { EMBEDDING_DIM, LOCAL_EMBEDDING_MODEL, localEmbed } from './local-embedder';

/**
 * Turns text into 768-number vectors for pgvector.
 * - local (default): free hashing embedder, works offline.
 * - openai: any OpenAI-compatible /embeddings endpoint (OpenAI, Gemini, Ollama...).
 *   We always request 768 dimensions so the database column never changes.
 */
export class Embedder {
  private readonly logger = new Logger('Embedder');

  constructor(
    private readonly env: Pick<
      Env,
      | 'EMBEDDING_PROVIDER'
      | 'EMBEDDING_MODEL'
      | 'EMBEDDING_API_KEY'
      | 'EMBEDDING_BASE_URL'
      | 'OPENAI_API_KEY'
      | 'OPENAI_BASE_URL'
      | 'LLM_TIMEOUT_MS'
    >,
  ) {}

  get model(): string {
    return this.env.EMBEDDING_PROVIDER === 'openai'
      ? `openai:${this.env.EMBEDDING_MODEL}`
      : LOCAL_EMBEDDING_MODEL;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.env.EMBEDDING_PROVIDER !== 'openai') return texts.map(localEmbed);

    const key = this.env.EMBEDDING_API_KEY ?? this.env.OPENAI_API_KEY;
    const base = (this.env.EMBEDDING_BASE_URL ?? this.env.OPENAI_BASE_URL).replace(/\/$/, '');
    if (!key) throw new Error('EMBEDDING_PROVIDER=openai needs EMBEDDING_API_KEY or OPENAI_API_KEY');

    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 64) {
      const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
      const res = await fetch(`${base}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: this.env.EMBEDDING_MODEL, input: batch, dimensions: EMBEDDING_DIM }),
        signal: AbortSignal.timeout(this.env.LLM_TIMEOUT_MS * 2),
      });
      if (!res.ok)
        throw new Error(`Embedding request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      for (const row of sorted) {
        if (row.embedding.length !== EMBEDDING_DIM) {
          throw new Error(`Embedding model returned ${row.embedding.length} dims; expected ${EMBEDDING_DIM}`);
        }
        out.push(row.embedding);
      }
    }
    return out;
  }

  /** Returns null when the provider fails, so callers can fall back to keyword search. */
  async embedOne(text: string): Promise<number[] | null> {
    try {
      return (await this.embed([text]))[0];
    } catch (e) {
      this.logger.warn(`Embedding failed: ${(e as Error).message}`);
      return null;
    }
  }
}

@Injectable()
export class EmbeddingService extends Embedder {
  constructor(@Inject(ENV) env: Env) {
    super(env);
  }
}

export const toVectorLiteral = (v: number[]) => `[${v.join(',')}]`;
