"use client";
// 住所の入力
//   郵便番号（任意）→「住所を検索」→ 候補を確認・選択 → 都道府県・市区町村を一覧から選ぶ → 番地・建物名
// - 郵便番号で分かるのは町域まで。番地・建物名は本人が入力する。検索結果は住所の実在確認ではない
// - 入力済みの番地・建物名は、検索結果で黙って上書きしない
// - 検索が失敗しても、都道府県・市区町村の一覧から選んで登録を続けられる
// - 都道府県を変えたら、合わない市区町村は残さない
import { useRef, useState } from "react";
import { FieldError } from "@/app/form-parts";
import { PrefectureSelect, ReqMark } from "@/components/fields";
import { MUNICIPALITIES } from "@/lib/data/municipalities";
import { checkPostal } from "@/lib/validation/postal";

type Candidate = { prefecture: string; city: string; town: string };
type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "choose"; results: Candidate[] }
  | { kind: "applied"; text: string; townPending: string | null; cityMissing: boolean }
  | { kind: "message"; tone: "info" | "error"; text: string };

export function AddressFields({
  initial,
  errors,
  prefectureHint,
  addressHint,
  showAddressLine = true,
}: {
  initial?: { prefecture?: string; city?: string; addressLine?: string; postalCode?: string };
  errors?: Record<string, string[] | undefined>;
  prefectureHint?: string;
  addressHint?: string;
  showAddressLine?: boolean;
}) {
  const [prefecture, setPrefecture] = useState(initial?.prefecture ?? "");
  const cities = MUNICIPALITIES[prefecture] ?? [];
  const initialCityValid = Boolean(initial?.city && (MUNICIPALITIES[initial?.prefecture ?? ""] ?? []).includes(initial.city));
  const [city, setCity] = useState(initialCityValid ? initial!.city! : "");
  const staleCity = initial?.city && !initialCityValid && prefecture === initial?.prefecture ? initial.city : null;
  const [postal, setPostal] = useState(initial?.postalCode ?? "");
  const [postalError, setPostalError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const seq = useRef(0); // 古い検索結果が後から返ってきても使わないための番号
  const wrapRef = useRef<HTMLDivElement>(null);

  function addressInput(): HTMLInputElement | null {
    const form = wrapRef.current?.closest("form");
    const el = form?.elements.namedItem("addressLine");
    return el instanceof HTMLInputElement ? el : null;
  }

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
        setLookup({ kind: "message", tone: "info", text: "この郵便番号に当てはまる住所が見つかりませんでした。番号を確認するか、下の一覧から選んでください。" });
        break;
      case "timeout":
        setLookup({ kind: "message", tone: "error", text: "住所の検索に時間がかかっています。少し待ってもう一度押すか、下の一覧から選んでください。" });
        break;
      case "invalid":
        setLookup({ kind: "message", tone: "error", text: body.message ?? "郵便番号を確認してください。" });
        break;
      default:
        setLookup({
          kind: "message",
          tone: "error",
          text: body?.message ?? "住所の検索サービスにつながりませんでした。下の一覧から選んで登録を続けられます。",
        });
    }
  }

  function apply(r: Candidate) {
    const list = MUNICIPALITIES[r.prefecture] ?? [];
    setPrefecture(r.prefecture);
    const cityOk = list.includes(r.city);
    setCity(cityOk ? r.city : "");
    // 番地・建物名が空なら町域を入れる。入力済みなら上書きせず、入れるかどうかを聞く
    const input = addressInput();
    let townPending: string | null = null;
    if (r.town && input) {
      if (!input.value.trim()) input.value = r.town;
      else if (!input.value.startsWith(r.town)) townPending = r.town;
    }
    setLookup({ kind: "applied", text: `${r.prefecture}${r.city}${r.town}`, townPending, cityMissing: !cityOk });
  }

  return (
    <div ref={wrapRef} className="flex flex-col gap-4">
      {/* 郵便番号から入力補助 */}
      <div className="flex flex-col gap-1">
        <label htmlFor="postalCode" className="label">
          郵便番号
          <ReqMark optional />
        </label>
        <div className="flex flex-col gap-2 min-[400px]:flex-row">
          <input
            id="postalCode"
            name="postalCode"
            className="input min-[400px]:max-w-48"
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
          {lookup.kind === "applied" && (
            <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-leaf-light/70 p-3 text-sm">
              <p>✅ 「{lookup.text}」を入れました。下の欄で確認・修正できます。</p>
              {lookup.cityMissing && <p className="font-bold text-amber-950">市区町村が一覧の表記と合わないため、一覧から選んでください。</p>}
              {lookup.townPending && (
                <div className="flex flex-col gap-2">
                  <p>番地・建物名の欄はすでに入力されているので、変更していません。</p>
                  <button
                    type="button"
                    className="btn-secondary btn-sm self-start"
                    onClick={() => {
                      const input = addressInput();
                      if (input) input.value = `${lookup.townPending}${input.value}`;
                      setLookup({ ...lookup, townPending: null });
                    }}
                  >
                    町域「{lookup.townPending}」を先頭に入れる
                  </button>
                </div>
              )}
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
          {prefectureHint && <span className="hint">{prefectureHint}</span>}
          <FieldError errors={errors?.prefecture} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="city" className="label">
            市区町村
            <ReqMark required />
          </label>
          <select
            id="city"
            name="city"
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={!prefecture}
            required
            aria-invalid={Boolean(errors?.city) || undefined}
          >
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
                <p className="mt-1">
                  登録済みの表記は「{staleCity}」です。郡がある町村は「〇〇郡〇〇町」のように郡名から始まる表記で一覧に出ます。
                </p>
              </details>
            </div>
          )}
          <FieldError errors={errors?.city} />
        </div>
      </div>

      {showAddressLine && (
        <div className="flex flex-col gap-1">
          <label htmlFor="addressLine" className="label">
            番地・建物名
            <ReqMark required />
          </label>
          <input id="addressLine" name="addressLine" className="input" defaultValue={initial?.addressLine} required maxLength={100} placeholder="例：福島1-2-3 みかんビル1階" />
          {addressHint && <span className="hint">{addressHint}</span>}
          <FieldError errors={errors?.addressLine} />
        </div>
      )}
    </div>
  );
}
