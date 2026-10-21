"use client";
// 地図で農家・出品を探す（一覧と同じ検索条件の結果を、市区町村ごとにまとめて表示）
// - 背景地図：OpenFreeMap（OpenStreetMap のデータを使った道路地図。APIキー不要・利用無料・商用可）
//   出典（OpenFreeMap © OpenMapTiles Data from OpenStreetMap）は常に表示する。MapLibre のロゴ・名前は表示義務がないので出さない
// - 位置は農園の市区町村の「おおよその位置」（代表点）。住所・引き取り場所ではないので、距離や所要時間は出さない
// - 初期表示は関西。現在地の許可は求めない
// - 地図が読み込めなくても、下の文字の一覧と「一覧」表示から検索・申込できる
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type MapArea = {
  key: string;
  prefecture: string;
  city: string;
  point: [number, number]; // [緯度, 経度]
  farms: { farmName: string; listings: { id: string; itemName: string; href: string }[] }[];
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const KANSAI_CENTER: [number, number] = [135.5, 34.8]; // [経度, 緯度]

export function FarmMap({ areas, prefectures }: { areas: MapArea[]; prefectures: { name: string; point: [number, number] }[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !boxRef.current) return;
        ml.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
        const map = new ml.Map({
          container: boxRef.current,
          style: STYLE_URL,
          center: KANSAI_CENTER,
          zoom: 7.6,
          cooperativeGestures: true, // スマホでページのスクロールを妨げない（2本指で地図を動かす）
          locale: {
            "CooperativeGesturesHandler.WindowsHelpText": "Ctrl キーを押しながらスクロールすると、地図を拡大・縮小できます",
            "CooperativeGesturesHandler.MacHelpText": "⌘ キーを押しながらスクロールすると、地図を拡大・縮小できます",
            "CooperativeGesturesHandler.MobileHelpText": "2本の指で地図を動かせます",
            "NavigationControl.ZoomIn": "拡大",
            "NavigationControl.ZoomOut": "縮小",
            "NavigationControl.ResetBearing": "北を上にする",
          },
          attributionControl: { compact: false, customAttribution: [] },
        });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", () => {
          if (!map.loaded()) setStatus("failed");
        });
        map.on("load", () => {
          // 地名は日本語の名前を優先して表示する
          for (const layer of map.getStyle().layers ?? []) {
            if (layer.type === "symbol" && map.getLayoutProperty(layer.id, "text-field")) {
              map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:ja"], ["get", "name"]]);
            }
          }
          setStatus("ready");
        });
        for (const a of areas) {
          const count = a.farms.reduce((n, f) => n + f.listings.length, 0);
          // 目印・吹き出しは文字として組み立てる（農園名などをHTMLとして解釈しない）
          const pin = document.createElement("button");
          pin.type = "button";
          pin.setAttribute("aria-label", `${a.prefecture}${a.city}の出品 ${count}件`);
          pin.textContent = `🥬 ${count}`;
          pin.style.cssText =
            "background:#2f7d4f;color:#fff;border:2px solid #fff;border-radius:9999px;padding:2px 10px;font-weight:700;font-size:15px;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer";
          const el = document.createElement("div");
          el.style.cssText = "font-size:15px;line-height:1.6;max-width:240px";
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
              link.style.cssText = "display:block;color:#1f5c39;font-weight:700;text-decoration:underline";
              el.appendChild(link);
            }
          }
          new ml.Marker({ element: pin })
            .setLngLat([a.point[1], a.point[0]])
            .setPopup(new ml.Popup({ offset: 18 }).setDOMContent(el))
            .addTo(map);
        }
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [areas]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="label">地域を選んで地図を動かす</span>
        <select
          className="input"
          defaultValue=""
          onChange={(e) => {
            const p = prefectures.find((x) => x.name === e.target.value);
            if (p) mapRef.current?.flyTo({ center: [p.point[1], p.point[0]], zoom: 9 });
          }}
        >
          <option value="" disabled>
            府県を選ぶ（関西2府4県）
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
      {status === "failed" && (
        <p className="rounded-2xl bg-[#fbf0e6] px-3 py-2 text-sm text-[#3d3a37]">
          地図を表示できませんでした。下の一覧や「📋 一覧で見る」から、同じ条件で探して申し込めます。
        </p>
      )}
      <p className="hint">
        目印は農園のある市区町村の「おおよその位置」です。住所や引き取り場所ではありません。近くに見えても、配送できるか・送料は出品の条件で確認してください。スマホでは2本の指で地図を動かせます。
      </p>
      {/* 地図が使えない人のための一覧（地図と同じ内容） */}
      <details className="rounded-2xl border-2 border-green-100 bg-white p-3" open={status === "failed"}>
        <summary className="cursor-pointer font-bold text-leaf-dark">地図の内容を文字で見る（{areas.length}地域）</summary>
        <ul className="mt-2 flex flex-col gap-3">
          {areas.map((a) => (
            <li key={a.key}>
              <p className="font-bold">
                📍 {a.prefecture}
                {a.city}
              </p>
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
