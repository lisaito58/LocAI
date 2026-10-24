// デモ・動作確認用：関西各地のテスト農家（test-farmer6〜14）を追加し、出品を増やす
// 実行：npm run seed:farms → 写真を付けるには続けて npm run seed:photos
// - すべて架空の農園・自己申告の内容（実在の農家・商品ではありません）
// - アカウントがなければ作り、プロフィールは毎回この内容に更新する（住所・電話番号は架空のまま変えない）。パスワードは環境変数 DEMO_PASSWORD（必須。未設定なら DB に触れる前に止まる）
// - 出品は実行するたびに追加する（既存の出品・注文は変更しない）。説明に「テストデータ」と入れて区別する
// - 万願寺唐辛子は産地・価格・大きさ・送料が違う出品を複数用意し、比べて選べるようにする
//   （受付期限4日後・回答の最終期限5日後・受け渡し6／7／9日後の標準の期限。デモ台本の入力値で申し込める）
import { requireDemoPassword } from "./load-env";
import { dbNow } from "../src/lib/domain/tx";
import { prisma } from "../src/lib/prisma";
import { createSeedListing, seedAccounts, type FarmerSeed } from "./seed-lib";

const PASSWORD = requireDemoPassword();
const H = (days: number, hours = 0) => days * 24 + hours;
const NEAR: [number, number, number, number] = [600, 800, 1000, 1400]; // 大阪に近い産地
const FAR: [number, number, number, number] = [900, 1100, 1400, 1900]; // 遠めの産地
const KANSAI = ["大阪府", "京都府", "兵庫県", "滋賀県", "奈良県", "和歌山県"];

