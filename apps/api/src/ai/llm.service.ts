import { Inject, Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { ZodType } from 'zod';
import { ENV, type Env } from '../config/env';
import { toOpenApi } from '../common/zod';

export type LlmProvider = 'openai' | 'anthropic' | 'none';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface JsonRequest<T> {
  system: string;
  user: string;
  /** Name of the structured output, e.g. "search_filters". */
  name: string;
  schema: ZodType<T>;
  /** Optional image (http(s) URL or /api/uploads/... path) for vision models. */
  imageUrl?: string;
  maxTokens?: number;
}

/**
 * One small client for both OpenAI(-compatible) and Anthropic, using plain fetch.
 * Every method returns null when no provider is configured or the call fails,
 * so callers always have a non-AI fallback path.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  readonly provider: LlmProvider;
  readonly model: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.provider = LlmService.resolveProvider(env);
    this.model =
      env.LLM_MODEL ??
      (this.provider === 'anthropic'
        ? 'claude-haiku-4-5'
        : this.provider === 'openai'
          ? 'gpt-4o-mini'
          : 'none');
    this.logger.log(
      `LLM provider: ${this.provider}${this.provider !== 'none' ? ` (${this.model})` : ' — using rule-based fallbacks'}`,
    );
  }

  static resolveProvider(
    env: Pick<Env, 'LLM_PROVIDER' | 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY'>,
  ): LlmProvider {
    if (env.LLM_PROVIDER === 'none') return 'none';
    if (env.LLM_PROVIDER === 'anthropic') return env.ANTHROPIC_API_KEY ? 'anthropic' : 'none';
    if (env.LLM_PROVIDER === 'openai') return env.OPENAI_API_KEY ? 'openai' : 'none';
    if (env.ANTHROPIC_API_KEY) return 'anthropic';
    if (env.OPENAI_API_KEY) return 'openai';
    return 'none';
  }

  get enabled(): boolean {
    return this.provider !== 'none';
  }

  /** Structured JSON output validated by a Zod schema. */
  async json<T>(req: JsonRequest<T>): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const raw = this.provider === 'anthropic' ? await this.anthropicJson(req) : await this.openaiJson(req);
      const parsed = req.schema.safeParse(raw);
      if (!parsed.success) {
        this.logger.warn(`LLM output for ${req.name} failed validation: ${parsed.error.issues[0]?.message}`);
        return null;
      }
      return parsed.data;
    } catch (e) {
      this.logger.warn(`LLM ${req.name} failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** Plain chat completion. */
  async chat(system: string, messages: ChatMessage[], maxTokens = 700): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      if (this.provider === 'anthropic') {
        const data = await this.post('https://api.anthropic.com/v1/messages', this.anthropicHeaders(), {
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages,
        });
        return (data.content ?? [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')
          .trim();
      }
      const data = await this.post(`${this.openaiBase()}/chat/completions`, this.openaiHeaders(), {
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      });
      return (data.choices?.[0]?.message?.content ?? '').trim();
    } catch (e) {
      this.logger.warn(`LLM chat failed: ${(e as Error).message}`);
      return null;
    }
  }

  /* ---------------------------------------------------------------- OpenAI */

  private openaiBase() {
    return this.env.OPENAI_BASE_URL.replace(/\/$/, '');
  }

  private openaiHeaders() {
    return { authorization: `Bearer ${this.env.OPENAI_API_KEY}` };
  }

  private async openaiJson<T>(req: JsonRequest<T>): Promise<unknown> {
    const schema = strictJsonSchema(toOpenApi(req.schema));
    const userContent: any[] = [{ type: 'text', text: req.user }];
    const image = await this.loadImage(req.imageUrl);
    if (image) userContent.push({ type: 'image_url', image_url: { url: image.dataUrl } });

    const body = {
      model: this.model,
      max_tokens: req.maxTokens ?? 800,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_schema', json_schema: { name: req.name, schema, strict: true } },
    };
    try {
      const data = await this.post(`${this.openaiBase()}/chat/completions`, this.openaiHeaders(), body);
      return JSON.parse(data.choices[0].message.content);
    } catch (e) {
      // Some OpenAI-compatible providers only support json_object mode. Retry once with the schema in the prompt.
      if (!String((e as Error).message).includes('(400)')) throw e;
      const data = await this.post(`${this.openaiBase()}/chat/completions`, this.openaiHeaders(), {
        ...body,
        messages: [
          {
            role: 'system',
            content: `${req.system}\nReply with JSON only, matching this JSON schema:\n${JSON.stringify(schema)}`,
          },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      });
      return JSON.parse(data.choices[0].message.content);
    }
  }

  /* ------------------------------------------------------------- Anthropic */

  private anthropicHeaders() {
    return { 'x-api-key': this.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' };
  }

  /** Forces a tool call so Claude returns arguments that match our JSON schema. */
  private async anthropicJson<T>(req: JsonRequest<T>): Promise<unknown> {
    const content: any[] = [];
    const image = await this.loadImage(req.imageUrl);
    if (image)
      content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } });
    content.push({ type: 'text', text: req.user });

    const data = await this.post('https://api.anthropic.com/v1/messages', this.anthropicHeaders(), {
      model: this.model,
      max_tokens: req.maxTokens ?? 800,
      system: req.system,
      messages: [{ role: 'user', content }],
      tools: [
        {
          name: req.name,
          description: `Return the ${req.name} result.`,
          input_schema: toOpenApi(req.schema),
        },
      ],
      tool_choice: { type: 'tool', name: req.name },
    });
    const block = (data.content ?? []).find((b: any) => b.type === 'tool_use');
    if (!block) throw new Error('No tool_use block in response');
    return block.input;
  }

  /* ---------------------------------------------------------------- shared */

  private async post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.env.LLM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  /** Loads an image as base64. Vision models do not accept SVG, so those are skipped. */
  private async loadImage(url?: string): Promise<{ mime: string; base64: string; dataUrl: string } | null> {
    if (!url || url.endsWith('.svg')) return null;
    try {
      let buffer: Buffer;
      let mime = 'image/jpeg';
      if (/^https:\/\//.test(url)) {
        if (!isPublicHost(new URL(url).hostname)) return null; // basic SSRF protection
        const res = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
        if (!res.ok) return null;
        mime = res.headers.get('content-type')?.split(';')[0] ?? mime;
        buffer = Buffer.from(await res.arrayBuffer());
      } else if (url.startsWith('/api/uploads/')) {
        const root = resolve(process.cwd(), this.env.UPLOAD_DIR);
        const file = resolve(root, url.replace('/api/uploads/', ''));
        if (!file.startsWith(root + sep)) return null; // block path traversal
        buffer = await readFile(file);
        mime = url.endsWith('.png') ? 'image/png' : url.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      } else {
        return null;
      }
      if (buffer.length > 4_500_000 || !mime.startsWith('image/') || mime.includes('svg')) return null;
      const base64 = buffer.toString('base64');
      return { mime, base64, dataUrl: `data:${mime};base64,${base64}` };
    } catch {
      return null;
    }
  }
}

/** Rejects localhost and private network hosts so sellers cannot make the API fetch internal URLs. */
export function isPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return !(
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^(127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    (h.includes(':') && (h === '::1' || /^(fc|fd|fe80)/.test(h)))
  );
}

/**
 * OpenAI strict mode requires every property to be listed in `required`
 * and `additionalProperties: false` on every object.
 */
export function strictJsonSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(strictJsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'default') continue;
    out[k] = strictJsonSchema(v);
  }
  if (out.type === 'object' && out.properties) {
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}
