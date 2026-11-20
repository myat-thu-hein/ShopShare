import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, Role } from '@prisma/client';
import { slugify, type AuthUser, type LoginInput, type RegisterInput } from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ENV, type Env } from '../config/env';
import type { JwtUser } from '../common/decorators';

type UserWithSeller = Prisma.UserGetPayload<{ include: { sellerProfile: true } }>;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface RefreshPayload {
  sub: string;
  sid: string;
}

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

export function toAuthUser(u: UserWithSeller): AuthUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatarUrl: u.avatarUrl,
    sellerStatus: u.sellerProfile?.status ?? null,
    sellerSlug: u.sellerProfile?.slug ?? null,
  };
}

/**
 * Access tokens are short-lived JWTs (15 min). Refresh tokens are long-lived JWTs whose
 * session id lives in Redis; every refresh rotates the token, and re-using an old refresh
 * token revokes all of that user's sessions (stolen-token protection).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: Tokens }> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictException('An account with this email already exists');
    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role as Role,
        sellerProfile:
          input.role === 'SELLER' && input.storeName
            ? { create: { storeName: input.storeName, slug: await this.uniqueStoreSlug(input.storeName) } }
            : undefined,
      },
      include: { sellerProfile: true },
    });
    return { user: toAuthUser(user), tokens: await this.issueTokens(user) };
  }

  async login(input: LoginInput): Promise<{ user: AuthUser; tokens: Tokens }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { sellerProfile: true },
    });
    // Same error for "no user" and "wrong password" so attackers cannot discover emails.
    if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.isBanned) throw new ForbiddenException('This account has been suspended');
    return { user: toAuthUser(user), tokens: await this.issueTokens(user) };
  }

  async demoLogin(role: Role): Promise<{ user: AuthUser; tokens: Tokens }> {
    if (!this.env.DEMO_MODE) throw new ForbiddenException('Demo mode is disabled');
    const user = await this.prisma.user.findFirst({
      where: { role, isDemo: true },
      include: { sellerProfile: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new NotFoundException('Demo account not found. Run `pnpm db:seed`.');
    return { user: toAuthUser(user), tokens: await this.issueTokens(user) };
  }

  async loginWithGoogle(profile: { sub: string; email: string; name: string; picture?: string }) {
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: profile.sub }, { email: profile.email.toLowerCase() }] },
      include: { sellerProfile: true },
    });
    if (user && !user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: profile.sub, avatarUrl: user.avatarUrl ?? profile.picture },
        include: { sellerProfile: true },
      });
    }
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email.toLowerCase(),
          name: profile.name,
          googleId: profile.sub,
          avatarUrl: profile.picture,
        },
        include: { sellerProfile: true },
      });
    }
    if (user.isBanned) throw new ForbiddenException('This account has been suspended');
    return { user: toAuthUser(user), tokens: await this.issueTokens(user) };
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { sellerProfile: true },
    });
    if (!user || user.isBanned) throw new UnauthorizedException();
    return toAuthUser(user);
  }

  async refresh(refreshToken: string | undefined): Promise<{ user: AuthUser; tokens: Tokens }> {
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (this.redis.ready) {
      const stored = await this.redis.client.get(`session:${payload.sid}`);
      if (!stored) {
        // A valid signature but no session = token was already rotated. Treat as theft.
        await this.revokeAll(payload.sub);
        throw new UnauthorizedException('Session revoked');
      }
      const hash = sha(refreshToken);
      // Two tabs may refresh at the same moment. A just-rotated token gets a 30s grace period.
      if (stored !== hash && stored !== `rotated:${hash}`)
        throw new UnauthorizedException('Session mismatch');
      if (stored === hash) {
        await this.redis.client.set(`session:${payload.sid}`, `rotated:${hash}`, 'EX', 30);
        await this.redis.client.srem(`user_sessions:${payload.sub}`, payload.sid);
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { sellerProfile: true },
    });
    if (!user || user.isBanned) throw new UnauthorizedException();
    return { user: toAuthUser(user), tokens: await this.issueTokens(user) };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
      await this.redis.del(`session:${payload.sid}`);
      if (this.redis.ready) await this.redis.client.srem(`user_sessions:${payload.sub}`, payload.sid);
    } catch {
      /* already invalid */
    }
  }

  async revokeAll(userId: string) {
    if (!this.redis.ready) return;
    const sids = await this.redis.client.smembers(`user_sessions:${userId}`);
    if (sids.length) await this.redis.del(...sids.map((s) => `session:${s}`));
    await this.redis.del(`user_sessions:${userId}`);
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.passwordHash && !(await bcrypt.compare(current, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (user.isDemo) throw new ForbiddenException('Demo account passwords cannot be changed');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(next, 10) },
    });
    await this.revokeAll(userId);
  }

  private async issueTokens(user: { id: string; email: string; role: Role; name: string }): Promise<Tokens> {
    const payload: JwtUser = { sub: user.id, email: user.email, role: user.role, name: user.name };
    const accessToken = await this.jwt.signAsync(payload);
    const sid = randomBytes(16).toString('hex');
    const ttlSeconds = this.env.JWT_REFRESH_TTL_DAYS * 86_400;
    const refreshToken = await this.jwt.signAsync({ sub: user.id, sid } satisfies RefreshPayload, {
      secret: this.env.JWT_REFRESH_SECRET,
      expiresIn: ttlSeconds,
    });
    if (this.redis.ready) {
      await this.redis.client.set(`session:${sid}`, sha(refreshToken), 'EX', ttlSeconds);
      await this.redis.client.sadd(`user_sessions:${user.id}`, sid);
      await this.redis.client.expire(`user_sessions:${user.id}`, ttlSeconds);
    }
    return { accessToken, refreshToken };
  }

  private async uniqueStoreSlug(name: string): Promise<string> {
    const base = slugify(name) || 'store';
    let slug = base;
    for (let i = 2; await this.prisma.sellerProfile.findUnique({ where: { slug } }); i++)
      slug = `${base}-${i}`;
    return slug;
  }
}
