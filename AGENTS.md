# Working on Reading List

- This repository is the source for `https://books.njmurray.com`; the production Worker is `njmurray-books`.
- Read `README.md` for the two data layers and `DEPLOYMENT.md` for publishing status.
- The React/Vite frontend lives in `src/`; `worker/index.js` handles live Goodreads data and static assets. Keep runtime and snapshot normalisation aligned when changing fields.
- Use `npm ci` and `npm run build` for affected frontend or Worker changes. The build output is `dist/`; do not substitute the unbuilt repository root for Worker assets.
- Run `npm run refresh:goodreads` only for an intended data refresh; it contacts Goodreads and changes committed snapshots.
- Preserve `.github/workflows/daily-refresh.yml` and snapshot commits when updating deployment automation. Live cache refreshes and committed snapshots are separate mechanisms.
- Preserve `ASSETS`, Worker name, custom domain, daily cron, and compatibility date unless the task requires coordinated changes.
- Goodreads access is read-only. Do not add shelf, rating, or review writes without a requested feature.
- Update the README for behaviour changes and deployment notes for hosting or command changes.
- When publishing is requested or authorized, push checked source to `main`, verify the deployment for that commit, then check the page and a read-only API route. Distinguish successful data refreshes from production deployments.
- Store credentials in Cloudflare/GitHub settings or ignored local files; never commit or print tokens.
