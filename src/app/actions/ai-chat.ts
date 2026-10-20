"use server";
// AI相談。ログイン中の本人だけが使える。AIは説明・提案だけで、注文・価格変更などは実行しない
import { answerChat, chatTurnsSchema, type ChatAnswer } from "@/lib/ai/chat";
import { allowAction, requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export type AiChatResult = { ok: true; answer: ChatAnswer } | { ok: false; error: string };

export async function askAiChat(turns: unknown): Promise<AiChatResult> {
  const user = await requireUser();
  const parsed = chatTurnsSchema.safeParse(turns);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await allowAction(user.id, "ai-chat", 8, 60)) || !(await allowAction(user.id, "ai-chat-day", 100, 86_400))) {
    return { ok: false, error: "AIへの質問が続いています。少し時間をおいてからもう一度お試しください。" };
  }
  try {
    const answer = await answerChat(prisma, { userId: user.id, role: user.role, turns: parsed.data });
    if (answer) return { ok: true, answer };
  } catch {
    // 入力内容や秘密情報はログに出さない
    console.warn("[ai-chat] 回答の作成に失敗しました");
  }
  return { ok: false, error: "AIの回答を取得できませんでした。時間をおいてもう一度試すか、よくある質問をご覧ください。" };
}
