# Design Document: Fill Marketing Website Information

## 1. Goal Description
Fill out the missing or placeholder configuration links on the marketing website (`boss-website`), including the Lanzou plugin download URL, the card product purchase URL, and the support email address. Additionally, hide the ICP filing row entirely when the filing number is not configured, instead of showing "未备案".

## 2. Proposed Changes

### [Marketing Website Configuration & Components]

#### [MODIFY] [site.ts](file:///Users/songzz_1/cc/boss/boss-website/src/lib/site.ts)
Update site config constants:
- `LANZO_URL`: `"https://h2so4.lanzout.com/i4tkH3u7jibe"`
- `BUY_URL`: `"https://pay.ldxp.cn/item/8caf0e"`
- `EMAIL`: `"morpheus.s@qq.com"`
- `ICP`: `""`

#### [MODIFY] [Footer.tsx](file:///Users/songzz_1/cc/boss/boss-website/src/components/Footer.tsx)
Modify footer render block for ICP filing:
- Replace:
  ```tsx
  <p className="font-body text-xs text-cream/50">
    {SITE.ICP ? `备案号：${SITE.ICP}` : "未备案"}
  </p>
  ```
- With:
  ```tsx
  {SITE.ICP && (
    <p className="font-body text-xs text-cream/50">
      备案号：{SITE.ICP}
    </p>
  )}
  ```

## 3. Verification Plan
- Build the project using `npm run build` inside `boss-website` to ensure no TypeScript compilation or compilation-related issues occur.
- Manually audit built files or run a preview server to verify that the ICP/unfiled text does not show up.