const farmers: FarmerSeed[] = [
  {
    email: "test-farmer6@locai.example",
    name: "テスト農家6",
    joinedDaysAgo: 400,
    profile: {
      farmName: "テスト万願寺農園 舞鶴",
      prefecture: "京都府",
      city: "舞鶴市",
      mainItems: "万願寺唐辛子、ピーマン",
      commitment:
        "万願寺唐辛子の発祥といわれる舞鶴で、祖父の代から3代続けて万願寺唐辛子を育てています（自己申告）。肉厚でやわらかく、種が少ないものを選んで出荷しています。朝に収穫して、その日のうちに箱詰めします。",
      introduction:
        "京都府舞鶴市で、万願寺唐辛子を中心に育てている家族の農園です。祖父の代から続く畑で、肉厚でやわらかい実を選んで出荷しています。朝に収穫したものをその日のうちに箱詰めするので、焼き物や炊いたんにそのまま使っていただけます。はじめてのお店には、少量のお試しセットもご用意しています。",
      responseGuide: "当日中に返信します",
      availableWeekdays: "月・火・水・木・金・土",
      trialDailyLimit: 3,
    },
    listings: [
      { itemName: "万願寺唐辛子", description: "1本15〜20cmの大きめ中心。焼き物・天ぷらに。", selfDeclaredFeatures: "肉厚でやわらかく、辛みがほとんどありません（自己申告）。", sizeLabel: "大きめ", price: 1700, totalKg: 25, minKg: 1, stepKg: 0.5, graceHours: 24, trial: { setKg: 0.5, priceYen: 400, count: 3 } },
      { itemName: "ピーマン", description: "肉詰め・炒め物に。", sizeLabel: "中くらい", price: 600, totalKg: 10, minKg: 1, stepKg: 1, graceHours: 12, acceptHours: 30, responseHours: 44 },
    ],
  },
  {
    email: "test-farmer7@locai.example",
    name: "テスト農家7",
    joinedDaysAgo: 120,
    profile: {
      farmName: "テスト里山ファーム 綾部",
      prefecture: "京都府",
      city: "綾部市",
      mainItems: "万願寺唐辛子、かぼちゃ、しょうが",
      commitment:
        "山あいの小さな畑で、少量ずつ多品目を育てています。形が曲がったものや小さいものも味は同じなので、訳ありとして手頃な値段でお分けしています（自己申告）。草刈りや収穫はすべて手作業です。",
      introduction:
        "京都府綾部市の里山で、夫婦二人で野菜を育てています。万願寺唐辛子は、曲がりや小さめの「訳あり」を中心に、手頃な値段で出品しています。刻んで使う料理やまかないにも気軽に使っていただけたらうれしいです。",
      responseGuide: "翌朝までに返信します",
      availableWeekdays: "月・水・金・土",
    },
    listings: [
      { itemName: "万願寺唐辛子", description: "訳あり（曲がり・小さめ）。刻んで使う料理やじゃこ炒めに。", selfDeclaredFeatures: "形は不揃いですが、味は通常品と同じです（自己申告）。", sizeLabel: "小さめ", price: 1100, totalKg: 8, minKg: 0.5, stepKg: 0.5, graceHours: 24, saleTargetHours: H(2, 12), feeYen: FAR },
      { itemName: "かぼちゃ", description: "1玉1.5〜2kg。煮物・ポタージュに。収穫後2週間追熟しています。", sizeLabel: "大きめ", price: 400, totalKg: 30, minKg: 2, stepKg: 1, graceHours: 48, acceptHours: H(6), responseHours: H(7), feeYen: FAR },
      { itemName: "しょうが", description: "ひね生姜。薬味・煮魚に。", price: 1600, totalKg: 6, minKg: 0.5, stepKg: 0.5, graceHours: 24, acceptHours: H(2, 2), responseHours: H(3), feeYen: FAR },
    ],
  },
  {
    email: "test-farmer8@locai.example",
    name: "テスト農家8",
    joinedDaysAgo: 25,
    profile: {
      farmName: "テスト由良川農園 福知山",
      prefecture: "京都府",
      city: "福知山市",
      mainItems: "万願寺唐辛子、ほうれん草、長ねぎ",
      commitment:
        "由良川沿いの、水はけのよい砂まじりの畑を使っています。就農2年目で、地元の先輩農家に教わりながら育てています（自己申告）。農園での引き取りにも対応しています。",
      introduction:
        "京都府福知山市で、就農2年目の農園です。由良川沿いの畑で、万願寺唐辛子や葉物を育てています。まだ量は多くありませんが、ご希望の量や受け取り方法に、できるだけ合わせます。近くのお店は農園での引き取りもできます。",
      responseGuide: "半日以内に返信します",
      availableWeekdays: "火・木・土・日",
    },
    listings: [
      { itemName: "万願寺唐辛子", description: "中くらい中心。焼きびたし・炒め物に。宅配と引き取りを選べます。", sizeLabel: "中くらい", price: 1400, totalKg: 15, minKg: 1, stepKg: 1, graceHours: 24, pickup: true },
      { itemName: "ほうれん草", description: "おひたし・ソテーに。根元の赤い部分も甘いです。", price: 900, totalKg: 6, minKg: 0.5, stepKg: 0.5, graceHours: 12, acceptHours: 20, responseHours: 36 },
      { itemName: "長ねぎ", description: "白い部分が長めの根深ねぎ。鍋・焼きねぎに。", price: 700, totalKg: 12, minKg: 1, stepKg: 1, graceHours: 24, acceptHours: H(4) },
    ],
  },
  {
    email: "test-farmer9@locai.example",
    name: "テスト農家9",
    joinedDaysAgo: 600,
    profile: {
      farmName: "テスト京丹波オーガニック農園",
      prefecture: "京都府",
      city: "船井郡京丹波町",
      mainItems: "万願寺唐辛子、黒枝豆",
      commitment:
        "農薬と化学肥料を使わずに育てています（自己申告。有機JASなどの認証は取得していません）。落ち葉と米ぬかの堆肥で土をつくり、虫は手で取っています。そのぶん量は少なめです。",
      introduction:
        "京都府京丹波町の山あいで、農薬と化学肥料を使わずに野菜を育てています（自己申告・認証なし）。落ち葉と米ぬかで土をつくり、ゆっくり育てた万願寺唐辛子は、香りが強いと言っていただくことが多いです。量は少なめですが、素材にこだわるお店に届けたいと思っています。",
      responseGuide: "当日中に返信します",
      availableWeekdays: "月・火・水・木・金",
    },
    listings: [
      { itemName: "万願寺唐辛子", description: "大きめ中心。素材の味を生かす料理に。", selfDeclaredFeatures: "農薬・化学肥料を使っていません（自己申告・認証なし）。", sizeLabel: "大きめ", price: 1900, totalKg: 10, minKg: 0.5, stepKg: 0.5, graceHours: 24 },
      { itemName: "黒枝豆", description: "枝付き。旬の終わりの少量出荷です。", price: 2100, totalKg: 5, minKg: 0.5, stepKg: 0.5, graceHours: 12, acceptHours: 30, responseHours: 44 },
    ],
  },
  {
    email: "test-farmer10@locai.example",
    name: "テスト農家10",
    joinedDaysAgo: 200,
    profile: {
      farmName: "テスト湖西農園 高島",
      prefecture: "滋賀県",
      city: "高島市",
      mainItems: "万願寺唐辛子、キャベツ、ブロッコリー、れんこん",
      commitment:
        "比良山系からの伏流水が流れる、琵琶湖の西側の畑です。冬の冷え込みで葉物の甘みが増すと言われています（自己申告）。京都・大阪へは朝に発送し、翌日のお届けが目安です。",
      introduction:
        "滋賀県高島市、琵琶湖の西側で野菜を育てている農園です。山からの水が豊かな土地で、キャベツやブロッコリー、れんこんなどを育てています。万願寺唐辛子は京都の産地から苗を分けてもらい、数年前から育てています。",
      responseGuide: "当日中に返信します",
      availableWeekdays: "月・火・水・木・金・土",
      trialDailyLimit: 2,
    },
    listings: [
      { itemName: "万願寺唐辛子", description: "中くらい。焼き物・揚げびたしに。", sizeLabel: "中くらい", price: 1350, totalKg: 12, minKg: 1, stepKg: 0.5, graceHours: 24, feeYen: FAR, ratePrefectures: KANSAI },
      { itemName: "キャベツ", description: "1玉1.2〜1.5kg。千切り・ロールキャベツに。", sizeLabel: "大きめ", price: 220, totalKg: 40, minKg: 5, stepKg: 2.5, graceHours: 48, acceptHours: H(5), responseHours: H(6), feeYen: FAR, ratePrefectures: KANSAI },
      { itemName: "ブロッコリー", description: "茎までやわらかく、付け合わせ・炒め物に。", price: 800, totalKg: 10, minKg: 1, stepKg: 0.5, graceHours: 24, acceptHours: H(3), trial: { setKg: 0.5, priceYen: 300, count: 3 }, feeYen: FAR, ratePrefectures: KANSAI },
      { itemName: "れんこん", description: "泥付き。きんぴら・はさみ揚げに。", price: 900, totalKg: 10, minKg: 1, stepKg: 1, graceHours: 24, acceptHours: H(4), feeYen: FAR, ratePrefectures: KANSAI },
    ],
  },
  {
    email: "test-farmer11@locai.example",
    name: "テスト農家11",
    joinedDaysAgo: 15,
    profile: {
      farmName: "テスト大和高原ファーム 宇陀",
      prefecture: "奈良県",
      city: "宇陀市",
      mainItems: "万願寺唐辛子、ほうれん草、レタス",
      commitment:
        "標高約400mの大和高原の畑です。朝晩の冷え込みが強く、葉物がゆっくり育つので、葉が厚く甘みがあると感じています（自己申告）。今年から新しく参加しました。",
      introduction:
        "奈良県宇陀市の大和高原で、葉物を中心に育てている農園です。今年からこのアプリに参加しました。高原の涼しい気候で育てたほうれん草やレタスと、少量ですが小ぶりの万願寺唐辛子もお届けします。",
      responseGuide: "翌朝までに返信します",
      availableWeekdays: "火・木・土",
    },
    listings: [
      { itemName: "万願寺唐辛子", description: "小ぶりで、丸ごと素揚げに使いやすい大きさです。", sizeLabel: "小さめ", price: 1250, totalKg: 6, minKg: 0.5, stepKg: 0.5, graceHours: 24, feeYen: FAR, ratePrefectures: KANSAI },
      { itemName: "ほうれん草", description: "葉が厚めの冬どり。おひたし・胡麻和えに。", price: 850, totalKg: 8, minKg: 0.5, stepKg: 0.5, graceHours: 24, acceptHours: H(2), feeYen: FAR, ratePrefectures: KANSAI },
      { itemName: "レタス", description: "サラダ・サンドイッチに。", price: 450, totalKg: 10, minKg: 1, stepKg: 1, graceHours: 12, acceptHours: 26, responseHours: 40, feeYen: FAR, ratePrefectures: KANSAI },
    ],
  },
  {
    email: "test-farmer12@locai.example",
    name: "テスト農家12",
    joinedDaysAgo: 300,
    profile: {
      farmName: "テスト泉州ファーム 貝塚",
      prefecture: "大阪府",
      city: "貝塚市",
      mainItems: "水なす、玉ねぎ、キャベツ",
      commitment:
        "泉州の砂質の畑で、水なす・玉ねぎ・キャベツを育てています。水なすは皮が薄く、生のまま浅漬けにできるやわらかさを目指しています（自己申告）。大阪市内のお店には朝どれを当日中に届けることもできます。",
      introduction:
        "大阪府貝塚市、泉州で野菜を育てている農園です。泉州の水なすや玉ねぎ、キャベツなど、大阪の地元野菜をお届けしています。大阪市内から近いので、送料も抑えめに設定しています。",
      responseGuide: "半日以内に返信します",
      availableWeekdays: "月・火・水・木・金・土",
    },
    listings: [
      { itemName: "水なす", description: "秋の最終収穫。浅漬け・サラダに。", selfDeclaredFeatures: "皮が薄く、生でも食べられるやわらかさです（自己申告）。", price: 1200, totalKg: 5, minKg: 0.5, stepKg: 0.5, graceHours: 12, acceptHours: 8, responseHours: 22, saleTargetHours: 20, feeYen: NEAR, ratePrefectures: KANSAI },
      { itemName: "玉ねぎ", description: "泉州の貯蔵玉ねぎ。カレー・炒め物・スープに。", sizeLabel: "中くらい", price: 280, totalKg: 40, minKg: 5, stepKg: 5, graceHours: 24, acceptHours: H(5), feeYen: NEAR, ratePrefectures: KANSAI },
      { itemName: "キャベツ", description: "泉州キャベツ。葉がやわらかく、生食向き。", sizeLabel: "中くらい", price: 200, totalKg: 30, minKg: 5, stepKg: 2.5, graceHours: 24, acceptHours: H(3), feeYen: NEAR, ratePrefectures: KANSAI },
    ],
  },
  {
    email: "test-farmer13@locai.example",
    name: "テスト農家13",
    joinedDaysAgo: 90,
    profile: {
      farmName: "テスト紀ノ川ファーム",
      prefecture: "和歌山県",
      city: "紀の川市",
      mainItems: "しょうが、じゃがいも、ブロッコリー",
      commitment:
        "紀の川沿いの温暖な畑で、しょうがやじゃがいもを育てています。しょうがは収穫後に土付きのまま保管し、乾燥しすぎないようにしています（自己申告）。",
      introduction:
        "和歌山県紀の川市で、しょうがや根菜を育てている農園です。紀の川沿いの温暖な気候を生かして、香りの強いしょうがと、ほくほくしたじゃがいもをお届けします。",
      responseGuide: "当日中に返信します",
      availableWeekdays: "月・水・金",
    },
    listings: [
      { itemName: "しょうが", description: "土付き。薬味・甘酢漬け・ジンジャーシロップに。", price: 1500, totalKg: 8, minKg: 0.5, stepKg: 0.5, graceHours: 24, acceptHours: H(4), feeYen: FAR, ratePrefectures: KANSAI },
      { itemName: "じゃがいも", description: "男爵系。コロッケ・ポテトサラダに。", sizeLabel: "混在", price: 300, totalKg: 30, minKg: 3, stepKg: 1, graceHours: 48, acceptHours: H(6), responseHours: H(7), feeYen: FAR, ratePrefectures: KANSAI },
      { itemName: "ブロッコリー", description: "付け合わせ・温野菜に。", price: 750, totalKg: 8, minKg: 1, stepKg: 0.5, graceHours: 24, acceptHours: H(2), feeYen: FAR, ratePrefectures: KANSAI },
    ],
  },
  {
    email: "test-farmer14@locai.example",
    name: "テスト農家14",
    joinedDaysAgo: 500,
    profile: {
      farmName: "テスト淡路島ファーム",
      prefecture: "兵庫県",
      city: "淡路市",
      mainItems: "玉ねぎ、レタス、かぼちゃ",
      commitment:
        "淡路島の潮風が当たる畑で、玉ねぎを中心に育てています。収穫した玉ねぎは吊るして乾燥させ、甘みが乗るのを待ってから出荷しています（自己申告）。",
      introduction:
        "兵庫県淡路市の農園です。淡路島で玉ねぎを中心に、レタスやかぼちゃも育てています。吊るして乾燥させた玉ねぎは、炒めると甘みが出やすいと言っていただいています。",
      responseGuide: "当日中に返信します",
      availableWeekdays: "月・火・水・木・金・土",
    },
    listings: [
      { itemName: "玉ねぎ", description: "吊るし乾燥の貯蔵玉ねぎ。オニオンスープ・炒め物に。", sizeLabel: "大きめ", price: 350, totalKg: 50, minKg: 5, stepKg: 5, graceHours: 24, acceptHours: H(7), responseHours: H(8), ratePrefectures: KANSAI },
      { itemName: "レタス", description: "シャキッとした食感。サラダに。", price: 420, totalKg: 12, minKg: 1, stepKg: 1, graceHours: 24, acceptHours: H(3), ratePrefectures: KANSAI },
      { itemName: "かぼちゃ", description: "ほくほく系。煮物・天ぷらに。", price: 380, totalKg: 25, minKg: 2, stepKg: 1, graceHours: 48, acceptHours: H(5), responseHours: H(6), ratePrefectures: KANSAI },
    ],
  },
];

// アカウントがなければ作る（出品はこの後で追加するので、ここでは空にする）
await seedAccounts({ password: PASSWORD, dataLabel: "テストデータ", farmers: farmers.map((f) => ({ ...f, listings: [] })), restaurants: [] });

const now = await dbNow(prisma);
let n = 0;
for (const f of farmers) {
  if (!f.email.startsWith("test-") || !f.email.endsWith("@locai.example")) continue;
  const farmer = await prisma.farmerProfile.findFirst({ where: { user: { email: f.email } } });
  if (!farmer) continue;
  await prisma.farmerProfile.update({ where: { id: farmer.id }, data: f.profile });
  for (const l of f.listings) {
    await createSeedListing(farmer.id, l, "テストデータ", now);
    n++;
  }
  console.log(`+ ${f.profile.farmName}：出品${f.listings.length}件を追加`);
}
console.log(`\n完了：出品を ${n} 件追加しました（既存の出品・注文は変更していません）。写真は npm run seed:photos で付けます。`);
process.exit(0);
