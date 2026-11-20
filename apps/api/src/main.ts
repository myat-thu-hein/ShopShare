import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Load apps/api/.env for local development (production platforms inject env vars directly).
const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

export async function createApp() {
  const env = loadEnv();
  // rawBody: Stripe signature verification needs the exact bytes Stripe sent.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: false,
  });
  app.setGlobalPrefix('api');
  app.set('trust proxy', env.TRUST_PROXY_HOPS); // real client IPs for rate limiting behind Vercel/Render
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.useStaticAssets(join(process.cwd(), env.UPLOAD_DIR), {
    prefix: '/api/uploads',
    maxAge: '30d',
    index: false,
  });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('ShopShare API')
    .setDescription(
      'Multi-vendor marketplace with AI search, recommendations and a shopping assistant.\n\n' +
        'Auth: call POST /api/auth/demo with {"role":"BUYER"} (or SELLER/ADMIN) — the response sets an httpOnly cookie, ' +
        'or copy `accessToken` into **Authorize**. Prices are integers in satang (฿1 = 100).',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Every route accepts a bearer token (cookies work too).
  for (const path of Object.values(document.paths)) {
    for (const op of Object.values(path) as { security?: unknown[] }[]) op.security = [{ bearer: [] }];
  }
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, withCredentials: true },
  });
  return { app, env };
}

async function bootstrap() {
  const { app, env } = await createApp();
  // No host = listen on IPv6 and IPv4. Binding only 0.0.0.0 breaks on machines (often Windows)
  // where "localhost" resolves to ::1 first.
  await app.listen(env.PORT);
  Logger.log(`🚀 API ready on http://localhost:${env.PORT}/api — docs at /api/docs`, 'Bootstrap');
}

if (require.main === module) {
  bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
