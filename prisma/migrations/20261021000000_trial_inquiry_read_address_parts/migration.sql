-- AlterTable
ALTER TABLE "RestaurantProfile" ADD COLUMN     "building" TEXT,
ADD COLUMN     "town" TEXT;

-- AlterTable
ALTER TABLE "FarmerProfile" ADD COLUMN     "building" TEXT,
ADD COLUMN     "town" TEXT,
ADD COLUMN     "trialDailyLimit" INTEGER;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "trialEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialSetCount" INTEGER,
ADD COLUMN     "trialSetGrams" INTEGER,
ADD COLUMN     "trialSetPriceYen" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "snapTrialSetPriceYen" INTEGER;

-- AlterTable
ALTER TABLE "ListingInquiry" ADD COLUMN     "farmerReadAt" TIMESTAMPTZ(3),
ADD COLUMN     "restaurantReadAt" TIMESTAMPTZ(3);


-- お試し販売の値のルール（DBでも守る）
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_trial_check"
  CHECK (("trialSetGrams" IS NULL OR "trialSetGrams" > 0) AND ("trialSetPriceYen" IS NULL OR "trialSetPriceYen" > 0)
    AND ("trialSetCount" IS NULL OR "trialSetCount" >= 0)
    AND ("trialEnabled" = false OR ("trialSetGrams" IS NOT NULL AND "trialSetPriceYen" IS NOT NULL AND "trialSetCount" IS NOT NULL)));
ALTER TABLE "FarmerProfile" ADD CONSTRAINT "FarmerProfile_trial_limit_check"
  CHECK ("trialDailyLimit" IS NULL OR "trialDailyLimit" BETWEEN 0 AND 100);

-- お試し注文の集計（店ごと・農家ごと）を速くする
CREATE INDEX "Order_farmerId_isTrial_idx" ON "Order"("farmerId", "isTrial");
