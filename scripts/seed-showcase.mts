// デモ・動作確認用：テスト農家（test-farmer*@locai.example）のプロフィールを充実させ、期限がさまざまな出品を追加する
// 実行：npm run seed:showcase
// - すべて架空の農園・自己申告の内容（実在の農家・商品ではありません）
// - プロフィールは「主な品目」「栽培のこだわり」「紹介文」などを上書きする（住所・電話番号・パスワードは変えない）
// - test-farmer5 は紹介文を空にして、AIの紹介文下書きを試せるようにする
// - 出品は追加だけ（既存の出品・注文は変更しない）。説明に「テストデータ」と入れて区別する
import "./load-env";
import { dbNow } from "../src/lib/domain/tx";
import { prisma } from "../src/lib/prisma";
import { createSeedListing, type ListingSeed } from "./seed-lib";

type ProfileUpdate = { mainItems: string; commitment: string; introduction: string | null; responseGuide: string; availableWeekdays: string; trialDailyLimit?: number };

const H = (days: number, hours = 0) => days * 24 + hours;

const plan: Record<string, { profile: ProfileUpdate; listings: ListingSeed[] }> = {
  "test-farmer1@locai.example": {
    profile: {
      mainItems: "賀茂茄子、万願寺唐辛子、伏見甘長とうがらし、京水菜、金時にんじん、里芋",
      commitment:
        "標高300mの盆地で、昼夜の寒暖差を生かして育てています。堆肥は近所の牧場の牛ふんと落ち葉で毎年自分たちで作り、化学肥料は慣行の半分以下に抑えています（自己申告）。茄子は朝5時から収穫し、その日のうちに発送します。形が不揃いなものも味は同じなので、加工用として安くお分けしています。",
      introduction:
        "京都府南丹市の盆地で、京野菜を中心に育てている家族経営の農園です。昼と夜の寒暖差が大きい土地で、賀茂茄子や万願寺唐辛子をじっくり育てています。堆肥は近所の牧場の牛ふんと落ち葉から毎年手づくりしています。茄子は朝いちばんに収穫して、その日のうちに発送します。形が不揃いなものも味は変わらないので、煮物や揚げびたしなど加工用にもぜひご相談ください。",
      responseGuide: "当日中に返信します（収穫中の朝は遅れることがあります）",
      availableWeekdays: "月・火・水・木・金",
      trialDailyLimit: 3,
    },
    listings: [
      { itemName: "賀茂茄子", description: "朝どれ。田楽や揚げびたしに。1個300〜400gの大玉中心です。", selfDeclaredFeatures: "皮がやわらかく、加熱するととろっとした食感になります（農家の自己申告）。", sizeLabel: "大きめ", price: 950, totalKg: 25, minKg: 1, stepKg: 0.5, graceHours: 12, acceptHours: 5, responseHours: 20, saleTargetHours: 18 },
      { itemName: "伏見甘長とうがらし", description: "細長い甘とうがらし。焼き物・炊いたんに。", selfDeclaredFeatures: "辛みがほとんどなく、種ごと食べられます（自己申告）。", sizeLabel: "混在", price: 1300, totalKg: 6, minKg: 0.5, stepKg: 0.5, graceHours: 12, acceptHours: H(1, 2), responseHours: H(1, 20), pickup: true },
      { itemName: "京水菜", description: "株ごと出荷。サラダ・はりはり鍋に。", selfDeclaredFeatures: "シャキッとした歯ごたえが長持ちするよう、夕方に水をやっています（自己申告）。", price: 700, totalKg: 12, minKg: 1, stepKg: 1, graceHours: 24, acceptHours: H(3), trial: { setKg: 0.5, priceYen: 300, count: 4 } },
      { itemName: "金時にんじん", description: "お正月前に向けて早めに少量だけ。色が濃く甘みがあります。", selfDeclaredFeatures: "芯まで赤く、煮物に色が映えます（自己申告）。", sizeLabel: "中くらい", price: 1100, totalKg: 8, minKg: 1, stepKg: 0.5, graceHours: 24, acceptHours: H(7), responseHours: H(8) },
      { itemName: "里芋", description: "泥付き。煮っころがし・コロッケに。", sizeLabel: "混在", price: 600, totalKg: 20, minKg: 2, stepKg: 1, graceHours: 48, acceptHours: H(5), responseHours: H(6) },
    ],
  },
  "test-farmer2@locai.example": {
    profile: {
      mainItems: "九条ねぎ、聖護院かぶ、聖護院大根、壬生菜、白菜",
      commitment:
        "会社員を辞めて昨年から亀岡で就農しました。祖父の畑を受け継ぎ、九条ねぎは種を自家採種しています。農薬は病気が出たときだけ最小限にしています（自己申告）。まだ量は多くありませんが、少量の注文やお試しにも丁寧に対応します。",
      introduction:
        "京都府亀岡市で、昨年から就農した新米農家です。祖父から受け継いだ畑で、九条ねぎや聖護院かぶなどの京野菜を育てています。九条ねぎは種を自分で採って、毎年つないでいます。量はまだ多くありませんが、少量のご注文やお試しにも一つずつ丁寧に対応します。",
      responseGuide: "翌朝までに返信します",
      availableWeekdays: "火・木・土",
      trialDailyLimit: 2,
    },
    listings: [
      { itemName: "九条ねぎ", description: "青い部分が多い葉ねぎ。薬味・ねぎ焼きに。100g束でまとめています。", selfDeclaredFeatures: "自家採種の種から育てています（自己申告）。", price: 700, totalKg: 10, minKg: 0.5, stepKg: 0.5, graceHours: 12, acceptHours: 8, responseHours: 22, trial: { setKg: 0.5, priceYen: 250, count: 3 } },
      { itemName: "聖護院大根", description: "丸い京大根。炊いても煮崩れしにくいです。", sizeLabel: "大きめ", price: 450, totalKg: 30, minKg: 3, stepKg: 1, graceHours: 24, acceptHours: H(2), saleTargetHours: H(2, 12) },
      { itemName: "壬生菜", description: "漬物・おひたし・鍋に。ピリッとした香り。", price: 800, totalKg: 5, minKg: 0.5, stepKg: 0.5, graceHours: 24, acceptHours: H(6), responseHours: H(7) },
      { itemName: "白菜", description: "1玉2〜3kg。鍋・浅漬けに。", sizeLabel: "大きめ", price: 250, totalKg: 40, minKg: 5, stepKg: 2.5, graceHours: 48, acceptHours: H(8), responseHours: H(9) },
    ],
  },
  "test-farmer3@locai.example": {
    profile: {
      mainItems: "トマト、ミニトマト、きゅうり、玉ねぎ、大阪しろな、春菊、さつまいも",
      commitment:
        "能勢の山あいで、水はけのよい斜面の畑を使っています。トマトは水を控えめにして完熟まで木にならせてから収穫します（自己申告）。ハウスは使わず露地栽培なので、季節と天気で量が変わります。大阪のお店に近い産地として、朝採ったものを夕方までに届けることを目標にしています。",
      introduction:
        "大阪府能勢町の山あいで、露地栽培の野菜を育てているファームです。水はけのよい斜面の畑で、トマトは水を控えめにし、完熟まで待ってから収穫しています。ハウスを使わないので季節や天気で量が変わりますが、そのぶん旬の味をお届けします。大阪市内のお店に近い産地として、朝採った野菜を早く届けることを大切にしています。",
      responseGuide: "半日以内に返信します",
      availableWeekdays: "月・水・金・土",
    },
    listings: [
      { itemName: "ミニトマト", description: "赤と黄色のミックス。前菜・付け合わせに。", selfDeclaredFeatures: "完熟で収穫しています（自己申告）。", sizeLabel: "小さめ", price: 1400, totalKg: 6, minKg: 0.5, stepKg: 0.5, graceHours: 12, acceptHours: 6, responseHours: 18, saleTargetHours: 16 },
      { itemName: "玉ねぎ", description: "新玉ではなく貯蔵用。カレー・炒め物・スープに。", sizeLabel: "中くらい", price: 300, totalKg: 50, minKg: 5, stepKg: 5, graceHours: 24, acceptHours: H(1, 6), responseHours: H(2) },
      { itemName: "大阪しろな", description: "なにわ伝統野菜。おひたし・炊いたんに。", selfDeclaredFeatures: "葉がやわらかく、アクが少ないです（自己申告）。", price: 650, totalKg: 6, minKg: 0.5, stepKg: 0.5, graceHours: 12, acceptHours: H(2, 12), onHandoverShipping: true },
      { itemName: "春菊", description: "鍋用。葉が大きめで香りがよいです。", price: 900, totalKg: 5, minKg: 0.5, stepKg: 0.5, graceHours: 24, acceptHours: H(4), trial: { setKg: 0.5, priceYen: 350, count: 3 } },
      { itemName: "さつまいも", description: "紅はるか。収穫後に3週間寝かせて甘みを出しています。焼き芋・スイーツに。", selfDeclaredFeatures: "ねっとり系の品種です（自己申告）。", sizeLabel: "混在", price: 500, totalKg: 30, minKg: 2, stepKg: 1, graceHours: 48, acceptHours: H(7, 12), responseHours: H(8, 12) },
    ],
  },
  "test-farmer4@locai.example": {
    profile: {
      mainItems: "黒枝豆、丹波やまのいも、小松菜、ごぼう",
      commitment:
        "丹波篠山の粘土質の土で、黒枝豆と丹波やまのいもを育てています。黒枝豆は10月の短い旬にだけ出荷し、さやごとの枝付きで鮮度を保ちます（自己申告）。週末だけの兼業農家なので量は少なめですが、そのぶん一株ずつ手で収穫しています。",
      introduction:
        "兵庫県丹波篠山市で、週末に畑をしている兼業の農場です。粘土質の土で育てる黒枝豆と丹波やまのいもが自慢です。黒枝豆は10月の短い旬にだけ、枝付きで出荷します。量は少なめですが、一株ずつ手で収穫しています。",
      responseGuide: "2日以内に返信します（平日は夜に確認します）",
      availableWeekdays: "土・日",
      trialDailyLimit: 1,
    },
    listings: [
      { itemName: "黒枝豆", description: "旬の終わりの最終出荷。さや付き・枝付き。", selfDeclaredFeatures: "大粒でコクがあります（自己申告）。", price: 2000, totalKg: 4, minKg: 0.5, stepKg: 0.5, graceHours: 12, acceptHours: 4, responseHours: 16, saleTargetHours: 14 },
      { itemName: "丹波やまのいも", description: "粘りが強い丸いも。とろろ・お好み焼きに。", sizeLabel: "混在", price: 1800, totalKg: 6, minKg: 1, stepKg: 0.5, graceHours: 48, acceptHours: H(5), responseHours: H(7) },
      { itemName: "小松菜", description: "炒め物・おひたしに。", price: 550, totalKg: 6, minKg: 0.5, stepKg: 0.5, graceHours: 24, acceptHours: H(1, 12) },
      { itemName: "ごぼう", description: "泥付き。きんぴら・かき揚げに。", sizeLabel: "混在", price: 750, totalKg: 10, minKg: 1, stepKg: 1, graceHours: 48, acceptHours: H(6, 12), responseHours: H(8) },
    ],
  },
  // 出品なし・紹介文なし：AIの紹介文下書き（主な品目と栽培のこだわりから作る）を試す用
  "test-farmer5@locai.example": {
    profile: {
      mainItems: "丹後のブランド米の裏作で育てる冬野菜（キャベツ、ブロッコリー、ほうれん草）、間人の海沿いで育つ砂地の大根",
      commitment:
        "海から1kmの砂地の畑で、潮風に当たって甘みが増すと言われる冬野菜を育てています（自己申告）。田んぼの稲わらを畑にすき込み、土づくりをしています。収穫した野菜はその日のうちに選別し、葉の傷みが少ないものだけを出荷します。新しく参加したばかりなので、まずは少量からお店とつながりたいです。",
      introduction: null,
      responseGuide: "当日中に返信します",
      availableWeekdays: "月・火・水・木・金・土",
    },
    listings: [],
  },
};

const now = await dbNow(prisma);
let n = 0;
for (const [email, { profile, listings }] of Object.entries(plan)) {
  if (!email.startsWith("test-") || !email.endsWith("@locai.example")) continue;
  const farmer = await prisma.farmerProfile.findFirst({ where: { user: { email } } });
  if (!farmer) {
    console.log(`- ${email} がないので飛ばします（先に npm run seed:test）`);
    continue;
  }
  await prisma.farmerProfile.update({ where: { id: farmer.id }, data: profile });
  for (const l of listings) {
    await createSeedListing(farmer.id, l, "テストデータ", now);
    n++;
  }
  console.log(`+ ${farmer.farmName}：プロフィールを更新、出品${listings.length}件を追加`);
}
console.log(`\n完了：出品を ${n} 件追加しました（既存の出品・注文は変更していません）`);
process.exit(0);
