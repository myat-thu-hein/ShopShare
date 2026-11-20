import { useGuestCart } from '@/stores/guest-cart';

const item = {
  productId: 'p1',
  variantId: 'v1',
  title: 'Shoe',
  slug: 'shoe',
  unitPrice: 189000,
  imageUrl: null,
  variantLabel: 'red / Size 42',
  available: 3,
};

beforeEach(() => useGuestCart.getState().clear());

describe('guest cart', () => {
  it('merges duplicate lines and caps at available stock', () => {
    const cart = useGuestCart.getState();
    cart.add({ ...item, quantity: 2 });
    cart.add({ ...item, quantity: 5 });
    expect(useGuestCart.getState().items).toHaveLength(1);
    expect(useGuestCart.getState().items[0].quantity).toBe(3);
  });

  it('treats different variants as different lines and removes at 0', () => {
    const cart = useGuestCart.getState();
    cart.add({ ...item, quantity: 1 });
    cart.add({ ...item, variantId: 'v2', quantity: 1 });
    expect(useGuestCart.getState().items).toHaveLength(2);
    cart.setQuantity('p1', 'v1', 0);
    expect(useGuestCart.getState().items.map((i) => i.variantId)).toEqual(['v2']);
  });
});
