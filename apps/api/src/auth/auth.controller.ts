import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  changePasswordSchema,
  demoLoginSchema,
  loginSchema,
  registerSchema,
  type DemoLoginInput,
  type LoginInput,
  type RegisterInput,
} from '@shopsense/shared';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './cookies';
import { ApiZodBody, zodPipe } from '../common/zod';
import { CurrentUser, Public, type JwtUser } from '../common/decorators';
import { REFRESH_COOKIE } from '../common/guards';
import { AuthThrottle } from '../common/throttle';
import { ENV, type Env } from '../config/env';

const STATE_COOKIE = 'ss_oauth_state';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @AuthThrottle()
  @Post('register')
  @ApiOperation({ summary: 'Create a buyer or seller account' })
  @ApiZodBody(registerSchema)
  async register(
    @Body(zodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.register(body);
    setAuthCookies(res, tokens, this.env);
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiZodBody(loginSchema)
  async login(@Body(zodPipe(loginSchema)) body: LoginInput, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(body);
    setAuthCookies(res, tokens, this.env);
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @AuthThrottle()
  @Post('demo')
  @HttpCode(200)
  @ApiOperation({ summary: 'One-click login as the seeded demo buyer, seller or admin' })
  @ApiZodBody(demoLoginSchema)
  async demo(
    @Body(zodPipe(demoLoginSchema)) body: DemoLoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.demoLogin(body.role);
    setAuthCookies(res, tokens, this.env);
    return { user, accessToken: tokens.accessToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token cookie and get a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const { user, tokens } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
      setAuthCookies(res, tokens, this.env);
      return { user, accessToken: tokens.accessToken };
    } catch (e) {
      // Only clear cookies this request actually carried; a stale request with no cookie
      // must not log out a session that was just created in another request.
      if (req.cookies?.[REFRESH_COOKIE]) clearAuthCookies(res, this.env);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.env);
    return { ok: true };
  }

  @Public()
  @Get('session')
  @ApiOperation({
    summary: 'Current session for the web app: never 401s, tells the client whether a refresh is possible',
  })
  async session(@CurrentUser() user: JwtUser | undefined, @Req() req: Request) {
    if (user) {
      try {
        return { user: await this.auth.me(user.sub), canRefresh: false };
      } catch {
        /* banned or deleted */
      }
    }
    return { user: null, canRefresh: !!req.cookies?.[REFRESH_COOKIE] };
  }

  @Get('me')
  @ApiOperation({ summary: 'The logged-in user' })
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.sub);
  }

  @Post('password')
  @HttpCode(200)
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @CurrentUser() user: JwtUser,
    @Body(zodPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user.sub, body.currentPassword, body.newPassword);
    clearAuthCookies(res, this.env);
    return { ok: true };
  }

  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'Which login methods are enabled' })
  providers() {
    return { google: this.googleEnabled, demo: this.env.DEMO_MODE };
  }

  /* -------------------------------------------- Google OAuth (no Passport) */

  private get googleEnabled() {
    return !!(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET);
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Start Google sign-in (redirect)' })
  google(@Res() res: Response) {
    if (!this.googleEnabled) throw new ServiceUnavailableException('Google login is not configured');
    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.COOKIE_SECURE,
      maxAge: 600_000,
      path: '/',
    });
    const params = new URLSearchParams({
      client_id: this.env.GOOGLE_CLIENT_ID!,
      redirect_uri: this.env.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  @Public()
  @AuthThrottle()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const fail = (reason: string) =>
      res.redirect(`${this.env.WEB_URL}/login?error=${encodeURIComponent(reason)}`);
    if (!this.googleEnabled) return fail('google_disabled');
    if (!code || !state || state !== req.cookies?.[STATE_COOKIE]) return fail('invalid_state');
    res.clearCookie(STATE_COOKIE, { path: '/' });
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.env.GOOGLE_CLIENT_ID!,
          client_secret: this.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: this.env.GOOGLE_CALLBACK_URL,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) return fail('token_exchange_failed');
      const { access_token } = (await tokenRes.json()) as { access_token: string };
      const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${access_token}` },
      });
      const profile = (await profileRes.json()) as {
        sub: string;
        email: string;
        email_verified: boolean;
        name: string;
        picture?: string;
      };
      if (!profile.email_verified) return fail('email_not_verified');
      const { tokens } = await this.auth.loginWithGoogle(profile);
      setAuthCookies(res, tokens, this.env);
      return res.redirect(`${this.env.WEB_URL}/`);
    } catch {
      return fail('google_failed');
    }
  }
}
