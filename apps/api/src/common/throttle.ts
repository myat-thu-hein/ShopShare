import { Throttle } from '@nestjs/throttler';

/** 10 requests per minute — login, register, refresh. */
export const AuthThrottle = () => Throttle({ default: { limit: 10, ttl: 60_000 } });

/** 20 requests per minute — anything that calls an LLM. */
export const AiThrottle = () => Throttle({ default: { limit: 20, ttl: 60_000 } });
