# ShopShare

A multi-vendor marketplace where shoppers describe what they want in their own words. Type **“red running shoes under 2000 baht for wide feet”** and ShopShare turns the sentence into filters, searches every store at once, and shows you what it understood as chips you can remove.

Built as a production-quality portfolio project: NestJS + Next.js 15 monorepo, PostgreSQL with pgvector, Redis, Stripe Checkout (test mode), and an AI layer that works with **OpenAI, Anthropic, any OpenAI-compatible API (e.g. free Gemini), or no API key at all**.

> **Screenshots:** run the app and capture your own (the product photos load from the DummyJSON CDN in your browser). Suggested shots:
>
> | Screen | File to add |
> | --- | --- |
> | Home: promo banner, flash deals, categories | `docs/screenshots/home.png` |
> | AI search with “We understood” chips | `docs/screenshots/search.png` |
> | Product page with AI review summary | `docs/screenshots/product.png` |
> | Shopping assistant chat | `docs/screenshots/assistant.png` |
> | Seller dashboard and AI description writer | `docs/screenshots/seller.png` |
> | Admin dashboard | `docs/screenshots/admin.png` |

--- | --- |
| ![Search](docs/screenshots/search.png) | ![Product](docs/screenshots/product.png) |
| **Shopping assistant (grounded in real data)** | **Seller dashboard** |
| ![Assistant](docs/screenshots/assistant.png) | ![Seller dashboard](docs/screenshots/seller-dashboard.png) |
| **AI description writer for sellers** | **Dark mode** |
| ![AI description](docs/screenshots/seller-ai-description.png) | ![Dark mode](docs/screenshots/home-dark.png) |

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Database](#database)
4. [Tech stack](#tech-stack)
5. [Quick start (Docker, one command)](#quick-start-docker-one-command)
6. [Local development](#local-development)
7. [Environment variables](#environment-variables)
8. [How the AI search works](#how-the-ai-search-works)
9. [Testing Stripe payments locally](#testing-stripe-payments-locally)
10. [Tests](#tests)
11. [Deployment (Vercel + Render + Neon + Upstash)](#deployment)
12. [Design decisions](#design-decisions)
13. [Project structure](#project-structure)
14. [Troubleshooting](#troubleshooting)

---

## Features

**Storefront**: rotating promo banners, Flash Deals with a midnight countdown and “sold” bars, discount badges with original prices, “1.2k sold” counters, category tiles, official-store showcase, delivery estimates and buyer guarantees.

**Buyers**: browse categories with filters (price, rating, colour, in stock) and sorting · natural-language AI search with removable “We understood” chips · product pages with variants (size/colour), gallery, similar products and an AI pros/cons summary of reviews · persistent cart (guest cart merges on login) · Stripe Checkout in THB · order history with status tracking · verified-purchase reviews · wishlist · “Recommended for you” built from views and purchases · AI shopping assistant chat.

**Sellers**: store page · product management with drafts, image upload (auto-resized) and variants · **“Generate description”** button (title + keywords + photo → description and tags) · orders for their items with ship (tracking number + email) / deliver / cancel-and-refund · dashboard with revenue chart, top products and low-stock alerts.

**Admins**: platform totals and revenue chart · approve/reject sellers · manage users (roles, bans) · manage categories · see which integrations are live.

**Platform**: JWT access + rotating refresh tokens in httpOnly cookies · Google login · role guards on API and routes · oversell-proof checkout (database transactions) · signed, idempotent Stripe webhooks · Redis caching and rate limiting · SSR product pages with metadata, JSON-LD and sitemap · responsive, dark mode, skeletons, empty states, keyboard and screen-reader friendly · Swagger docs at `/api/docs` · demo mode with one-click logins and 109 seeded products with real photos across 8 categories.

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js 15 app<br/>React 19 · TanStack Query · Zustand"]
  end

  subgraph Vercel["Vercel"]
    NEXT["Next.js server<br/>SSR / ISR pages<br/>middleware (route guard)<br/>/api/* rewrite proxy"]
  end

  subgraph Render["Render / Railway"]
    API["NestJS API<br/>auth · products · search · recommendations<br/>assistant · cart · orders · payments · reviews<br/>seller · admin"]
  end

  PG[("PostgreSQL 16<br/>+ pgvector<br/>(Neon / Supabase)")]
  REDIS[("Redis<br/>cache · sessions · rate limits<br/>(Upstash)")]
  STRIPE["Stripe Checkout<br/>+ webhooks"]
  LLM["LLM provider<br/>OpenAI / Anthropic / Gemini<br/>(optional)"]
  CDN["Cloudinary<br/>(optional)"]
  MAIL["Resend / SMTP<br/>(optional)"]

  UI -- "same-origin /api/* (httpOnly cookies)" --> NEXT
  NEXT -- "proxy + server-side fetch" --> API
  API --> PG
  API --> REDIS
  API -- "create session / refund" --> STRIPE
  STRIPE -- "signed webhook" --> API
  API -. "JSON-schema output, chat" .-> LLM
  API -.-> CDN
  API -.-> MAIL
  UI -- "redirect to pay" --> STRIPE
```

**Why the proxy?** The browser only ever talks to the Next.js domain. `/api/*` is rewritten to the NestJS API, so auth cookies are first-party. That avoids third-party-cookie problems when the web app (Vercel) and API (Render) live on different domains.

**Search pipeline:**

```mermaid
flowchart LR
  Q["“red running shoes under<br/>2000 baht for wide feet”"] --> P{LLM configured?}
  P -- yes --> L["LLM → JSON schema<br/>{category, colours, maxPrice, keywords…}"]
  P -- no / fails --> R["Rule-based parser"]
  L --> N["Normalise: only real categories,<br/>known colours, sane prices"]
  R --> N
  N --> C["Chips: Shoes · Running · Wide fit · Red · Under ฿2,000"]
  N --> F["SQL hard filters<br/>category, price, colour, size, stock"]
  F --> V["pgvector cosine<br/>similarity (HNSW)"]
  F --> K["Postgres full-text<br/>(GIN index)"]
  V --> RRF["Reciprocal Rank Fusion"]
  K --> RRF
  RRF --> OUT["Ranked results<br/>(cached in Redis 2 min)"]
```

---

## Database

All money is stored as **integers in satang** (฿1 = 100 satang).

```mermaid
erDiagram
  users ||--o| seller_profiles : "has store"
  users ||--o{ products : sells
  users ||--o| carts : owns
  users ||--o{ orders : places
  users ||--o{ reviews : writes
  users ||--o{ wishlists : saves
  users ||--o{ product_views : views
  categories ||--o{ products : groups
  products ||--o{ product_variants : "size/colour"
  products ||--o{ product_images : has
  products ||--o| product_embeddings : "vector(768)"
  products ||--o{ reviews : receives
  carts ||--o{ cart_items : contains
  cart_items }o--|| products : of
  cart_items }o--o| product_variants : option
  orders ||--o{ order_items : contains
  orders ||--o{ payments : "paid by"
  order_items }o--o| products : snapshot
  order_items }o--|| users : "sold by"

  users { text id PK  text email UK  text password_hash  enum role  text google_id UK  bool is_banned  bool is_demo }
  seller_profiles { text id PK  text user_id FK,UK  text store_name  text slug UK  enum status }
  categories { text id PK  text name  text slug UK }
  products { text id PK  text seller_id FK  text category_id FK  text slug UK  int price "satang"  int stock  enum status  text_arr tags  float rating_avg  int sales_count }
  product_variants { text id PK  text product_id FK  text size  text colour  int stock  int price "satang, optional" }
  product_images { text id PK  text product_id FK  text url  int position }
  product_embeddings { text product_id PK,FK  vector embedding "768 dims, HNSW"  text model  text content_hash }
  carts { text id PK  text user_id FK,UK }
  cart_items { text id PK  text cart_id FK  text product_id FK  text variant_id FK  int quantity }
  orders { text id PK  text number UK  text checkout_group  text buyer_id FK  enum status  int total "satang"  text stripe_session_id  timestamp expires_at }
  order_items { text id PK  text order_id FK  text product_id FK  text seller_id FK  text title  int unit_price "satang"  int quantity }
  payments { text id PK  text order_id FK  text provider  text provider_ref UK  int amount  text status }
  reviews { text id PK  text product_id FK  text user_id FK  int rating }
  wishlists { text id PK  text user_id FK  text product_id FK }
  product_views { text id PK  text user_id FK  text product_id FK  timestamp created_at }
  webhook_events { text id PK "Stripe event id"  text type }
```

Order lifecycle: `PENDING → PAID → SHIPPED → DELIVERED`, with `PENDING | PAID → CANCELLED` (stock is returned; paid orders are refunded through Stripe).

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo — `apps/web`, `apps/api`, `packages/shared` (Zod schemas, types, money + status helpers) |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui-style components on Radix, TanStack Query, Zustand, Recharts, next-themes |
| Backend | NestJS 11, Prisma 6 (Rust-free client + `pg` driver), Zod validation shared with the frontend, Swagger |
| Data | PostgreSQL 16 + pgvector (HNSW index) + full-text search, Redis (ioredis) |
| Payments | Stripe Checkout + webhooks, currency THB, test mode |
| Images | Cloudinary (CDN + on-the-fly resizing) or local disk with `sharp` resizing |
| AI | OpenAI, Anthropic, or any OpenAI-compatible API (Gemini, Groq, OpenRouter, Ollama) via env vars; free built-in fallbacks |
| Email | Resend or SMTP via Nodemailer (logged to console when neither is set) |
| Testing | Jest (API unit + e2e with Supertest), Vitest + Testing Library, Playwright |
| CI | GitHub Actions — lint, type-check, unit tests, API e2e on real Postgres/Redis, Playwright |

---

## Quick start (Docker, one command)

Requirements: Docker Desktop.

```bash
git clone https://github.com/<you>/shopsense.git
cd shopsense
docker compose up --build
```

1. Wait until the `api` container logs `API ready` (first run builds images, applies migrations and seeds demo data — a few minutes).
2. Open **http://localhost:3000** and click **Demo buyer**, **Demo seller** or **Demo admin** on the login page.
3. API docs: **http://localhost:4000/api/docs**.

Everything works without any API keys: payments run in mock mode, AI features use the built-in fallbacks, and emails are printed to the `api` logs. To enable real integrations, put keys in a root `.env` file (see [Environment variables](#environment-variables)) and run `docker compose up --build` again.

---

## Local development

Requirements: Node.js 20.11+ (22 recommended), pnpm 10 (`corepack enable`), Docker (for Postgres + Redis).

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Start Postgres (with pgvector) and Redis**
   ```bash
   docker compose up -d db redis
   ```
3. **Create env files**
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```
4. **Create the database schema and demo data**
   ```bash
   pnpm --filter @shopsense/shared build
   pnpm --filter @shopsense/api db:generate   # Prisma client (also runs automatically on pnpm install)
   pnpm db:deploy     # applies prisma/migrations
   pnpm db:seed       # demo accounts + 109 products + orders + reviews + embeddings
   ```
5. **Run both apps**
   ```bash
   pnpm dev
   ```
6. Open http://localhost:3000 (web) and http://localhost:4000/api/docs (API).

✅ **Checkpoint**: `curl http://127.0.0.1:4000/api/health` returns `{"status":"ok","db":"ok","redis":"ok",...}` and searching for “red running shoes under 2000 baht for wide feet” shows **Sports Sneakers Off White & Red** first.

Demo accounts (password `Demo1234!`): `buyer@shopsense.dev`, `seller@shopsense.dev`, `admin@shopsense.dev`. A pending store (`pim@shopsense.dev`) is waiting for admin approval.

Useful scripts:

| Command | What it does |
| --- | --- |
| `pnpm dev` | API (watch) + web (dev server) |
| `pnpm build` | Build everything |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript across the repo |
| `pnpm test` | Unit tests (shared, API, web) |
| `pnpm test:e2e` | API end-to-end tests (needs seeded DB) |
| `pnpm --filter @shopsense/web test:e2e` | Playwright browser tests (needs both apps running) |
| `pnpm db:migrate` | Create a new migration after editing `schema.prisma` |
| `pnpm db:seed` | Reset and re-seed demo data (**wipes the database**) |

---

## Environment variables

### API (`apps/api/.env`)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string (pgvector extension is created by the migration). |
| `REDIS_URL` | | `redis://localhost:6379` | Redis URL. Use `rediss://` for Upstash. The API still works if Redis is down (no cache). |
| `JWT_ACCESS_SECRET` | ✅ | — | 16+ chars. `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | ✅ | — | 16+ chars, different from the access secret. |
| `JWT_ACCESS_TTL` | | `15m` | Access token lifetime. |
| `JWT_REFRESH_TTL_DAYS` | | `7` | Refresh token lifetime. |
| `WEB_URL` | | `http://localhost:3000` | Public web URL (Stripe return URLs, emails, OAuth redirects). |
| `API_PUBLIC_URL` | | `http://localhost:4000` | Public API URL. |
| `CORS_ORIGINS` | | `http://localhost:3000` | Comma-separated allowed origins. |
| `COOKIE_SECURE` | | `false` | `true` in production (HTTPS). |
| `COOKIE_DOMAIN` | | — | Usually empty. |
| `TRUST_PROXY_HOPS` | | `1` | Proxies in front of the API. Use `2` for browser → Vercel → Render, so rate limits see real client IPs. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | — | Enables “Continue with Google”. |
| `GOOGLE_CALLBACK_URL` | | `http://localhost:3000/api/auth/google/callback` | Must point at the **web** domain (it is proxied). |
| `STRIPE_SECRET_KEY` | | — | `sk_test_…`. Empty = mock payments. |
| `STRIPE_WEBHOOK_SECRET` | | — | `whsec_…` from the Stripe CLI or dashboard. |
| `ORDER_EXPIRY_MINUTES` | | `35` | How long unpaid orders hold stock (min 31: Stripe's session minimum). |
| `CLOUDINARY_URL` | | — | `cloudinary://key:secret@cloud`. Empty = local disk in `UPLOAD_DIR`. |
| `LLM_PROVIDER` | | `auto` | `auto`, `openai`, `anthropic` or `none`. |
| `LLM_MODEL` | | `gpt-4o-mini` / `claude-haiku-4-5` | Model name for the chosen provider. |
| `OPENAI_API_KEY` | | — | OpenAI key, or the key of any OpenAI-compatible provider. |
| `OPENAI_BASE_URL` | | `https://api.openai.com/v1` | Change for Gemini/Groq/OpenRouter/Ollama. |
| `ANTHROPIC_API_KEY` | | — | Anthropic key. |
| `EMBEDDING_PROVIDER` | | `local` | `local` (free, offline) or `openai` (any OpenAI-compatible embeddings API). |
| `EMBEDDING_MODEL` | | `text-embedding-3-small` | Requested with `dimensions: 768`. |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` | | OpenAI values | Override if embeddings use a different provider. |
| `RESEND_API_KEY` | | — | Send email via Resend. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | | — | Send email via SMTP instead. |
| `EMAIL_FROM` | | `ShopShare <orders@shopsense.dev>` | Sender address. |
| `DEMO_MODE` | | `true` | Enables one-click demo logins. |
| `CACHE_TTL_SECONDS` | | `120` | Default Redis cache lifetime. |
| `THROTTLE_DISABLED` | | `false` | Turn rate limiting off (tests). |

### Web (`apps/web/.env.local`)

| Variable | Required | Description |
| --- | --- | --- |
| `API_URL` | ✅ | Where Next.js proxies `/api/*` and fetches SSR data, e.g. `https://shopsense-api.onrender.com`. **Read at build time** — redeploy after changing it. |
| `NEXT_PUBLIC_SITE_URL` | ✅ in prod | Public site URL for canonical links, Open Graph and the sitemap. |

### Free AI option (no paid credits)

Google Gemini has a free tier and an OpenAI-compatible endpoint:

```env
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_API_KEY=<key from https://aistudio.google.com/apikey>
LLM_MODEL=gemini-2.5-flash
# Optional neural embeddings (also free tier):
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=gemini-embedding-001
```

After switching embedding providers, re-index from the admin API: `POST /api/admin/reindex-embeddings` (or re-run `pnpm db:seed`).

With **no key at all**, every AI feature still works using deterministic fallbacks (rule-based query parser, built-in hashing embedder, template descriptions, keyword-based review summaries, rule-based assistant). The UI labels which engine produced each result.

---

## How the AI search works

1. **Understand.** The sentence goes to the LLM with a strict JSON schema (OpenAI `response_format: json_schema` / Anthropic forced tool call). The prompt lists the real category slugs, explains that prices are in baht, and asks for colours, sizes, a sort intent and 1–4 keywords. Output is validated with the same Zod schema the frontend uses. Without a key, or if the call fails or times out, a rule-based parser handles common phrasing (“under 2k”, “between 1000 and 3000 baht”, “size 42”, “cheapest”, colour words, “wide feet” → “wide fit”). Parses are cached in Redis for a day.
2. **Normalise.** Whatever came back is cleaned: unknown categories become `null`, colours are mapped to known colours (“crimson” → red), swapped price bounds are fixed. The LLM can never introduce a filter that matches nothing by accident.
3. **Show chips.** Each understood filter becomes a chip (`Shoes · Running · Wide fit · Red · Under ฿2,000`). Removing a chip re-runs the search with `ignore=colours:red` — the URL stays shareable.
4. **Filter.** Category, price, colour, size and stock are hard filters in SQL, with every value as a bound parameter.
5. **Rank (hybrid).** Two rankings run over the filtered set:
   - **Semantic:** the query is embedded (768 dims) and compared with product embeddings using pgvector cosine distance on an HNSW index. Results below 40% of the best match are dropped, so unrelated products don't pad the list.
   - **Keyword:** Postgres full-text search over title (weight A), tags (B) and description (C), on a GIN index.

   They are merged with **Reciprocal Rank Fusion** (`score = Σ 1 / (60 + rank)`), which rewards products that rank well in both without having to calibrate two different score scales.
6. **Cache.** Final results are cached in Redis for two minutes. Any product change invalidates search caches.

**Recommendations** reuse the same embeddings: “Similar products” = nearest neighbours of a product's vector. “Recommended for you” builds a taste vector, a weighted average of the embeddings of products the buyer viewed (weight fades over two weeks) and bought (weight 3), then finds the nearest products they haven't bought. Guests see trending products (views + 5× sales in the last 7 days).

**The assistant** retrieves products (the ones the shopper is looking at, plus hybrid-search matches for the message) and sends only those to the LLM as JSON, with pre-formatted prices. The model must cite products as `[[slug]]` markers. A post-processing guard then:
- turns markers into links **only** for products that were in the context (invented ones are deleted);
- replaces any `฿` amount that is not a real price, or a real difference between two prices, with “see the product page for the current price”.

So it cannot show a made-up product or price, even if the model hallucinates one.

---

## Testing Stripe payments locally

Without keys, checkout uses **mock payments**: the success page confirms the order and you still get stock reservation, order status changes and the confirmation email (in the API log). To test real Stripe Checkout:

1. Create a free Stripe account, stay in **Test mode**, and copy the secret key (`sk_test_…`) from **Developers → API keys** into `STRIPE_SECRET_KEY`.
2. Install the Stripe CLI: https://docs.stripe.com/stripe-cli
3. Log in and forward webhooks to the API:
   ```bash
   stripe login
   stripe listen --forward-to localhost:4000/api/payments/webhook \
     --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed
   ```
4. Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` and restart the API.
5. Log in as the demo buyer, add something to the cart and check out. Pay with test card **4242 4242 4242 4242**, any future expiry date, any CVC, any Thai address.
6. ✅ **Checkpoint**: the `stripe listen` window shows `checkout.session.completed → 200`, the success page switches to “Your order is confirmed”, the order appears as **Paid** for the buyer and under **To ship** for the seller.

Other test cards: `4000 0000 0000 9995` (declined), `4000 0025 0000 3155` (3-D Secure).

**Try idempotency:** `stripe events resend <evt_id>` — the API answers `{"received":true,"duplicate":true}` and nothing is processed twice.
**Try expiry:** `stripe trigger checkout.session.expired` (or abandon a checkout) — reserved stock goes back on sale.

---

## Tests

```bash
pnpm test          # 28 API unit tests, 9 web unit tests, shared-package tests
pnpm test:e2e      # 16 API end-to-end tests against real Postgres + Redis (seed first)
pnpm --filter @shopsense/web test:e2e   # 7 Playwright browser tests (apps running)
```

Highlights:
- **Overselling under concurrency**: 6 buyers race for the last 2 items; exactly 2 checkouts succeed and stock ends at 0.
- **Stripe webhook**: bad signatures are rejected, the same event delivered twice is processed once, and a failed processing run removes its marker so Stripe can retry.
- **Assistant grounding guard**: invented products and prices are removed.
- **LLM client**: OpenAI strict JSON schema and Anthropic forced tool calls (mocked `fetch`), with fallbacks on invalid output.
- **Auth**: role enforcement, refresh-token rotation, logout revocation.
- **Browser**: chip removal, SSR JSON-LD, demo login → cart → checkout, protected-route redirects, the assistant.

---

## Deployment

Free-tier friendly setup: **web on Vercel**, **API on Render** (or Railway), **Postgres on Neon** (or Supabase), **Redis on Upstash**.

### 1. Database — Neon

1. Create a project at https://neon.tech (choose a region near Singapore for Thai users).
2. Copy the **pooled** connection string, e.g. `postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
3. pgvector is available on Neon; the first migration runs `CREATE EXTENSION vector` for you.

*Supabase alternative:* Project → Settings → Database → connection string (use the session pooler, port 5432). Enable `vector` under Database → Extensions if it isn't already.

### 2. Redis — Upstash

1. Create a Redis database at https://upstash.com (same region).
2. Copy the `rediss://default:<password>@<host>:6379` URL into `REDIS_URL`.

### 3. Seed the production database (once, from your machine)

```bash
cd apps/api
DATABASE_URL="<neon url>" REDIS_URL="<upstash url>" pnpm exec prisma migrate deploy
DATABASE_URL="<neon url>" REDIS_URL="<upstash url>" pnpm db:seed
```

### 4. API — Render

1. Push the repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. `render.yaml` creates the `shopsense-api` service. (Or **New → Web Service** with the build/start commands from `render.yaml`.)
3. Fill in the environment variables:
   - `DATABASE_URL`, `REDIS_URL` from steps 1–2
   - `WEB_URL` = `https://<your-app>.vercel.app` (fill in after step 5; the first deploy can use a placeholder)
   - `API_PUBLIC_URL` = `https://shopsense-api.onrender.com`
   - `CORS_ORIGINS` = your Vercel URL
   - `GOOGLE_CALLBACK_URL` = `https://<your-app>.vercel.app/api/auth/google/callback`
   - optional: Stripe, Cloudinary (recommended — Render's disk is wiped on every deploy), AI keys, Resend
   - `JWT_*` secrets are generated by the blueprint; `COOKIE_SECURE=true` and `TRUST_PROXY_HOPS=2` are preset
4. Deploy. ✅ **Checkpoint**: `https://shopsense-api.onrender.com/api/health` returns `"status":"ok"`.

*Railway alternative:* New Project → Deploy from GitHub → set the root directory to the repo root, build command `corepack enable && pnpm install --frozen-lockfile --filter "@shopsense/api..." && pnpm --filter @shopsense/shared build && pnpm --filter @shopsense/api build`, start command `cd apps/api && pnpm exec prisma migrate deploy && node dist/main.js`, and the same variables.

> Render's free tier sleeps after 15 minutes idle; the first request then takes ~50 s. The web app's error page tells visitors to retry.

### 5. Web — Vercel

1. In Vercel: **Add New → Project**, import the repo.
2. Set **Root Directory** to `apps/web`. Vercel picks up `apps/web/vercel.json` (pnpm install + `vercel-build`, which builds the shared package first).
3. Environment variables:
   - `API_URL` = `https://shopsense-api.onrender.com`
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-app>.vercel.app`
4. Deploy, then put the final Vercel URL into the API's `WEB_URL`, `CORS_ORIGINS` and `GOOGLE_CALLBACK_URL`, and redeploy the API.
5. ✅ **Checkpoint**: open the site, click **Demo buyer**, and the account menu shows “Ploy Demo Buyer”. Logins work because cookies are set on the Vercel domain through the `/api` proxy.

> `API_URL` is baked in at build time (Next.js rewrites). If you change it, redeploy the web app.

### 6. Stripe webhook (production)

1. Stripe Dashboard (test mode) → **Developers → Webhooks → Add endpoint**.
2. URL: `https://shopsense-api.onrender.com/api/payments/webhook` (point it at the API directly).
3. Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
4. Copy the signing secret into the API's `STRIPE_WEBHOOK_SECRET` and redeploy.

### 7. Google login (optional)

Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** (Web application):
- Authorised JavaScript origin: `https://<your-app>.vercel.app`
- Authorised redirect URI: `https://<your-app>.vercel.app/api/auth/google/callback`

Put the client ID and secret into the API env. The Google button appears automatically.

---

## Demo catalogue and photos

The seed creates 6 stores and 109 products in 8 categories (electronics, fashion, shoes, bags & accessories, watches, beauty, home & kitchen, sports). Product photos are loaded from the free [DummyJSON](https://dummyjson.com) demo CDN (`cdn.dummyjson.com`), a placeholder dataset made for e-commerce prototypes; titles and brands follow the photos, while descriptions, baht prices, discounts and stock were written for ShopShare. Brand names belong to their owners and are used only to label the demo listings.

- Photos load directly in the visitor's browser, so nothing is stored in the repo. If the CDN is unreachable, a neutral placeholder is shown instead of a broken image.
- Stripe Checkout shows these photos on its payment page, because they are public HTTPS images.
- For a real store, sellers upload their own photos (Cloudinary or local storage) from the product form.

## Design decisions

Plain-language notes on the important choices:

- **Prices are integers (satang).** `0.1 + 0.2` is `0.30000000000000004` in JavaScript. Storing ฿19.99 as `1999` keeps every calculation exact; it's formatted only for display.
- **Stock can't be oversold.** Checkout reduces stock with a conditional update — “subtract 2 *only if* at least 2 are left” — for every cart line inside one database transaction. If any line fails, the whole checkout rolls back. Postgres locks each row while updating, so two shoppers racing for the last item can't both win (tested with concurrent requests).
- **Stock is reserved at checkout, not at payment.** Unpaid orders hold stock for 35 minutes. If Stripe reports the session expired, or a background sweep finds an old pending order, the stock is released. A payment that somehow arrives after release is automatically refunded rather than overselling.
- **One order per seller.** A cart with items from two stores becomes two orders paid in one Stripe session. Each seller ships and updates their own order without touching the other's.
- **Webhooks are verified and idempotent.** The raw request body is checked against Stripe's signature, and each event id is stored with a unique key before processing, so Stripe's automatic retries never double-process a payment.
- **Tokens live in httpOnly cookies.** JavaScript (and therefore XSS) can't read them. The 15-minute access token is refreshed with a 7-day refresh token that rotates on every use. Reusing an old refresh token logs out every session for that user (stolen-token protection), with a 30-second grace period so two tabs refreshing at once don't trip it.
- **Roles are enforced on the server.** Global NestJS guards check the JWT and `@Roles()` on every endpoint. The Next.js middleware and `RoleGate` only improve the experience (no flash of pages you can't use).
- **AI is optional and can't break the app.** Every AI call has a timeout, validates its output against a schema, and falls back to deterministic code. The assistant only sees real product data and a guard strips anything invented.
- **Free local embeddings by default.** The built-in embedder hashes words, word pairs and word fragments into 768 numbers. It's weaker than a neural model at meaning, but it's free, offline and good at shopping vocabulary (with a synonym table). Switching to OpenAI/Gemini embeddings is one env var plus a re-index; the column size never changes because we always request 768 dimensions.
- **Caching with clear invalidation.** Product pages, lists, search results and recommendations are cached in Redis. Any product, stock or review change clears the affected keys. If Redis is down, the API serves uncached responses instead of failing.
- **Shared Zod schemas.** The same schema validates a form in the browser and the request on the server, and generates the Swagger docs, so the three can't drift apart.
- **Rust-free Prisma client.** Prisma's TypeScript query engine with the `pg` driver means smaller deploys and faster cold starts on free hosting.

---

## Project structure

```
shopsense/
├── apps/
│   ├── api/                      NestJS API
│   │   ├── prisma/               schema, migrations, seed + demo image generator
│   │   ├── src/
│   │   │   ├── ai/               LLM client, embeddings, query parser, indexer
│   │   │   ├── auth/ users/      JWT + refresh rotation, Google OAuth, profile
│   │   │   ├── products/ categories/ uploads/
│   │   │   ├── search/ recommendations/ assistant/
│   │   │   ├── cart/ orders/ payments/   checkout, Stripe, webhooks
│   │   │   ├── reviews/ wishlist/ seller/ admin/ email/
│   │   │   └── common/           guards, decorators, Zod pipe, rate-limit storage, cache keys
│   │   └── test/                 end-to-end tests
│   └── web/                      Next.js app
│       ├── src/app/              routes (home, search, c, p, cart, checkout, orders, wishlist,
│       │                         store, seller/*, admin/*, login, register, profile, sitemap, robots)
│       ├── src/components/       UI kit, product card, assistant widget, product form, charts
│       ├── src/hooks/ stores/    session, cart (server + guest), wishlist, assistant state
│       ├── src/middleware.ts     protected routes
│       └── e2e/                  Playwright tests
├── packages/shared/              Zod schemas, DTO types, money, order status machine, search chips
├── docker-compose.yml            Postgres (pgvector) + Redis + API + web
├── render.yaml                   API blueprint
└── .github/workflows/ci.yml
```

---

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| `Invalid environment configuration … JWT_ACCESS_SECRET` | The API validates env on start. Copy `apps/api/.env.example` to `apps/api/.env`. |
| `@prisma/client did not initialize yet. Please run "prisma generate"` | The Prisma client hasn't been generated. Run `pnpm --filter @shopsense/api db:generate`, then retry. |
| `type "vector" does not exist` | The database lacks pgvector. Use the `pgvector/pgvector:pg16` image, Neon, or Supabase. |
| Homepage says “The catalogue is empty or the API is offline”, or the dev overlay shows `[serverGet] … fetch failed` | Next.js can't connect to the API. 1) Is the API running? Open http://127.0.0.1:4000/api/health. 2) If not, look at the API's terminal output for its startup error (missing `apps/api/.env`, database not running, migrations not applied). 3) Make sure `API_URL` in `apps/web/.env.local` is `http://127.0.0.1:4000`, then restart `pnpm dev`. |
| Login works but you're logged out on refresh (production) | `COOKIE_SECURE` must be `true` and you must browse via the Vercel URL (the `/api` proxy), not the Render URL. |
| Everyone shares one rate limit in production | Set `TRUST_PROXY_HOPS=2` on the API (Vercel → Render). |
| `Webhook signature verification failed` | `STRIPE_WEBHOOK_SECRET` doesn't match the `stripe listen` session or the dashboard endpoint. Each has its own secret. |
| Uploaded images disappear after a Render deploy | Render's disk is temporary. Set `CLOUDINARY_URL`. |
| Search results look odd after switching embedding provider | Re-index: `POST /api/admin/reindex-embeddings` as admin. |
| Pages show old data right after re-seeding | Next.js caches API responses for up to a few minutes. Restart `pnpm dev`/`next start` or wait. |

