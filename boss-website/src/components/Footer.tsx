import { Rocket, Mail, Download } from "lucide-react";
import { SITE, NAV_LINKS } from "@/lib/site";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t-[3px] border-ink bg-ink py-12 text-cream">
      <div className="container">
        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr_1fr]">
          {/* 品牌 */}
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border-[3px] border-cream bg-pink text-cream">
                <Rocket className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <span className="font-display text-lg font-extrabold">
                Boss<span className="text-pink">海投</span>助手
              </span>
            </div>
            <p className="font-body mt-4 max-w-xs text-sm leading-relaxed text-cream/60">
              AI 驱动的 BOSS 直聘批量投递工具，帮你把求职效率拉到满格。
            </p>
          </div>

          {/* 导航 */}
          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-widest text-sun">快速导航</h4>
            <ul className="mt-4 flex flex-col gap-2">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="font-body text-sm text-cream/70 transition-colors hover:text-pink"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* 联系 */}
          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-widest text-sun">联系我们</h4>
            <ul className="mt-4 flex flex-col gap-3">
              <li>
                <a
                  href={`mailto:${SITE.EMAIL}`}
                  className="font-body flex items-center gap-2 text-sm text-cream/70 transition-colors hover:text-pink"
                >
                  <Mail className="h-4 w-4" strokeWidth={2.5} />
                  {SITE.EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={SITE.LANZO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body flex items-center gap-2 text-sm text-cream/70 transition-colors hover:text-pink"
                >
                  <Download className="h-4 w-4" strokeWidth={2.5} />
                  下载最新版本
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-cream/15 pt-6 md:flex-row">
          <p className="font-body text-xs text-cream/50">
            © {year} Boss海投助手 · 仅供学习交流使用，请遵守 BOSS 直聘使用协议
          </p>
          {!!SITE.ICP && (
            <p className="font-body text-xs text-cream/50">
              备案号：{SITE.ICP}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
