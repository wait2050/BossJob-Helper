# Fill Marketing Website Information Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill out the correct Lanzou download link, purchase link, support email, and remove/hide the "未备案" ICP row in the footer of the marketing website.

**Architecture:** Update constants in `site.ts` and apply conditional rendering in `Footer.tsx`.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite, pnpm

## Global Constraints

- Retain all other existing comments and configuration structures.
- Do not add any placeholder values.
- Verify changes by running a successful build of the website.

---

### Task 1: Update Constants and Conditional Footer ICP Display

**Files:**
- Modify: [site.ts](file:///Users/songzz_1/cc/boss/boss-website/src/lib/site.ts)
- Modify: [Footer.tsx](file:///Users/songzz_1/cc/boss/boss-website/src/components/Footer.tsx)

**Interfaces:**
- Consumes: None
- Produces: Updated configurations and footer component layout.

- [ ] **Step 1: Update site.ts with correct information**
  Modify `/Users/songzz_1/cc/boss/boss-website/src/lib/site.ts`:
  Replace:
  ```typescript
  export const SITE = {
    name: "Boss海投助手",
    // 蓝奏云插件下载链接（部署前替换）
    LANZO_URL: "https://wwvj.lanzoum.com/boss-helper",
    // 面包多购买额度链接（部署前替换）
    BUY_URL: "https://mbd.pub/o/boss-helper-100",
    // 联系邮箱
    EMAIL: "hi@boss-helper.app",
    // 备案号（占位）
    ICP: "",
  } as const;
  ```
  With:
  ```typescript
  export const SITE = {
    name: "Boss海投助手",
    // 蓝奏云插件下载链接（部署前替换）
    LANZO_URL: "https://h2so4.lanzout.com/i4tkH3u7jibe",
    // 面包多购买额度链接（部署前替换）
    BUY_URL: "https://pay.ldxp.cn/item/8caf0e",
    // 联系邮箱
    EMAIL: "morpheus.s@qq.com",
    // 备案号（占位）
    ICP: "",
  } as const;
  ```

- [ ] **Step 2: Hide ICP section if empty in Footer.tsx**
  Modify `/Users/songzz_1/cc/boss/boss-website/src/components/Footer.tsx`:
  Replace (lines 74-76):
  ```tsx
  <p className="font-body text-xs text-cream/50">
    {SITE.ICP ? `备案号：${SITE.ICP}` : "未备案"}
  </p>
  ```
  With:
  ```tsx
  {SITE.ICP && (
    <p className="font-body text-xs text-cream/50">
      备案号：{SITE.ICP}
    </p>
  )}
  ```

- [ ] **Step 3: Build the website to verify TypeScript and build correctness**
  Run: `pnpm run build` inside `/Users/songzz_1/cc/boss/boss-website`
  Expected: Build succeeds with no compilation errors and generates assets under `dist/` directory.

- [ ] **Step 4: Commit changes**
  Run:
  ```bash
  git add boss-website/src/lib/site.ts boss-website/src/components/Footer.tsx
  git commit -m "feat: fill website links/email and hide ICP footer section when unconfigured"
  ```

---

## Verification Plan

### Automated Tests
- Run `pnpm run build` to confirm static site compilation completes successfully.

### Manual Verification
- Start local preview dev server: `pnpm run dev` and open in browser.
- Verify that clicking "免费下载插件" leads to `https://h2so4.lanzout.com/i4tkH3u7jibe`.
- Verify that clicking "购买投递额度" leads to `https://pay.ldxp.cn/item/8caf0e`.
- Verify that customer service email links to `mailto:morpheus.s@qq.com`.
- Verify that "未备案" text is not present in the footer layout.
