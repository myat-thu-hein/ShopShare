import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { updateProfileSchema, type UpdateProfileInput } from '@shopsense/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type JwtUser } from '../common/decorators';
import { ApiZodBody, zodPipe } from '../common/zod';
import { toAuthUser } from '../auth/auth.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async profile(@CurrentUser() user: JwtUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
      include: { sellerProfile: true, _count: { select: { orders: true, reviews: true, wishlist: true } } },
    });
    return { ...toAuthUser(u), createdAt: u.createdAt, counts: u._count };
  }

  @Patch('me')
  @ApiZodBody(updateProfileSchema)
  async update(@CurrentUser() user: JwtUser, @Body(zodPipe(updateProfileSchema)) body: UpdateProfileInput) {
    const u = await this.prisma.user.update({
      where: { id: user.sub },
      data: { name: body.name, avatarUrl: body.avatarUrl },
      include: { sellerProfile: true },
    });
    return toAuthUser(u);
  }
}
