import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { LlmService } from './llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { indexProductEmbeddings } from './embedding-indexer';

/** Keeps product embeddings fresh after products are created or edited. */
@Injectable()
export class EmbeddingIndexer {
  private readonly logger = new Logger(EmbeddingIndexer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** Fire-and-forget: never blocks or fails the request that changed the product. */
  schedule(productIds: string[]) {
    setImmediate(() => {
      this.index(productIds).catch((e) =>
        this.logger.warn(`Embedding index failed: ${(e as Error).message}`),
      );
    });
  }

  index(productIds?: string[]) {
    return indexProductEmbeddings(this.prisma, this.embeddings, productIds);
  }
}

@Global()
@Module({
  providers: [LlmService, EmbeddingService, EmbeddingIndexer],
  exports: [LlmService, EmbeddingService, EmbeddingIndexer],
})
export class AiModule {}
