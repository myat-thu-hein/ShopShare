import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Role } from '@shopsense/shared';
import { IS_PUBLIC, ROLES_KEY, type JwtUser } from './decorators';

export const ACCESS_COOKIE = 'ss_at';
export const REFRESH_COOKIE = 'ss_rt';

export function extractAccessToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? null;
}

/**
 * Global guard. Every route requires a valid access token unless marked @Public().
 * The token comes from the httpOnly cookie (browser) or an Authorization header (Swagger, scripts).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtUser }>();
    const token = extractAccessToken(req);

    if (token) {
      try {
        req.user = await this.jwt.verifyAsync<JwtUser>(token);
      } catch {
        if (!isPublic) throw new UnauthorizedException('Session expired');
      }
    }
    if (!isPublic && !req.user) throw new UnauthorizedException('Please log in');
    return true;
  }
}

/** Checks @Roles(). Admin passes every role check. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<{ user?: JwtUser }>().user;
    if (!user) throw new UnauthorizedException('Please log in');
    if (user.role === 'ADMIN' || roles.includes(user.role)) return true;
    throw new ForbiddenException('You do not have access to this resource');
  }
}
