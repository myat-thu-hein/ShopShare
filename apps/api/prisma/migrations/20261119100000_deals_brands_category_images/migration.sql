
-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "compare_at_price" INTEGER;

