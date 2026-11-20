import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@shopsense/shared';

export interface JwtUser {
  sub: string;
  email: string;
  role: Role;
  name: string;
}

export const IS_PUBLIC = 'isPublic';
/** Route can be called without logging in. If a valid token is present, req.user is still filled. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the given roles. Admins are always allowed. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser | undefined => {
    return ctx.switchToHttp().getRequest().user;
  },
);
