import type { OrderStatus, ProductStatus, Role, SellerStatus } from './enums';
import type { ParsedSearch, ReviewSummary } from './schemas';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  sellerStatus: SellerStatus | null;
  sellerSlug: string | null;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  imageUrl: string | null;
  productCount?: number;
}

export interface ProductImageDto {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}

export interface ProductVariantDto {
  id: string;
  size: string | null;
  colour: string | null;
  sku: string | null;
  stock: number;
  price: number | null;
}

export interface ProductCardDto {
  id: string;
  slug: string;
  title: string;
  price: number;
  /** Original price (satang) when on sale. */
  compareAtPrice: number | null;
  brand: string | null;
  stock: number;
  salesCount: number;
  ratingAvg: number;
  ratingCount: number;
  imageUrl: string | null;
  category: { name: string; slug: string } | null;
  seller: { storeName: string; slug: string } | null;
  status?: ProductStatus;
}

export interface ProductDetailDto extends ProductCardDto {
  description: string;
  tags: string[];
  images: ProductImageDto[];
  variants: ProductVariantDto[];
  createdAt: string;
  sellerId: string;
}

export interface SearchChip {
  /** Stable id used to remove the chip, e.g. "colours:red" or "maxPrice". */
  id: string;
  label: string;
}

export interface SearchResultDto extends Paginated<ProductCardDto> {
  query: string;
  understood: ParsedSearch;
  chips: SearchChip[];
  /** Which parser produced `understood`. */
  parser: 'llm' | 'rules';
}

export interface CartItemDto {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  title: string;
  slug: string;
  imageUrl: string | null;
  variantLabel: string | null;
  available: number;
}

export interface CartDto {
  items: CartItemDto[];
  subtotal: number;
  itemCount: number;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  title: string;
  variantLabel: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  sellerId: string;
  productSlug: string | null;
}

export interface OrderDto {
  id: string;
  number: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  paidAt: string | null;
  trackingNumber: string | null;
  shippingAddress: Record<string, unknown> | null;
  items: OrderItemDto[];
  buyer?: { id: string; name: string; email: string };
}

export interface ReviewDto {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null };
}

export interface ReviewListDto extends Paginated<ReviewDto> {
  ratingAvg: number;
  ratingCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  canReview: boolean;
}

export type ReviewSummaryDto = ReviewSummary & { reviewCount: number; generatedBy: 'llm' | 'rules' };

export interface SellerStatsDto {
  revenue: number;
  orders: number;
  productsPublished: number;
  avgRating: number;
  revenueByDay: { date: string; revenue: number; orders: number }[];
  topProducts: { id: string; title: string; slug: string; unitsSold: number; revenue: number }[];
  lowStock: { id: string; title: string; slug: string; stock: number; variant: string | null }[];
}

export interface AdminStatsDto {
  users: number;
  buyers: number;
  sellers: number;
  orders: number;
  revenue: number;
  pendingSellers: number;
  products: number;
  revenueByDay: { date: string; revenue: number; orders: number }[];
}

export interface AssistantProductRef {
  id: string;
  slug: string;
  title: string;
  price: number;
  imageUrl: string | null;
}

export interface AssistantResponseDto {
  reply: string;
  products: AssistantProductRef[];
  generatedBy: 'llm' | 'rules';
}
