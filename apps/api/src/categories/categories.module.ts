import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { categoryInputSchema, slugify, type CategoryDto, type CategoryInput } from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public, Roles } from '../common/decorators';
import { ApiZodBody, zodPipe } from '../common/zod';
import { CacheKeys } from '../common/cache-keys';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  list(): Promise<CategoryDto[]> {
    return this.redis.remember(CacheKeys.categories, 600, async () => {
      const rows = await this.prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: { where: { status: 'PUBLISHED' } } } } },
      });
      return rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        icon: c.icon,
        imageUrl: c.imageUrl,
        productCount: c._count.products,
      }));
    });
  }

  async bySlug(slug: string): Promise<CategoryDto> {
    const c = (await this.list()).find((x) => x.slug === slug);
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }

  async create(input: CategoryInput) {
    const slug = input.slug ?? slugify(input.name);
    if (await this.prisma.category.findUnique({ where: { slug } }))
      throw new ConflictException('Slug already exists');
    const c = await this.prisma.category.create({ data: { ...input, slug } });
    await this.redis.del(CacheKeys.categories);
    return c;
  }

  async update(id: string, input: Partial<CategoryInput>) {
    const c = await this.prisma.category.update({ where: { id }, data: input });
    await this.redis.del(CacheKeys.categories);
    return c;
  }

  async remove(id: string) {
    const count = await this.prisma.product.count({ where: { categoryId: id } });
    if (count > 0) throw new ConflictException(`Category still has ${count} products. Move them first.`);
    await this.prisma.category.delete({ where: { id } });
    await this.redis.del(CacheKeys.categories);
    return { ok: true };
  }
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  list() {
    return this.categories.list();
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.categories.bySlug(slug);
  }

  @Roles('ADMIN')
  @Post()
  @ApiZodBody(categoryInputSchema)
  create(@Body(zodPipe(categoryInputSchema)) body: CategoryInput) {
    return this.categories.create(body);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiZodBody(categoryInputSchema.partial())
  update(
    @Param('id') id: string,
    @Body(zodPipe(categoryInputSchema.partial())) body: Partial<CategoryInput>,
  ) {
    return this.categories.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}

@Module({ controllers: [CategoriesController], providers: [CategoriesService], exports: [CategoriesService] })
export class CategoriesModule {}
