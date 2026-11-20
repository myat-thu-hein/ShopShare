import { expect, test } from '@playwright/test';

test('home page shows the AI search and trending products @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Say what you’re shopping for');
  await expect(page.getByRole('search').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trending this week' })).toBeVisible();
});

test('natural-language search shows removable chips', async ({ page }) => {
  await page.goto('/search?q=' + encodeURIComponent('red running shoes under 2000 baht for wide feet'));
  const chip = page.getByRole('button', { name: 'Remove filter: Red' });
  await expect(chip).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sports Sneakers Off White & Red' }).first()).toBeVisible();
  await chip.click();
  await expect(page).toHaveURL(/ignore=colours%3Ared/);
  await expect(page.getByRole('button', { name: 'Remove filter: Red' })).toHaveCount(0);
});

test('product page is server-rendered with structured data', async ({ page }) => {
  await page.goto('/p/sports-sneakers-off-white-red');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sports Sneakers Off White & Red');
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd!)).toMatchObject({ '@type': 'Product', offers: { priceCurrency: 'THB' } });
});

test('demo buyer can add to cart and check out', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Demo buyer/ }).click();
  await page.waitForURL('/');
  // Pick a product that is still in stock (earlier runs may have bought the last unit of others).
  const list = await (await page.request.get('/api/products?inStock=true&sort=popular&limit=40')).json();
  let slug = '';
  for (const item of list.items as { slug: string }[]) {
    const p = await (await page.request.get(`/api/products/${item.slug}`)).json();
    const options = p.variants as { stock: number }[];
    if (options.length <= 1 && p.stock >= 2) {
      slug = item.slug;
      break;
    }
  }
  expect(slug, 'an in-stock product without size/colour choices').not.toBe('');
  await page.goto(`/p/${slug}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();
  await page.goto('/cart', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Check out' }).click();
  // Mock mode stays on our site; with Stripe keys this goes to checkout.stripe.com.
  await page.waitForURL(/checkout\/success|checkout\.stripe\.com/);
  if (page.url().includes('/checkout/success')) {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/confirmed/i);
  }
});

test('protected pages redirect to login, and the demo seller reaches the dashboard', async ({ page }) => {
  await page.goto('/seller');
  await expect(page).toHaveURL(/\/login\?next=%2Fseller/);
  await page.getByRole('button', { name: /Demo seller/ }).click();
  await page.waitForURL('**/seller');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Low stock' })).toBeVisible();
});

test('assistant answers with links to real products', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Ask ShopShare/ }).click();
  await page.getByLabel('Message').fill('waterproof watch');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Shopping assistant' }).getByRole('link').first(),
  ).toBeVisible();
});
