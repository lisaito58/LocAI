"use client";
// 「検索条件を変更する」：入力済みの検索欄へ戻り、最初の欄にカーソルを置く（値はそのまま）
export function EditSearchButton() {
  return (
    <button
      type="button"
      className="btn-primary"
      onClick={() => {
        const form = document.getElementById("search");
        form?.scrollIntoView({ behavior: "smooth", block: "start" });
        form?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
      }}
    >
      🔍 検索条件を変更する
    </button>
  );
}
