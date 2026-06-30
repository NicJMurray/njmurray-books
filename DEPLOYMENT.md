# Deployment

- Repo: `NicJMurray/njmurray-books`
- Purpose: Reading List app with Goodreads refresh data
- Canonical URL: `https://books.njmurray.com`
- Cloudflare type: Worker with Static Assets
- Cloudflare Worker name: `njmurray-books`
- Deploy command: `npm run deploy`
- Wrangler command: `npm run build && wrangler deploy`

## GitHub Actions

Pushing to `main` deploys through `.github/workflows/deploy.yml`.

Required repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The daily Goodreads workflow in `.github/workflows/daily-refresh.yml` still refreshes `src/data/books.json` and `src/data/wantToRead.json`, commits changes when needed, and deploys when Cloudflare credentials are present.

Goodreads source variables remain repository variables, not committed secrets:

```text
GOODREADS_LIST_URL
GOODREADS_WANT_TO_READ_LIST_URL
GOODREADS_RSS_URL
GOODREADS_USER_ID
GOODREADS_SHELF
```
