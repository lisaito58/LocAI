"use client";
// 住所の入力
//   郵便番号（任意）→「住所を検索」→ 候補を確認・選択
//   → 都道府県・市区町村（一覧から選ぶ）→ 町域（検索で入る。確認・修正できる）
//   → 番地など、住所の続き（必須）→ 建物名・部屋番号（任意）
// - 郵便番号で分かるのは町域まで。番地・建物名は本人が入力する。検索結果は住所の実在・配達可能の確認ではない
// - 検索で変えるのは「都道府県・市区町村・町域」だけ。番地・建物名の欄は変更しない
// - 対象地域は関西2府4県。登録済みの値が対象外・一覧外なら、消さずに選び直しを案内する
// - 検索が失敗しても、一覧から選んで手入力で登録を続けられる
import { useRef, useState } from "react";
import { FieldError } from "@/app/form-parts";
import { PrefectureSelect, ReqMark } from "@/components/fields";
import { MUNICIPALITIES } from "@/lib/data/municipalities";
import { isServicePrefecture, SERVICE_AREA_LABEL } from "@/lib/validation/listing";
import { checkPostal } from "@/lib/validation/postal";

type Candidate = { prefecture: string; city: string; town: string };
type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "choose"; results: Candidate[] }
  | { kind: "applied"; text: string; replacedTown: string | null; cityMissing: boolean; outOfArea: boolean }
  | { kind: "message"; tone: "info" | "error"; text: string };

