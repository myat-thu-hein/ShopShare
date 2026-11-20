import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../redis/redis.service';

interface Record {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Rate-limit counters in Redis so limits hold across multiple API instances.
 * Falls back to process memory if Redis is down.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly memory = new Map<string, { hits: number; expiresAt: number; blockedUntil: number }>();

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<Record> {
    const k = `throttle:${throttlerName}:${key}`;
    if (this.redis.ready) {
      try {
        const blockKey = `${k}:blocked`;
        const blockedTtl = await this.redis.client.pttl(blockKey);
        if (blockedTtl > 0) {
          return {
            totalHits: limit + 1,
            timeToExpire: Math.ceil(blockedTtl / 1000),
            isBlocked: true,
            timeToBlockExpire: Math.ceil(blockedTtl / 1000),
          };
        }
        const results = await this.redis.client.multi().incr(k).pttl(k).exec();
        const hits = Number(results?.[0]?.[1] ?? 1);
        let pttl = Number(results?.[1]?.[1] ?? -1);
        if (pttl < 0) {
          await this.redis.client.pexpire(k, ttl);
          pttl = ttl;
        }
        if (hits > limit) {
          await this.redis.client.set(blockKey, '1', 'PX', blockDuration || ttl);
          const block = Math.ceil((blockDuration || ttl) / 1000);
          return {
            totalHits: hits,
            timeToExpire: Math.ceil(pttl / 1000),
            isBlocked: true,
            timeToBlockExpire: block,
          };
        }
        return {
          totalHits: hits,
          timeToExpire: Math.ceil(pttl / 1000),
          isBlocked: false,
          timeToBlockExpire: 0,
        };
      } catch {
        /* fall through to memory */
      }
    }
    return this.incrementMemory(k, ttl, limit, blockDuration);
  }

  private incrementMemory(k: string, ttl: number, limit: number, blockDuration: number): Record {
    const now = Date.now();
    let entry = this.memory.get(k);
    if (!entry || entry.expiresAt <= now) entry = { hits: 0, expiresAt: now + ttl, blockedUntil: 0 };
    if (entry.blockedUntil > now) {
      const s = Math.ceil((entry.blockedUntil - now) / 1000);
      return { totalHits: limit + 1, timeToExpire: s, isBlocked: true, timeToBlockExpire: s };
    }
    entry.hits++;
    if (entry.hits > limit) entry.blockedUntil = now + (blockDuration || ttl);
    this.memory.set(k, entry);
    return {
      totalHits: entry.hits,
      timeToExpire: Math.ceil((entry.expiresAt - now) / 1000),
      isBlocked: entry.blockedUntil > now,
      timeToBlockExpire: entry.blockedUntil > now ? Math.ceil((entry.blockedUntil - now) / 1000) : 0,
    };
  }
}
