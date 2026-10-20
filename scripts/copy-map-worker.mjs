// 地図ライブラリ（MapLibre GL）の作業用スクリプトを public/ にコピーする
// バンドルするとライブラリが自分で場所を見つけられないため、固定のURL（/vendor/...）から読み込ませる。
// npm install のあと（postinstall）に自動で実行される。コピーしたファイルは Git に含めない。
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/vendor/maplibre-gl-worker.mjs");
