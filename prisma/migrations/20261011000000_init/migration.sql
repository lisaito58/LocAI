-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RESTAURANT', 'FARMER');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('SHIPPING', 'HAND_DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "PaymentTiming" AS ENUM ('PREPAID', 'ON_HANDOVER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CREDIT_CARD', 'PAYPAY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_RESPONSE', 'AWAITING_REAGREEMENT', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('AWAITING_PAYMENT', 'BUYER_REPORTED', 'FARMER_CONFIRMED');

-- CreateEnum
CREATE TYPE "CostMemoKind" AS ENUM ('ACTUAL', 'SIMULATION');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "defaultBudgetYen" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RestaurantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "farmName" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "introduction" TEXT,
    "responseGuide" TEXT,
    "availableWeekdays" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FarmerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "selfDeclaredFeatures" TEXT,
    "unitPriceYenPerKg" INTEGER NOT NULL,
    "totalGrams" INTEGER NOT NULL,
    "soldGrams" INTEGER NOT NULL DEFAULT 0,
    "heldGrams" INTEGER NOT NULL DEFAULT 0,
    "minOrderGrams" INTEGER NOT NULL,
    "orderStepGrams" INTEGER NOT NULL,
    "responseGraceMinutes" INTEGER NOT NULL,
    "acceptDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "responseDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "publishRound" INTEGER NOT NULL DEFAULT 1,
    "copiedFromListingId" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPhoto" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "publishRound" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "takenOn" DATE NOT NULL,
    "selfTakenConfirmed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOption" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "method" "DeliveryMethod" NOT NULL,
    "paymentTiming" "PaymentTiming" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "prepayDeadlineAt" TIMESTAMPTZ(3),
    "paymentConfirmGuideHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "deliveryOptionId" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "minGramsExclusive" INTEGER NOT NULL,
    "maxGramsInclusive" INTEGER NOT NULL,
    "feeYen" INTEGER NOT NULL,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSlot" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "deliveryOptionId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "capacity" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_RESPONSE',
    "idempotencyKey" TEXT NOT NULL,
    "quantityGrams" INTEGER NOT NULL,
    "heldGrams" INTEGER NOT NULL,
    "deadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "purchaseConfirmByAt" TIMESTAMPTZ(3) NOT NULL,
    "useDate" DATE NOT NULL,
    "budgetYen" INTEGER,
    "scheduleSlotId" TEXT NOT NULL,
    "snapItemName" TEXT NOT NULL,
    "snapUnitPriceYenPerKg" INTEGER NOT NULL,
    "snapMinOrderGrams" INTEGER NOT NULL,
    "snapOrderStepGrams" INTEGER NOT NULL,
    "snapDeliveryMethod" "DeliveryMethod" NOT NULL,
    "snapPrefecture" TEXT NOT NULL,
    "snapShippingRates" JSONB NOT NULL,
    "snapScheduleStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "snapScheduleEndsAt" TIMESTAMPTZ(3),
    "snapPaymentTiming" "PaymentTiming" NOT NULL,
    "snapPaymentMethod" "PaymentMethod" NOT NULL,
    "snapPaymentDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "snapPaymentConfirmGuideHours" INTEGER NOT NULL,
    "itemSubtotalYen" INTEGER NOT NULL,
    "shippingFeeYen" INTEGER NOT NULL,
    "totalYen" INTEGER NOT NULL,
    "needsDiscussion" BOOLEAN NOT NULL DEFAULT false,
    "needsDiscussionBy" TEXT,
    "needsDiscussionAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderChangeProposal" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "newQuantityGrams" INTEGER NOT NULL,
    "newScheduleSlotId" TEXT NOT NULL,
    "newShippingFeeYen" INTEGER NOT NULL,
    "exceptionFeeReason" TEXT,
    "newItemSubtotalYen" INTEGER NOT NULL,
    "newTotalYen" INTEGER NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OrderChangeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingInquiry" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
    "primaryOrderId" TEXT,
    "convertedOrderId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ListingInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InquiryMessage" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InquiryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "firstReportedAt" TIMESTAMPTZ(3),
    "lastReportedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "farmerSentAt" TIMESTAMPTZ(3),
    "farmerSentBy" TEXT,
    "buyerReceivedAt" TIMESTAMPTZ(3),
    "buyerReceivedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FulfillmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordCorrection" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostMemo" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" "CostMemoKind" NOT NULL,
    "quantityGrams" INTEGER,
    "itemSubtotalYen" INTEGER,
    "receivedShippingYen" INTEGER,
    "actualShippingYen" INTEGER,
    "packingYen" INTEGER,
    "otherSalesCostYen" INTEGER,
    "marketItemName" TEXT,
    "marketGrams" INTEGER,
    "marketAmountYen" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CostMemo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantProfile_userId_key" ON "RestaurantProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerProfile_userId_key" ON "FarmerProfile"("userId");

-- CreateIndex
CREATE INDEX "Listing_status_acceptDeadlineAt_idx" ON "Listing"("status", "acceptDeadlineAt");

-- CreateIndex
CREATE INDEX "Listing_farmerId_idx" ON "Listing"("farmerId");

-- CreateIndex
CREATE INDEX "ListingPhoto_listingId_publishRound_idx" ON "ListingPhoto"("listingId", "publishRound");

-- CreateIndex
CREATE INDEX "DeliveryOption_listingId_idx" ON "DeliveryOption"("listingId");

-- CreateIndex
CREATE INDEX "ShippingRate_deliveryOptionId_prefecture_idx" ON "ShippingRate"("deliveryOptionId", "prefecture");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_deliveryOptionId_prefecture_minGramsExclusive_key" ON "ShippingRate"("deliveryOptionId", "prefecture", "minGramsExclusive");

-- CreateIndex
CREATE INDEX "ScheduleSlot_listingId_startsAt_idx" ON "ScheduleSlot"("listingId", "startsAt");

-- CreateIndex
CREATE INDEX "Order_listingId_status_idx" ON "Order"("listingId", "status");

-- CreateIndex
CREATE INDEX "Order_restaurantId_status_idx" ON "Order"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Order_farmerId_status_idx" ON "Order"("farmerId", "status");

-- CreateIndex
CREATE INDEX "Order_status_deadlineAt_idx" ON "Order"("status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_idempotencyKey_key" ON "Order"("restaurantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderChangeProposal_orderId_key" ON "OrderChangeProposal"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderMessage_orderId_createdAt_idx" ON "OrderMessage"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListingInquiry_convertedOrderId_key" ON "ListingInquiry"("convertedOrderId");

-- CreateIndex
CREATE INDEX "ListingInquiry_listingId_idx" ON "ListingInquiry"("listingId");

-- CreateIndex
CREATE INDEX "ListingInquiry_restaurantId_idx" ON "ListingInquiry"("restaurantId");

-- CreateIndex
CREATE INDEX "InquiryMessage_inquiryId_createdAt_idx" ON "InquiryMessage"("inquiryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_orderId_key" ON "PaymentRecord"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentRecord_orderId_key" ON "FulfillmentRecord"("orderId");

-- CreateIndex
CREATE INDEX "RecordCorrection_orderId_createdAt_idx" ON "RecordCorrection"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "CostMemo_farmerId_createdAt_idx" ON "CostMemo"("farmerId", "createdAt");

-- CreateIndex
CREATE INDEX "CostMemo_orderId_idx" ON "CostMemo"("orderId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantProfile" ADD CONSTRAINT "RestaurantProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerProfile" ADD CONSTRAINT "FarmerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "FarmerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPhoto" ADD CONSTRAINT "ListingPhoto_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOption" ADD CONSTRAINT "DeliveryOption_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_deliveryOptionId_fkey" FOREIGN KEY ("deliveryOptionId") REFERENCES "DeliveryOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_deliveryOptionId_fkey" FOREIGN KEY ("deliveryOptionId") REFERENCES "DeliveryOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "RestaurantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "FarmerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_scheduleSlotId_fkey" FOREIGN KEY ("scheduleSlotId") REFERENCES "ScheduleSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderChangeProposal" ADD CONSTRAINT "OrderChangeProposal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingInquiry" ADD CONSTRAINT "ListingInquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingInquiry" ADD CONSTRAINT "ListingInquiry_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "RestaurantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingInquiry" ADD CONSTRAINT "ListingInquiry_primaryOrderId_fkey" FOREIGN KEY ("primaryOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingInquiry" ADD CONSTRAINT "ListingInquiry_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryMessage" ADD CONSTRAINT "InquiryMessage_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "ListingInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentRecord" ADD CONSTRAINT "FulfillmentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordCorrection" ADD CONSTRAINT "RecordCorrection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostMemo" ADD CONSTRAINT "CostMemo_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "FarmerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostMemo" ADD CONSTRAINT "CostMemo_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 在庫・数量を守るデータベースのルール（CHECK制約）
-- 販売確定量＋有効な仮押さえ量が出品総量を超えない
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_stock_check"
  CHECK ("soldGrams" >= 0 AND "heldGrams" >= 0 AND "soldGrams" + "heldGrams" <= "totalGrams");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_quantity_check"
  CHECK ("totalGrams" > 0 AND "minOrderGrams" > 0 AND "orderStepGrams" > 0 AND "unitPriceYenPerKg" > 0 AND "responseGraceMinutes" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_amount_check"
  CHECK ("quantityGrams" > 0 AND "heldGrams" >= 0 AND "heldGrams" <= "quantityGrams"
    AND "itemSubtotalYen" >= 0 AND "shippingFeeYen" >= 0 AND "totalYen" = "itemSubtotalYen" + "shippingFeeYen");
-- 仮押さえが残るのは回答待ち・条件変更の確認待ちだけ
ALTER TABLE "Order" ADD CONSTRAINT "Order_hold_status_check"
  CHECK ("heldGrams" = 0 OR "status" IN ('AWAITING_RESPONSE', 'AWAITING_REAGREEMENT'));
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_range_check"
  CHECK ("minGramsExclusive" >= 0 AND "maxGramsInclusive" > "minGramsExclusive" AND "feeYen" >= 0);
-- 日程枠の件数制限を超えない
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_capacity_check"
  CHECK ("usedCount" >= 0 AND ("capacity" IS NULL OR "usedCount" <= "capacity"));
