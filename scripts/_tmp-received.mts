import "./load-env";
import * as orders from "../src/lib/domain/orders";
import * as records from "../src/lib/domain/records";
import { prisma } from "../src/lib/prisma";
const shop = await prisma.user.findUniqueOrThrow({ where: { email: "test-shop1@locai.example" } });
const listing = await prisma.listing.findFirstOrThrow({
  where: { itemName: "トマト", status: "PUBLISHED", acceptDeadlineAt: { gt: new Date() }, farmer: { user: { email: "test-farmer3@locai.example" } } },
  include: { farmer: true, deliveryOptions: { where: { active: true }, include: { scheduleSlots: { orderBy: { startsAt: "asc" } } } } },
});
const opt = listing.deliveryOptions[0];
const r = await orders.createOrder(prisma, {
  restaurantUserId: shop.id, listingId: listing.id, deliveryOptionId: opt.id, scheduleSlotId: opt.scheduleSlots[0].id,
  quantityGrams: 2000, budgetYen: 100000, useDate: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
  purchaseConfirmByAt: new Date(Date.now() + 2 * 86400000), idempotencyKey: crypto.randomUUID(),
});
if (!r.ok) throw new Error(r.error);
const a = await orders.approveOrder(prisma, { orderId: r.orderId, farmerUserId: listing.farmer.userId });
if (!a.ok) throw new Error(a.error);
const rc = await records.markReceived(prisma, { orderId: r.orderId, userId: shop.id });
if (!rc.ok) throw new Error(rc.error);
console.log("ORDER", r.orderId, "LISTING", listing.id);
process.exit(0);
