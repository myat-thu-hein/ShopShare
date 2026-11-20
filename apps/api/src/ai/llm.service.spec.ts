import { z } from 'zod';
import { LlmService, isPublicHost, strictJsonSchema } from './llm.service';
import { envSchema } from '../config/env';

const baseEnv = envSchema.parse({
  DATABASE_URL: 'postgres://x',
  JWT_ACCESS_SECRET: 'a'.repeat(16),
  JWT_REFRESH_SECRET: 'b'.repeat(16),
});
const schema = z.object({ category: z.string().nullable(), colours: z.array(z.string()) });

function mockFetch(body: unknown, status = 200) {
  return jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }) as any);
}

afterEach(() => jest.restoreAllMocks());

describe('LlmService', () => {
  it('resolves providers from keys', () => {
    expect(
      LlmService.resolveProvider({
        LLM_PROVIDER: 'auto',
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
      }),
    ).toBe('none');
    expect(
      LlmService.resolveProvider({ LLM_PROVIDER: 'auto', ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k' }),
    ).toBe('anthropic');
    expect(
      LlmService.resolveProvider({
        LLM_PROVIDER: 'openai',
        ANTHROPIC_API_KEY: 'k',
        OPENAI_API_KEY: undefined,
      }),
    ).toBe('none');
  });

  it('returns null without a provider (callers fall back to rules)', async () => {
    const llm = new LlmService(baseEnv);
    expect(await llm.json({ name: 'x', system: '', user: '', schema })).toBeNull();
  });

  it('uses OpenAI strict JSON schema output and validates it', async () => {
    const spy = mockFetch({ choices: [{ message: { content: '{"category":"shoes","colours":["red"]}' } }] });
    const llm = new LlmService({ ...baseEnv, OPENAI_API_KEY: 'sk-test' });
    expect(await llm.json({ name: 'filters', system: 's', user: 'u', schema })).toEqual({
      category: 'shoes',
      colours: ['red'],
    });
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
  });

  it('uses Anthropic forced tool calls', async () => {
    const spy = mockFetch({
      content: [{ type: 'tool_use', name: 'filters', input: { category: null, colours: [] } }],
    });
    const llm = new LlmService({ ...baseEnv, ANTHROPIC_API_KEY: 'sk-ant' });
    expect(await llm.json({ name: 'filters', system: 's', user: 'u', schema })).toEqual({
      category: null,
      colours: [],
    });
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'filters' });
  });

  it('returns null when the model output fails validation or the API errors', async () => {
    mockFetch({ choices: [{ message: { content: '{"category":5}' } }] });
    const llm = new LlmService({ ...baseEnv, OPENAI_API_KEY: 'sk-test' });
    expect(await llm.json({ name: 'f', system: 's', user: 'u', schema })).toBeNull();
    jest.restoreAllMocks();
    mockFetch({ error: 'down' }, 500);
    expect(await llm.chat('s', [{ role: 'user', content: 'hi' }])).toBeNull();
  });
});

describe('helpers', () => {
  it('makes every object property required for OpenAI strict mode', () => {
    const out = strictJsonSchema({
      type: 'object',
      properties: {
        a: { type: 'string', default: 'x' },
        b: { type: 'object', properties: { c: { type: 'number' } } },
      },
    });
    expect(out.required).toEqual(['a', 'b']);
    expect(out.properties.a.default).toBeUndefined();
    expect(out.properties.b.additionalProperties).toBe(false);
  });

  it('blocks private hosts for image fetching (SSRF)', () => {
    expect(isPublicHost('res.cloudinary.com')).toBe(true);
    expect(isPublicHost('fcdn.example.com')).toBe(true);
    for (const h of [
      'localhost',
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '172.20.0.1',
      '169.254.169.254',
      '[::1]',
    ])
      expect(isPublicHost(h)).toBe(false);
  });
});
