// スクリプト用：.env.local を読み込む（値は表示しない）。他の import より先に読み込むこと
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
