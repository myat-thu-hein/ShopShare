import {
  BadRequestException,
  Controller,
  Inject,
  Injectable,
  Logger,
  Module,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { v2 as cloudinary } from 'cloudinary';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ENV, type Env } from '../config/env';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Stores product images.
 * - Cloudinary when CLOUDINARY_URL is set (recommended in production: CDN + on-the-fly resizing).
 * - Otherwise local disk: sharp resizes to 1200px + a 400px thumbnail, served at /api/uploads.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  readonly useCloudinary: boolean;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.useCloudinary = !!env.CLOUDINARY_URL;
    if (this.useCloudinary) cloudinary.config({ secure: true }); // reads CLOUDINARY_URL from env
  }

  async saveImage(file: Express.Multer.File): Promise<{ url: string; publicId: string | null }> {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    if (!ALLOWED.includes(file.mimetype))
      throw new BadRequestException('Only JPEG, PNG, WebP or GIF images are allowed');

    // Validate it really is an image (not just a renamed file) before storing it anywhere.
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException('That file is not a valid image');
    }
    if (!meta.width || !meta.height) throw new BadRequestException('That file is not a valid image');

    if (this.useCloudinary) {
      const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: 'shopsense/products',
              resource_type: 'image',
              transformation: [{ width: 1600, crop: 'limit' }],
            },
            (err, res) => (err || !res ? reject(err ?? new Error('Upload failed')) : resolve(res)),
          )
          .end(file.buffer);
      });
      return { url: result.secure_url, publicId: result.public_id };
    }

    const dir = join(process.cwd(), this.env.UPLOAD_DIR, 'products');
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const image = sharp(file.buffer).rotate();
    await Promise.all([
      image
        .clone()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
        .then((b) => writeFile(join(dir, `${id}.webp`), b)),
      image
        .clone()
        .resize({ width: 400, height: 400, fit: 'cover' })
        .webp({ quality: 78 })
        .toBuffer()
        .then((b) => writeFile(join(dir, `${id}-sm.webp`), b)),
    ]);
    return { url: `/api/uploads/products/${id}.webp`, publicId: null };
  }
}

@ApiTags('products')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('images')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.uploads.saveImage(file);
  }
}

@Module({ controllers: [UploadsController], providers: [UploadsService], exports: [UploadsService] })
export class UploadsModule {}
