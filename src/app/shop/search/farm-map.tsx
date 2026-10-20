"use client";
// 地図で農家・出品を探す（一覧と同じ検索条件の結果を、市区町村ごとにまとめて表示）
// - 位置は農園の市区町村の「おおよその位置」（代表点）。住所・引き取り場所ではないので、距離や所要時間は出さない
// - 背景地図は国土地理院の地理院タイル（出典を表示）。現在地の許可は求めない
// - 地図が読み込めなくても、下の一覧と「一覧」表示から検索・申込できる
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type MapArea = {
  key: string;
  prefecture: string;
  city: string;
  point: [number, number];
  farms: { farmName: string; listings: { id: string; itemName: string; href: string }[] }[];
};

export function FarmMap({ areas, center, prefectures }: { areas: MapArea[]; center: [number, number]; prefectures: { name: string; point: [number, number] }[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [tileErrors, setTileErrors] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !boxRef.current) return;
        const map = L.map(boxRef.current, { center, zoom: 9, scrollWheelZoom: false });
        mapRef.current = map;
        L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
          minZoom: 5,
          maxZoom: 18,
          attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>（国土地理院）',
        })
          .on("tileerror", () => setTileErrors((n) => n + 1))
          .addTo(map);
        for (const a of areas) {
          const count = a.farms.reduce((n, f) => n + f.listings.length, 0);
          const icon = L.divIcon({
            className: "",
            html: `<div style="background:#2f7d4f;color:#fff;border:2px solid #fff;border-radius:9999px;padding:2px 8px;font-weight:700;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap">🥬 ${count}</div>`,
            iconSize: undefined,
          });
          // 吹き出しの中身は文字として組み立てる（農園名などをHTMLとして解釈しない）
          const el = document.createElement("div");
          const h = document.createElement("strong");
          h.textContent = `${a.prefecture}${a.city}（おおよその位置）`;
          el.appendChild(h);
          for (const f of a.farms) {
            const p = document.createElement("div");
            p.style.marginTop = "6px";
            p.textContent = `👩‍🌾 ${f.farmName}`;
            el.appendChild(p);
            for (const l of f.listings) {
              const link = document.createElement("a");
              link.href = l.href;
              link.textContent = `・${l.itemName}を見る`;
              link.style.display = "block";
              el.appendChild(link);
            }
          }
          L.marker(a.point, { icon, title: `${a.prefecture}${a.city}` }).bindPopup(el).addTo(map);
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [areas, center]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="label">地域を選んで地図を動かす</span>
        <select
          className="input"
          defaultValue=""
          onChange={(e) => {
            const p = prefectures.find((x) => x.name === e.target.value);
            if (p) mapRef.current?.setView(p.point, 9);
          }}
        >
          <option value="" disabled>
            都道府県を選ぶ
          </option>
          {prefectures.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
      </label>
      <div className="relative">
        <div ref={boxRef} className="h-[60vh] min-h-72 w-full overflow-hidden rounded-2xl border-2 border-green-200 bg-leaf-light" role="region" aria-label="農家の地図" />
        {status === "loading" && <p className="absolute inset-0 flex items-center justify-center font-bold text-leaf-dark">🗺 地図を読み込んでいます…</p>}
      </div>
      {(status === "failed" || tileErrors > 3) && (
        <p className="rounded-2xl bg-[#fbf0e6] px-3 py-2 text-sm text-[#3d3a37]">
          地図をうまく表示できません。下の一覧や「📋 一覧」表示から、同じ条件で探して申し込めます。
        </p>
      )}
      <p className="hint">
        目印は農園のある市区町村の「おおよその位置」です。住所や引き取り場所ではありません。近くに見えても、配送できるか・送料は出品の条件で確認してください。
      </p>
      {/* 地図が使えない人のための一覧（地図と同じ内容） */}
      <details className="rounded-2xl border-2 border-green-100 bg-white p-3" open={status === "failed"}>
        <summary className="cursor-pointer font-bold text-leaf-dark">地図の内容を文字で見る（{areas.length}地域）</summary>
        <ul className="mt-2 flex flex-col gap-3">
          {areas.map((a) => (
            <li key={a.key}>
              <p className="font-bold">📍 {a.prefecture}{a.city}</p>
              {a.farms.map((f) => (
                <div key={f.farmName} className="ml-2">
                  <p>👩‍🌾 {f.farmName}</p>
                  <ul className="ml-4 list-disc">
                    {f.listings.map((l) => (
                      <li key={l.id}>
                        <Link href={l.href} className="link">
                          {l.itemName}を見る
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
