# Deployment

| Setting | Value |
| --- | --- |
| Repository | `NicJMurray/njmurray-books` |
| Production branch | `main` |
| Live application | <https://books.njmurray.com> |
| Cloudflare Worker | `njmurray-books` |
| Configuration | `wrangler.toml` in the repository root |
| Worker entry point | `worker/index.js` |
| Static assets | `dist/`, bound as `ASSETS` |
| Install | `npm ci` |
| Build | `npm run build` |
| Deploy | `npx wrangler deploy` after the build |

## GitHub to Cloudflare

Pushing `main` runs `.github/workflows/deploy.yml`, which installs locked dependencies, builds the application, and publishes this Worker through Wrangler. The workflow targets the known Cloudflare account directly and requires only `CLOUDFLARE_API_TOKEN` as a repository secret. A missing token fails explicitly.

The pipeline was verified on 23 October 2026 with a successful GitHub Actions deployment to the existing production Worker. The deployment token is stored as an encrypted repository secret; it must never be added to source. Deployment concurrency prevents overlapping releases. Check the current Actions result and live site for each subsequent change.

## Editing and publishing

1. Change this repository and update the README when behaviour changes.
2. Run `npm ci` and `npm run build`.
3. Commit and push checked source to `main`.
4. Follow the GitHub Actions deployment for that exact commit, then verify the production page and a read-only Goodreads API request.

`npm run deploy` is the manual fallback; it builds and invokes Wrangler using the local Cloudflare sign-in. A manual upload does not verify automatic publishing.

The homepage links to this independent application, so the existing link opens the latest successful deployment without a homepage rebuild.

## Goodreads refreshes

There are two separate refresh mechanisms:

- The Worker's `24 6 * * *` UTC cron refreshes the live edge cache.
- `.github/workflows/daily-refresh.yml` refreshes and commits `src/data/books.json` and `src/data/wantToRead.json`.

Preserve the daily workflow when changing deployment paths. The deployment credential was configured on 23 October 2026. The refresh workflow now deploys with the same token as the verified push workflow and explicitly fails if that token is unavailable, instead of silently skipping deployment. Verify that each future refresh run reaches production too.

The daily workflow targets the same known Cloudflare account and uses the same token secret as the push deployment. Goodreads import settings are repository variables: `GOODREADS_LIST_URL`, `GOODREADS_WANT_TO_READ_LIST_URL`, `GOODREADS_RSS_URL`, `GOODREADS_USER_ID`, and `GOODREADS_SHELF`.

For an intentional snapshot update, use `npm run refresh:goodreads`. This contacts Goodreads and changes tracked snapshots; it is separate from ordinary frontend validation.

## Runtime configuration

The Worker uses `ASSETS`, the `books.njmurray.com` custom domain, and the daily cron in `wrangler.toml`. It does not use KV or a database. Preserve these settings and the current compatibility date when deploying. Runtime Goodreads endpoints are maintained in `worker/index.js`; snapshot import configuration belongs in the refresh script or repository variables.
