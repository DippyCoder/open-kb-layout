# Open KB Layout

A keyboard layout editor inspired by keyboard-layout-editor.com. Build layouts in the browser, sign in with GitHub, save them to your account, share them publicly and remix other people's layouts with credit.

## Stack

- React + Vite frontend (`src/`)
- Cloudflare Pages Functions API (`functions/api/[[path]].ts`)
- R2 for storage: one TOML file per account at `users/<github-id>.toml`
- KV for sessions, the public layout index (Discover and search) and the featured list

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # set DEV_LOGIN=1 to sign in without GitHub
npm run build && npm run dev:api # API + built site on :8788
npm run dev                      # Vite with hot reload on :5173, proxies /api to :8788
```

With `DEV_LOGIN=1` and no `GITHUB_CLIENT_ID`, "Sign in" logs you in as a local user. `/api/auth/login?as=alice` picks a different user. Never set `DEV_LOGIN` in production.

## Deploying to Cloudflare Pages

1. Create the storage:
   ```bash
   npx wrangler kv namespace create KV        # put the id in wrangler.toml
   npx wrangler r2 bucket create open-kb-layout
   ```
2. Create a GitHub OAuth app (GitHub, Settings, Developer settings, OAuth Apps):
   - Homepage URL: `https://<your-site>`
   - Callback URL: `https://<your-site>/api/auth/callback`
3. Set secrets on the Pages project:
   ```bash
   npx wrangler pages secret put GITHUB_CLIENT_ID
   npx wrangler pages secret put GITHUB_CLIENT_SECRET
   npx wrangler pages secret put ADMIN_LOGINS   # comma separated GitHub logins that can feature layouts
   ```
4. `npm run deploy`

## Notes

- Each account can save up to 100 layouts (`LAYOUT_LIMIT` in `functions/_lib/core.ts`). The limit is not shown in the UI until it is hit.
- Layout IDs start with the owner's GitHub id in base 36, so a layout page can find the owner's TOML file without a lookup table.
- Writes to the account TOML use R2 conditional puts (etag) and retry, so two tabs saving at once do not overwrite each other.
- Featured layouts are chosen by admins with the Feature button on a public layout page. With none chosen, the home page shows the most recent public layouts.
- Import accepts this site's JSON, KLE downloaded JSON and KLE raw data. Export offers JSON, KLE JSON, PNG and SVG.
