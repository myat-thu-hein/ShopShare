import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { updateOrderStatusSchema, type UpdateOrderStatusInput } from '@shopsense/shared';
import { OrdersService } from './orders.service';
import { CurrentUser, Roles, type JwtUser } from '../common/decorators';
import { ApiZodBody, zodPipe } from '../common/zod';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'My order history' })
  list(@CurrentUser() user: JwtUser, @Query('page') page?: string) {
    return this.orders.listForBuyer(user.sub, Math.max(1, Number(page) || 1));
  }

  @Get('checkout/:group')
  @ApiOperation({ summary: 'Orders created by one checkout (success page)' })
  byGroup(@CurrentUser() user: JwtUser, @Param('group') group: string) {
    return this.orders.byGroup(user.sub, group);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.orders.getForUser(user, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an unpaid order (releases reserved stock)' })
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.orders.cancelByBuyer(user.sub, id);
  }

  @Roles('SELLER')
  @Patch(':id/status')
  @ApiOperation({ summary: 'Seller/admin: move an order to SHIPPED, DELIVERED or CANCELLED' })
  @ApiZodBody(updateOrderStatusSchema)
  updateStatus(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(zodPipe(updateOrderStatusSchema)) body: UpdateOrderStatusInput,
  ) {
    return this.orders.updateStatus(user, id, body);
  }
}

@Module({ controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
