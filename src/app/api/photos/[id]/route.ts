// 出品写真を返す。公開中・受付終了の出品は誰でも、それ以外は出品した本人だけ
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  const photo = await prisma.listingPhoto.findUnique({
    where: { id },
    select: {
      listing: { select: { status: true, farmer: { select: { userId: true } } } },
      blob: { select: { contentType: true, data: true } },
    },
  });
  if (!photo?.blob) return new Response("Not found", { status: 404 });
  if (photo.listing.status === "DRAFT") {
    const user = await getCurrentUser();
    if (user?.id !== photo.listing.farmer.userId) return new Response("Not found", { status: 404 });
  }
  return new Response(photo.blob.data, {
    headers: {
      "Content-Type": photo.blob.contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
