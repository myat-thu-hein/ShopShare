import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { ENV, type Env } from '../config/env';

/**
 * Thin wrapper around ioredis with JSON caching helpers.
 * If Redis is unreachable, cache calls degrade to "no cache" instead of failing requests.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      // Upstash and other hosted Redis use rediss:// — ioredis handles TLS from the URL.
    });
    this.client.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
  }

  get ready(): boolean {
    return this.client.status === 'ready';
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.ready) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds = this.env.CACHE_TTL_SECONDS): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* cache is best effort */
    }
  }

  /** Read-through cache. */
  async remember<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const hit = await this.getJson<T>(key);
    if (hit !== null) return hit;
    const value = await producer();
    if (value !== null && value !== undefined) await this.setJson(key, value, ttlSeconds);
    return value;
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.ready || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      /* ignore */
    }
  }

  /** Deletes keys by pattern using SCAN (safe for production, unlike KEYS). */
  async delPattern(pattern: string): Promise<void> {
    if (!this.ready) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch {
      /* ignore */
    }
  }

  static hashKey(parts: unknown): string {
    return createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 20);
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
