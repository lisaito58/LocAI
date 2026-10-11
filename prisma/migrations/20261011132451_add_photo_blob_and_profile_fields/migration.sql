-- AlterTable
ALTER TABLE "DeliveryOption" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "FarmerProfile" ADD COLUMN     "commitment" TEXT,
ADD COLUMN     "mainItems" TEXT,
ADD COLUMN     "paymentConfirmGuideHours" INTEGER;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "conditionNote" TEXT,
ADD COLUMN     "sizeLabel" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "hasConsultation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PhotoBlob" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "PhotoBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoBlob_photoId_key" ON "PhotoBlob"("photoId");

-- AddForeignKey
ALTER TABLE "PhotoBlob" ADD CONSTRAINT "PhotoBlob_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "ListingPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
