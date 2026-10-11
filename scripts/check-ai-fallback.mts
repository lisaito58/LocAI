// AIが使えないとき（キーなし・通信失敗）でも、例外を出さずに空の結果を返すことの確認
// 実行：npm run check:ai-fallback
process.env.GEMINI_API_KEY = "";

const { explainCandidates, draftIntroduction } = await import("../src/lib/ai/gemini");

const reasons = await explainCandidates(
  { itemQuery: "賀茂茄子", itemMode: "EXACT", quantityKg: "1", budgetYen: 1000, useDate: "2026-10-20", purpose: null },
  [
    {
      id: "x",
      itemName: "賀茂茄子",
      farmArea: "京都府",
      description: null,
      selfDeclaredFeatures: null,
      sizeLabel: null,
      totalYenComputedByApp: 900,
      purchaseKgComputedByApp: "1",
      deliveryMethod: "宅配発送",
    },
  ],
);
const draft = await draftIntroduction({ farmName: "x", area: "x", mainItems: "x", commitment: "x" });
const ok = reasons.size === 0 && draft === null;
console.log(ok ? "✅ AI停止時も例外を出さず、AI説明なしとして扱える" : "❌ AI停止時の動きが想定と違います");
process.exit(ok ? 0 : 1);
