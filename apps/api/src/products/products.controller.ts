import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  productInputSchema,
  productQuerySchema,
  productUpdateSchema,
  type ProductInput,
  type ProductQuery,
  type ProductUpdateInput,
} from '@shopsense/shared';
import { ProductsService } from './products.service';
import { CurrentUser, Public, Roles, type JwtUser } from '../common/decorators';
import { ApiZodBody, ApiZodQuery, zodPipe } from '../common/zod';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse published products with filters, sorting and pagination' })
  @ApiZodQuery(productQuerySchema)
  list(@Query(zodPipe(productQuerySchema)) query: ProductQuery) {
    return this.products.list(query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Product detail (cached in Redis)' })
  bySlug(@Param('slug') slug: string) {
    return this.products.bySlug(slug);
  }

  @Public()
  @Post(':id/view')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a product view (feeds "Recommended for you")' })
  view(@Param('id') id: string, @CurrentUser() user?: JwtUser) {
    return this.products.recordView(id, user?.sub);
  }

  @Roles('SELLER')
  @Post()
  @ApiOperation({ summary: 'Create a product (seller)' })
  @ApiZodBody(productInputSchema)
  create(@CurrentUser() user: JwtUser, @Body(zodPipe(productInputSchema)) body: ProductInput) {
    return this.products.create(user, body);
  }

  @Roles('SELLER')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a product you own (seller) or any product (admin)' })
  @ApiZodBody(productUpdateSchema)
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(zodPipe(productUpdateSchema)) body: ProductUpdateInput,
  ) {
    return this.products.update(user, id, body);
  }

  @Roles('SELLER')
  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.products.remove(user, id);
  }
}
