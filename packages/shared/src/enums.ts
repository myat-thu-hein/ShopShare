export const ROLES = ['BUYER', 'SELLER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const SELLER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const PRODUCT_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'rating', 'popular'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Colours the search parser and the product data both understand. */
export const KNOWN_COLOURS = [
  'black',
  'white',
  'grey',
  'red',
  'blue',
  'navy',
  'green',
  'yellow',
  'orange',
  'pink',
  'purple',
  'brown',
  'beige',
  'silver',
  'gold',
] as const;
