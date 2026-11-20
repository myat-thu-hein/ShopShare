import { z } from 'zod';

const bool = z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean());

/**
 * Every environment variable the API reads, validated once at startup.
 * Missing optional integrations (Stripe, Cloudinary, LLM keys, email) switch the API
 * into a safe local fallback instead of crashing — see README "Environment variables".
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** Public URL of the web app (used for redirects, emails, Stripe return URLs). */
  WEB_URL: z.string().default('http://localhost:3000'),
  /** Public URL of the API itself (used for local image URLs). */
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(7),
  COOKIE_SECURE: bool.default(false),
  /** Set when web and API share a parent domain, e.g. ".shopsense.app". Usually leave empty. */
  COOKIE_DOMAIN: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/api/auth/google/callback'),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  ORDER_EXPIRY_MINUTES: z.coerce.number().min(31).default(35),

  CLOUDINARY_URL: z.string().optional(),
  UPLOAD_DIR: z.string().default('uploads'),

  /** auto = anthropic if ANTHROPIC_API_KEY, else openai if OPENAI_API_KEY, else rules-only. */
  LLM_PROVIDER: z.enum(['auto', 'openai', 'anthropic', 'none']).default('auto'),
  LLM_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  /** Any OpenAI-compatible endpoint: Gemini, Groq, OpenRouter, Ollama... */
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(20000),

  /** local = free built-in hashing embedder (no API key). openai = any OpenAI-compatible embeddings API. */
  EMBEDDING_PROVIDER: z.enum(['local', 'openai']).default('local'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('ShopShare <orders@shopsense.dev>'),

  DEMO_MODE: bool.default(true),
  CACHE_TTL_SECONDS: z.coerce.number().default(120),
  THROTTLE_DISABLED: bool.default(false),
  /** Proxy hops in front of the API. 1 = Render/Railway only. 2 = browser -> Vercel -> Render. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee apps/api/.env.example`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export const ENV = Symbol('ENV');
