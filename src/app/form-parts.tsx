// フォームで共通に使う部品と見た目
export const labelClass = "font-medium";
export const inputClass = "rounded border border-gray-400 px-3 py-2";
export const submitClass =
  "rounded bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-800 disabled:opacity-60";

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-red-700">{errors[0]}</p>;
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
      {message}
    </p>
  );
}
