import type { Metadata } from "next";
import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding";
import { Page, PageTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { FAQ } from "./faq";

export const metadata: Metadata = { title: "使い方・FAQ | LocAI" };

export default function HelpPage() {
  return (
    <Page narrow>
      <PageTitle emoji="📖" title="使い方・FAQ" lead="「使い方」は操作の流れ、「FAQ」はよくある疑問への答えです。" />
      <nav aria-label="このページの目次" className="mb-6 flex flex-col gap-2 sm:flex-row">
        <a href="#how" className="btn-secondary flex-1">
          🧭 使い方（操作の流れ）
        </a>
        <a href="#faq" className="btn-secondary flex-1">
          ❓ FAQ（よくある質問）
        </a>
      </nav>

      <section id="how" className="scroll-mt-24">
        <h2 className="section-title mb-3">🧭 使い方</h2>
        <Suspense fallback={<HowTo role={null} />}>
          <HowToForUser />
        </Suspense>
      </section>

      <section id="faq" className="mt-10 scroll-mt-24">
        <h2 className="section-title mb-3">❓ FAQ</h2>
        <div className="flex flex-col gap-5">
          {FAQ.map((c) => (
            <div key={c.category}>
              <h3 className="mb-2 font-bold text-leaf-dark">
                <span aria-hidden>{c.emoji}</span> {c.category}
              </h3>
              <div className="flex flex-col gap-2">
                {c.items.map((it) => (
                  <details key={it.q} className="group rounded-2xl border-2 border-green-100 bg-white">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 font-bold">
                      <span>Q. {it.q}</span>
                      <span aria-hidden className="shrink-0 text-leaf group-open:rotate-180">
                        ▼
                      </span>
                    </summary>
                    <p className="border-t border-green-100 px-4 py-3 leading-relaxed">A. {it.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}

async function HowToForUser() {
  const user = await getCurrentUser();
  return <HowTo role={user?.role ?? null} />;
}

// ログイン中は自分の立場の3枚、ログイン前は両方の流れを表示する
function HowTo({ role }: { role: "FARMER" | "RESTAURANT" | null }) {
  if (role) return <Onboarding role={role} mode="page" />;
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="mb-2 font-bold">🏮 飲食店の方</h3>
        <Onboarding role="RESTAURANT" mode="page" />
      </div>
      <div>
        <h3 className="mb-2 font-bold">👩‍🌾 農家の方</h3>
        <Onboarding role="FARMER" mode="page" />
      </div>
    </div>
  );
}
