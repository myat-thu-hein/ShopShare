import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.module';

function setup() {
  const prisma = {
    webhookEvent: { create: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}) },
    order: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
  };
  const orders = {
    markGroupPaid: jest.fn().mockResolvedValue({ updated: 1 }),
    cancelGroupPending: jest.fn(),
  };
  const event = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        payment_status: 'paid',
        metadata: { checkoutGroup: 'g1' },
        payment_intent: 'pi_1',
      },
    },
  };
  const stripe = { enabled: true, constructEvent: jest.fn().mockReturnValue(event), refund: jest.fn() };
  const service = new PaymentsService(prisma as any, orders as any, stripe as any);
  return { service, prisma, orders, stripe };
}

describe('Stripe webhook handling', () => {
  it('rejects requests without a valid signature', async () => {
    const { service, stripe } = setup();
    await expect(service.handleWebhook(undefined, 'sig')).rejects.toBeInstanceOf(BadRequestException);
    stripe.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found');
    });
    await expect(service.handleWebhook(Buffer.from('{}'), 'bad')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks the checkout paid once', async () => {
    const { service, orders } = setup();
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({ received: true });
    expect(orders.markGroupPaid).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ provider: 'stripe', reference: 'cs_1', paymentIntentId: 'pi_1' }),
    );
  });

  it('acknowledges duplicate deliveries without processing them again (idempotent)', async () => {
    const { service, prisma, orders } = setup();
    prisma.webhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(orders.markGroupPaid).not.toHaveBeenCalled();
  });

  it('removes the event marker when processing fails so Stripe can retry', async () => {
    const { service, prisma, orders } = setup();
    orders.markGroupPaid.mockRejectedValue(new Error('db down'));
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(prisma.webhookEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt_1' } });
  });

  it('refunds a payment that arrives after the order was cancelled', async () => {
    const { service, prisma, orders, stripe } = setup();
    orders.markGroupPaid.mockResolvedValue({ updated: 0 });
    prisma.order.findMany.mockResolvedValue([{ total: 189000 }]);
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(stripe.refund).toHaveBeenCalledWith('pi_1', 189000);
  });
});
