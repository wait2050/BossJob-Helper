import Reveal from "./Reveal";
import { Check, Star, Download, ShoppingBag } from "lucide-react";
import { PLANS } from "@/lib/site";

export default function Pricing() {
  return (
    <section id="pricing" className="relative overflow-hidden bg-cream py-20 md:py-28">
      <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 animate-blob bg-pink/20 blur-2xl" />
      <div className="pointer-events-none absolute -right-20 bottom-20 h-72 w-72 animate-blob bg-blue/20 blur-2xl [animation-delay:2s]" />

      <div className="container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">定价方案</span>
          <h2 className="font-display mt-5 text-4xl font-extrabold text-ink md:text-5xl">
            一杯<span className="text-pink">奶茶钱</span>，换 100 次投递
          </h2>
          <p className="font-body mt-4 text-lg text-ink/60">
            先免费体验，满意再付费。邀请好友还能持续白嫖。
          </p>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-4xl items-stretch gap-6 md:grid-cols-2">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1}>
              <div
                className={`relative flex h-full flex-col rounded-[28px] border-[3px] border-ink p-8 transition-transform duration-300 hover:-translate-y-1.5 ${
                  plan.highlight
                    ? "bg-sun shadow-hard"
                    : "bg-cream shadow-hard-sm"
                }`}
              >
                {plan.highlight && (
                  <span className="font-display absolute -right-3 -top-3 flex items-center gap-1 rounded-full border-[3px] border-ink bg-pink px-3 py-1 text-xs font-extrabold text-cream">
                    <Star className="h-3 w-3 fill-cream" strokeWidth={2.5} />
                    {plan.tag}
                  </span>
                )}
                {!plan.highlight && (
                  <span className="font-display inline-flex w-fit items-center rounded-full border-2 border-ink bg-cream px-3 py-1 text-xs font-bold text-ink">
                    {plan.tag}
                  </span>
                )}

                <h3 className="font-display mt-4 text-2xl font-extrabold text-ink">{plan.name}</h3>
                <p className="font-body mt-1 text-sm text-ink/60">{plan.desc}</p>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-display text-6xl font-extrabold text-ink">{plan.price}</span>
                  <span className="font-body text-lg font-bold text-ink/60">{plan.unit}</span>
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {plan.features.map((f) => (
                    <li key={f} className="font-body flex items-center gap-3 text-sm font-semibold text-ink">
                      <span
                        className={`flex h-6 w-6 flex-none items-center justify-center rounded-lg border-2 border-ink ${
                          plan.highlight ? "bg-pink text-cream" : "bg-blue text-cream"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href={plan.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-8 w-full ${plan.highlight ? "btn-pink" : "btn-blue"}`}
                >
                  {plan.cta.primary ? (
                    <ShoppingBag className="h-5 w-5" strokeWidth={2.5} />
                  ) : (
                    <Download className="h-5 w-5" strokeWidth={2.5} />
                  )}
                  {plan.cta.label}
                </a>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 text-center">
          <p className="font-body text-sm text-ink/50">
            * 虚拟商品，充值使用后不支持退款。卡密通过发卡平台自动发货，即充即用。
          </p>
        </Reveal>
      </div>
    </section>
  );
}
