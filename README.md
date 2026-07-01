# njmurray-books

Editable source for the reading list at `https://books.njmurray.com`.

The app is a Vite/React frontend served by the `njmurray-books` Cloudflare Worker. Book data lives in `src/data/books.json` and can be refreshed from Goodreads.

## Local development

```sh
npm install
npm run dev
```

## Goodreads refresh

The scheduled workflow refreshes the read shelf from the public Goodreads RSS feed and commits updated book data when it changes.

To change the source later, use the GitHub repository variables documented in [DEPLOYMENT.md](DEPLOYMENT.md).

Manual import from a Goodreads CSV export:

```sh
npm run import:goodreads
```

Put the CSV at `data/goodreads_library_export.csv`. CSV files are ignored by Git.

## Deployment

This is a Cloudflare Worker with static assets, so it still deploys with Wrangler rather than the Pages Git integration used by the static Pages repos.

```sh
npm run deploy
```

Automatic deploys run through GitHub Actions on pushes to `main`.

The Worker uses this custom domain:

- `books.njmurray.com`

See [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment summary.
