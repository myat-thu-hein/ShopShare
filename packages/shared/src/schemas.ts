import { z } from 'zod';
import { ORDER_STATUSES, PRODUCT_SORTS, PRODUCT_STATUSES, ROLES, SELLER_STATUSES } from './enums';

/* ----------------------------------------------------------------- auth */

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    email: z.email('Enter a valid email').transform((v) => v.toLowerCase()),
    password: z.string().min(8, 'Use at least 8 characters').max(128),
    role: z.enum(['BUYER', 'SELLER']).default('BUYER'),
    storeName: z.string().trim().min(2).max(80).optional(),
  })
  .refine((v) => v.role !== 'SELLER' || !!v.storeName, {
    message: 'Store name is required for sellers',
    path: ['storeName'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email('Enter a valid email').transform((v) => v.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const demoLoginSchema = z.object({ role: z.enum(ROLES) });
export type DemoLoginInput = z.infer<typeof demoLoginSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatarUrl: z.url().nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

/* ------------------------------------------------------------ categories */

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only')
    .optional(),
  description: z.string().max(300).optional(),
  icon: z.string().max(40).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/* -------------------------------------------------------------- products */

export const variantInputSchema = z.object({
  id: z.string().optional(),
  size: z.string().trim().max(20).nullish(),
  colour: z.string().trim().max(30).nullish(),
  sku: z.string().trim().max(60).nullish(),
  stock: z.number().int().min(0),
  /** Optional price for this variant, in satang. Falls back to the product price. */
  price: z.number().int().min(100).nullish(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productImageInputSchema = z.object({
  url: z.string().min(1),
  alt: z.string().max(200).optional(),
});

export const productInputSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(5000),
  /** Price in satang (integer). ฿1 minimum. */
  price: z.number().int().min(100, 'Minimum price is ฿1'),
  /** Original price in satang, shown crossed out. Must be higher than price. */
  compareAtPrice: z.number().int().min(100).nullish(),
  brand: z.string().trim().max(60).nullish(),
  /** Stock for products without variants. Ignored when variants are given. */
  stock: z.number().int().min(0).default(0),
  categoryId: z.string().min(1, 'Choose a category'),
  status: z.enum(PRODUCT_STATUSES).default('DRAFT'),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(15).default([]),
  images: z.array(productImageInputSchema).max(8).default([]),
  variants: z.array(variantInputSchema).max(50).default([]),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export const productUpdateSchema = productInputSchema.partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

const optionalNumber = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? undefined : v),
  z.coerce.number().optional(),
);
const optionalBool = z.preprocess(
  (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
  z.boolean().optional(),
);

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  category: z.string().optional(),
  /** satang */
  minPrice: optionalNumber,
  /** satang */
  maxPrice: optionalNumber,
  minRating: optionalNumber,
  inStock: optionalBool,
  sort: z.enum(PRODUCT_SORTS).default('newest'),
  q: z.string().max(200).optional(),
  seller: z.string().optional(),
  colour: z.string().optional(),
  /** Only products with a compare-at (sale) price. */
  onSale: optionalBool,
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

/* ---------------------------------------------------------------- search */

/** What the AI (or the rule-based fallback) understood from a sentence. */
export const parsedSearchSchema = z.object({
  category: z.string().nullable().default(null),
  colours: z.array(z.string()).default([]),
  /** baht, as a human would say it */
  maxPrice: z.number().nullable().default(null),
  minPrice: z.number().nullable().default(null),
  sizes: z.array(z.string()).default([]),
  /** Product words that should match (e.g. "running shoes", "wide fit"). */
  keywords: z.array(z.string()).default([]),
  sort: z.enum(PRODUCT_SORTS).nullable().default(null),
});
export type ParsedSearch = z.infer<typeof parsedSearchSchema>;

export const SEARCH_CHIP_KEYS = [
  'category',
  'colours',
  'maxPrice',
  'minPrice',
  'sizes',
  'keywords',
  'sort',
] as const;
export type SearchChipKey = (typeof SEARCH_CHIP_KEYS)[number];

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(300),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  /** Comma separated chip ids the user removed, e.g. "colours:red,maxPrice". */
  ignore: z.string().max(500).optional(),
  inStock: optionalBool,
  sort: z.enum(PRODUCT_SORTS).optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/* ------------------------------------------------------------------ cart */

export const addToCartSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullish(),
  quantity: z.number().int().min(1).max(99).default(1),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({ quantity: z.number().int().min(0).max(99) });

export const mergeCartSchema = z.object({ items: z.array(addToCartSchema).max(100) });
export type MergeCartInput = z.infer<typeof mergeCartSchema>;

/* ---------------------------------------------------------------- orders */

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  trackingNumber: z.string().max(80).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

/* --------------------------------------------------------------- reviews */

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(5, 'Tell other buyers a little more').max(2000),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/* ---------------------------------------------------------- seller/admin */

export const sellerProfileSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().nullish(),
  bannerUrl: z.string().nullish(),
});
export type SellerProfileInput = z.infer<typeof sellerProfileSchema>;

export const adminUpdateUserSchema = z.object({
  role: z.enum(ROLES).optional(),
  isBanned: z.boolean().optional(),
});

export const sellerApprovalSchema = z.object({ status: z.enum(SELLER_STATUSES) });

/* -------------------------------------------------------------------- AI */

export const generateDescriptionSchema = z.object({
  title: z.string().trim().min(3).max(140),
  keywords: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  imageUrl: z.string().optional(),
  categoryName: z.string().optional(),
});
export type GenerateDescriptionInput = z.infer<typeof generateDescriptionSchema>;

export const generatedDescriptionSchema = z.object({
  description: z.string(),
  tags: z.array(z.string()).max(12),
});
export type GeneratedDescription = z.infer<typeof generatedDescriptionSchema>;

export const reviewSummarySchema = z.object({
  summary: z.string(),
  pros: z.array(z.string()).max(6),
  cons: z.array(z.string()).max(6),
});
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

export const assistantRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
  /** Products the user is looking at right now (product page, compare list). */
  productIds: z.array(z.string()).max(4).optional(),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
