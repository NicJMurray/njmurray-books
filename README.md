# njmurray-books

Editable source for the reading list at https://njmurray.com/books/.

The app is a Vite/React frontend served by the `njmurray-books` Cloudflare Worker. Book data lives in `src/data/books.json` and can be refreshed from Goodreads.

## Local development

```sh
npm install
npm run dev
```

## Goodreads refresh

The daily workflow refreshes from this Goodreads page by default:

- https://www.goodreads.com/review/list/89023673?shelf=read

Goodreads redirects the HTML page to sign-in for automated requests, so the script derives and reads the matching public RSS feed:

- https://www.goodreads.com/review/list_rss/89023673?shelf=read

To change the source later, set one of these GitHub repository variables:

- `GOODREADS_LIST_URL`: full Goodreads shelf page URL.
- `GOODREADS_RSS_URL`: full Goodreads RSS feed URL for the `read` shelf.
- `GOODREADS_USER_ID`: Goodreads user ID. The workflow will build the `read` shelf RSS URL.

Then add Cloudflare configuration so the workflow can deploy after refreshing:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The scheduled workflow runs every day at 06:24 UTC.

Manual refresh from the shelf page:

```sh
GOODREADS_LIST_URL="https://www.goodreads.com/review/list/89023673?shelf=read" npm run refresh:goodreads
```

Manual import from a richer Goodreads CSV export:

```sh
npm run import:goodreads
```

Put the CSV at `data/goodreads_library_export.csv`. CSV files are ignored so private export columns are not committed accidentally.

## Deploy

```sh
npm run deploy
```

The Worker uses these routes:

- `njmurray.com/books`
- `njmurray.com/books/*`

## Recovery Notes

This project was rebuilt from the live Cloudflare deployment. The recovered production bundle is no longer the editing surface; the editable app is under `src/`. The original source maps were not available from Cloudflare, so `metadata/` keeps the recovery provenance.
