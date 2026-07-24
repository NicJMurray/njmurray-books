# njmurray books

`books.njmurray.com` is a React reading-list site backed by Goodreads RSS. It renders immediately from a bundled snapshot, then tries to replace that snapshot with a fresher live shelf from the Cloudflare Worker.

## Runtime flow

1. Vite builds the React app from `src/main.jsx`, `src/App.jsx`, and `src/styles.css` into static assets.
2. The app initially imports `src/data/books.json` and `src/data/wantToRead.json`. These are the reliable fallback data used for the first render and if Goodreads is unavailable.
3. On mount, `App.jsx` requests `/api/books.json` and `/api/want-to-read.json` in parallel. If either response is usable, it replaces the corresponding in-memory dataset without a page reload.
4. `worker/index.js` receives those API requests, reads the public Goodreads RSS feed for the requested shelf, normalises the book records, sorts them by reading/added date, and caches the JSON response at Cloudflare for 24 hours.
5. The Worker’s daily cron refreshes both cached shelves proactively. For all other paths it serves the Vite assets and falls back to `index.html` for client-side routes.

The site therefore stays useful when Goodreads is slow or down, while normally showing more recent data than the bundle alone.

## Interface behaviour

`App.jsx` is responsible for all display logic:

- Searches across title, short title, author, additional authors, publisher, and shelf text.
- Sorts by date read, rating, title, author, publication year, or page count.
- Shows grid and list views of the same filtered data.
- Builds grouped sections from the selected sort order and a separate five-star favourites section.
- Uses the to-read shelf for the “what next?” picker when covers are available; otherwise it shows recent read covers.

## Data and code map

| File | Responsibility |
| --- | --- |
| `src/App.jsx` | Reading-list UI, filtering, sorting, grouping, view switching, and live-data refresh. |
| `src/data/books.json` | Bundled read-shelf snapshot/fallback. |
| `src/data/wantToRead.json` | Bundled to-read snapshot/fallback. |
| `worker/index.js` | Goodreads RSS API, record normalisation, edge cache, scheduled cache warming, and static-asset fallback. |
| `scripts/refresh-goodreads.mjs` | Refreshes the committed snapshots from Goodreads RSS or a Goodreads CSV export. |
| `wrangler.toml` | Worker entry point, custom domain, static assets binding, and daily cron. |

## Goodreads data details

The Worker uses Goodreads user ID `89023673`, requests up to ten RSS pages of 200 items for each shelf, and preserves useful fields such as rating, dates, page count, publication year, Goodreads URL, and the best available Goodreads cover image. The app does not write back to Goodreads.

`scripts/refresh-goodreads.mjs` merges incoming data with existing snapshots instead of blindly replacing every record. That preserves fields which RSS may omit while allowing newer Goodreads data to win where it is available. It can also ingest a Goodreads CSV export when one is present.

## Things worth changing

- Change the Goodreads user ID, cache duration, or RSS pagination limits in `worker/index.js` if the source account or retrieval behaviour changes.
- Change the fallback snapshots through `scripts/refresh-goodreads.mjs` or by editing the JSON carefully; they should remain valid arrays of normalised book objects.
- Change visual rules in `src/styles.css` and page behaviour in `src/App.jsx`; the static snapshots and Worker API are deliberately separate concerns.
