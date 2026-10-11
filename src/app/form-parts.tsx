// フォームで共通に使う部品と見た目
export const labelClass = "label";
export const inputClass = "input";
export const submitClass = "btn-primary w-full";

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm font-medium text-red-700">⚠️ {errors[0]}</p>;
}

export function FormMessage({ message, tone = "error" }: { message?: string; tone?: "error" | "ok" }) {
  if (!message) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-2xl p-3 text-sm whitespace-pre-line ${
        tone === "error" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-900"
      }`}
    >
      {tone === "error" ? "⚠️ " : "✅ "}
      {message}
    </p>
  );
}