export function AddressFields({
  initial,
  errors,
  prefectureHint,
  privateNote,
}: {
  initial?: { prefecture?: string; city?: string; town?: string; addressLine?: string; building?: string; postalCode?: string };
  errors?: Record<string, string[] | undefined>;
  prefectureHint?: string;
  privateNote?: string; // 町域・番地・建物名の公開範囲の説明
}) {
  const initialPrefOk = isServicePrefecture(initial?.prefecture);
  const [prefecture, setPrefecture] = useState(initialPrefOk ? initial!.prefecture! : "");
  const cities = MUNICIPALITIES[prefecture] ?? [];
  const initialCityValid = Boolean(initialPrefOk && initial?.city && (MUNICIPALITIES[initial.prefecture!] ?? []).includes(initial.city));
  const [city, setCity] = useState(initialCityValid ? initial!.city! : "");
  const [town, setTown] = useState(initial?.town ?? "");
  const stalePref = initial?.prefecture && !initialPrefOk ? initial.prefecture : null;
  const staleCity = !stalePref && initial?.city && !initialCityValid && prefecture === initial?.prefecture ? initial.city : null;
  const [postal, setPostal] = useState(initial?.postalCode ?? "");
  const [postalError, setPostalError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const seq = useRef(0); // 古い検索結果が後から返ってきても使わないための番号

  async function search() {
    const c = checkPostal(postal);
    if (!c.ok) {
      setPostalError(c.message);
      return;
    }
    setPostalError(null);
    setPostal(c.display);
    const my = ++seq.current;
    setLookup({ kind: "loading" });
    let body: { status: string; results?: Candidate[]; message?: string } | null = null;
    try {
      const res = await fetch(`/api/postal?code=${c.digits}`, { signal: AbortSignal.timeout(10_000) });
      body = await res.json();
    } catch (e) {
      body = { status: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "error" };
    }
    if (my !== seq.current) return; // もっと新しい検索がある
    switch (body?.status) {
      case "ok":
        if (body.results!.length === 1) apply(body.results![0]);
        else setLookup({ kind: "choose", results: body.results! });
        break;
      case "notfound":
        setLookup({ kind: "message", tone: "info", text: "この郵便番号に当てはまる住所が見つかりませんでした。番号を確認するか、下の欄に入力してください。" });
        break;
      case "timeout":
        setLookup({ kind: "message", tone: "error", text: "住所の検索に時間がかかっています。もう一度押すか、下の欄に入力してください。" });
        break;
      case "invalid":
        setLookup({ kind: "message", tone: "error", text: body.message ?? "郵便番号を確認してください。" });
        break;
      default:
        setLookup({ kind: "message", tone: "error", text: body?.message ?? "住所の検索サービスにつながりませんでした。下の欄に入力して登録を続けられます。" });
    }
  }

  function apply(r: Candidate) {
    const outOfArea = !isServicePrefecture(r.prefecture);
    if (outOfArea) {
      setLookup({ kind: "applied", text: `${r.prefecture}${r.city}${r.town}`, replacedTown: null, cityMissing: false, outOfArea: true });
      return;
    }
    const cityOk = (MUNICIPALITIES[r.prefecture] ?? []).includes(r.city);
    setPrefecture(r.prefecture);
    setCity(cityOk ? r.city : "");
    // 町域は検索結果で置き換える（前の値と混ざらないように）。番地・建物名の欄は変更しない
    const replaced = town.trim() && town.trim() !== r.town ? town.trim() : null;
    setTown(r.town);
    setLookup({ kind: "applied", text: `${r.prefecture}${r.city}${r.town}`, replacedTown: replaced, cityMissing: !cityOk, outOfArea: false });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 郵便番号から入力補助 */}
      <div className="flex flex-col gap-1">
        <label htmlFor="postalCode" className="label">
          郵便番号
          <ReqMark optional />
        </label>
        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-start">
          <input
            id="postalCode"
            name="postalCode"
            className="input min-[420px]:max-w-48"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="例：553-0003"
            value={postal}
            onChange={(e) => setPostal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            aria-invalid={Boolean(postalError) || undefined}
            aria-describedby="postal-hint"
          />
          <button type="button" onClick={search} disabled={lookup.kind === "loading"} className="btn-secondary">
            {lookup.kind === "loading" ? "検索中…" : "🔍 住所を検索"}
          </button>
        </div>
        <span id="postal-hint" className="hint">
          都道府県・市区町村・町域まで入ります。番地・建物名はご自身で入力してください。
        </span>
        <FieldError errors={postalError ? [postalError] : errors?.postalCode} />
        <div aria-live="polite">
          {lookup.kind === "choose" && (
            <fieldset className="mt-2 flex flex-col gap-2 rounded-2xl border-2 border-green-200 p-3">
              <legend className="label px-1">候補が{lookup.results.length}件あります。当てはまる住所を選んでください</legend>
              {lookup.results.map((r, i) => (
                <button key={i} type="button" onClick={() => apply(r)} className="btn-secondary justify-start text-left">
                  {r.prefecture}
                  {r.city}
                  {r.town}
                </button>
              ))}
            </fieldset>
          )}
          {lookup.kind === "applied" && lookup.outOfArea && (
            <p className="mt-2 rounded-2xl bg-[#fbf0e6] px-3 py-2 text-sm text-[#3d3a37]">
              「{lookup.text}」は対象地域外のため入力していません。対象は{SERVICE_AREA_LABEL}です。
            </p>
          )}
          {lookup.kind === "applied" && !lookup.outOfArea && (
            <div className="mt-2 flex flex-col gap-1 rounded-2xl bg-leaf-light/70 p-3 text-sm">
              <p>✅ 都道府県・市区町村・町域に「{lookup.text}」を入れました。下の欄で確認・修正できます。</p>
              {lookup.replacedTown && <p>町域を「{lookup.replacedTown}」から置き換えました。</p>}
              <p className="font-bold">番地・建物名の欄は変更していません。住所の続きを確認してください。</p>
              {lookup.cityMissing && <p className="font-bold text-amber-950">市区町村が一覧の表記と合わないため、一覧から選んでください。</p>}
            </div>
          )}
          {lookup.kind === "message" && (
            <p className={`mt-2 rounded-2xl px-3 py-2 text-sm ${lookup.tone === "error" ? "bg-red-50 text-red-900" : "bg-[#fbf0e6] text-[#3d3a37]"}`}>{lookup.text}</p>
          )}
        </div>
      </div>

      {/* 都道府県・市区町村（スマホは1列。PCは2列で上端をそろえる） */}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="prefecture" className="label">
            都道府県
            <ReqMark required />
          </label>
          <PrefectureSelect
            id="prefecture"
            name="prefecture"
            value={prefecture}
            onChange={(v) => {
              setPrefecture(v);
              if (!(MUNICIPALITIES[v] ?? []).includes(city)) setCity("");
            }}
          />
          <span className="hint">{prefectureHint ?? `対象地域は${SERVICE_AREA_LABEL}です`}</span>
          {stalePref && !prefecture && (
            <p className="text-sm font-bold text-amber-950">登録済みの「{stalePref}」は対象地域外です。関西の2府4県から選び直してください。</p>
          )}
          <FieldError errors={errors?.prefecture} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="city" className="label">
            市区町村
            <ReqMark required />
          </label>
          <select id="city" name="city" className="input" value={city} onChange={(e) => setCity(e.target.value)} disabled={!prefecture} required aria-invalid={Boolean(errors?.city) || undefined}>
            <option value="" disabled>
              {prefecture ? "選んでください" : "先に都道府県を選んでください"}
            </option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {staleCity && !city && (
            <div className="text-sm text-amber-950">
              <p className="font-bold">登録済みの市区町村を確認できません。一覧から選び直してください。</p>
              <details className="mt-1">
                <summary className="cursor-pointer">くわしく</summary>
                <p className="mt-1">登録済みの表記は「{staleCity}」です。郡がある町村は「〇〇郡〇〇町」のように郡名から始まる表記で一覧に出ます。</p>
              </details>
            </div>
          )}
          <FieldError errors={errors?.city} />
        </div>
      </div>

      {privateNote && <p className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-green-100">🔒 {privateNote}</p>}
      <div className="flex flex-col gap-1">
        <label htmlFor="town" className="label">
          町域
          <ReqMark optional />
        </label>
        <input id="town" name="town" className="input" value={town} onChange={(e) => setTown(e.target.value)} maxLength={50} placeholder="例：福島（郵便番号の検索で入ります）" />
        <span className="hint">郵便番号の検索で入る部分です。違っていれば直してください。ない場合は空欄で構いません。</span>
        <FieldError errors={errors?.town} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="addressLine" className="label">
          番地など、住所の続き
          <ReqMark required />
        </label>
        <input id="addressLine" name="addressLine" className="input" defaultValue={initial?.addressLine} required maxLength={100} placeholder="例：1丁目2-3" aria-describedby="addressLine-hint" />
        <span id="addressLine-hint" className="hint">
          郵便番号の検索だけでは住所は完成しません。丁目・番地・号などを入力してください。
        </span>
        <FieldError errors={errors?.addressLine} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="building" className="label">
          建物名・部屋番号
          <ReqMark optional />
        </label>
        <input id="building" name="building" className="input" defaultValue={initial?.building} maxLength={100} placeholder="例：みかんビル1階" />
        <span className="hint">建物に入っている場合は入力してください。</span>
        <FieldError errors={errors?.building} />
      </div>
    </div>
  );
}
