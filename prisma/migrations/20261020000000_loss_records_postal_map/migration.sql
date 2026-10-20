-- CreateEnum
CREATE TYPE "LossStatus" AS ENUM ('IN_USE', 'DONE');

-- CreateEnum
CREATE TYPE "LossMethod" AS ENUM ('RATIO', 'DIRECT');

-- AlterTable
ALTER TABLE "RestaurantProfile" ADD COLUMN     "postalCode" TEXT;

-- AlterTable
ALTER TABLE "FarmerProfile" ADD COLUMN     "mapVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "postalCode" TEXT;

-- CreateTable
CREATE TABLE "LossRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "LossStatus" NOT NULL,
    "method" "LossMethod",
    "ratioQuarters" INTEGER,
    "receivedGrams" INTEGER NOT NULL,
    "wasteGrams" INTEGER,
    "approximate" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LossRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LossRecord_orderId_key" ON "LossRecord"("orderId");

-- CreateIndex
CREATE INDEX "LossRecord_restaurantId_idx" ON "LossRecord"("restaurantId");

-- AddForeignKey
ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "RestaurantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ロス記録のルール（DBでも守る）：受取量は正、廃棄量は0以上・受取量以下、割合ボタンは0〜4、確定した記録は廃棄量が必須
ALTER TABLE "LossRecord" ADD CONSTRAINT "LossRecord_amount_check"
  CHECK ("receivedGrams" > 0 AND ("wasteGrams" IS NULL OR ("wasteGrams" >= 0 AND "wasteGrams" <= "receivedGrams"))
    AND ("ratioQuarters" IS NULL OR "ratioQuarters" BETWEEN 0 AND 4)
    AND ("status" <> 'DONE' OR "wasteGrams" IS NOT NULL));
