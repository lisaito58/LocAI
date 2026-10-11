"use client";
// 送信後も入力内容を残すフォーム（React 19 は action 送信後にフォームを初期化するため）
import { startTransition, useActionState, type FormEvent } from "react";

export function useKeepForm<S>(action: (prev: Awaited<S>, formData: FormData) => S | Promise<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, undefined as Awaited<S>);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }
  return [state, onSubmit, pending] as const;
}
