"use client";
// このブラウザに下書きが保存されているか（サーバー描画では常に false）
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

export function useHasStored(key: string) {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(key) !== null;
      } catch {
        return false;
      }
    },
    () => false,
  );
}
