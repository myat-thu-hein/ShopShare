import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { searchQuerySchema, type SearchQuery } from '@shopsense/shared';
import { SearchService } from './search.service';
import { CategoriesModule } from '../categories/categories.module';
import { Public } from '../common/decorators';
import { ApiZodQuery, zodPipe } from '../common/zod';
import { AiThrottle } from '../common/throttle';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @AiThrottle()
  @Get()
  @ApiOperation({
    summary: 'AI natural-language search',
    description:
      'e.g. q="red running shoes under 2000 baht for wide feet". Returns results plus the filters the AI understood (chips).',
  })
  @ApiZodQuery(searchQuerySchema)
  run(@Query(zodPipe(searchQuerySchema)) query: SearchQuery) {
    return this.search.search(query);
  }
}

@Module({
  imports: [CategoriesModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
