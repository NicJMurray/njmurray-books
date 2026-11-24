![Reading List](.github/readme-banner.svg)

# Reading List

Reading-list application at `books.njmurray.com`. The React frontend and Cloudflare Worker use the same committed snapshots of the Goodreads read and want-to-read shelves. Goodreads retired its public RSS feeds in October 2026.

## Frontend boot sequence

Vite starts from `index.html`, loads `src/main.jsx`, and mounts `App` into the root element.

`App.jsx` imports:

```js
import staticBooks from "./data/books.json";
import staticWantToRead from "./data/wantToRead.json";
```

These arrays become the initial values of `bookData` and `wantToReadData`. The page can therefore render complete content before any runtime API request finishes.

After the first render, a `useEffect` requests both shelf endpoints in parallel:

```text
/api/books.json
/api/want-to-read.json
```

Each response is handled independently:

- a successful JSON array replaces that shelf’s in-memory snapshot;
- a non-success response is ignored;
- a network or JSON error is ignored;
- a non-array JSON payload is ignored.

If one endpoint succeeds and the other fails, only the successful shelf updates. The cleanup flag prevents state changes after the component unmounts.

## Worker request routing

`worker/index.js` distinguishes API requests from static asset requests.

| Path | Behaviour |
| --- | --- |
| `/api/books.json` | Return the saved Goodreads `read` shelf. |
| `/api/want-to-read.json` | Return the saved Goodreads `to-read` shelf. |
| Existing static asset | Serve through the `ASSETS` binding. |
| Missing path with a file extension | Preserve the asset `404`. |
| Missing extensionless path | Serve `/index.html` as a client-side route fallback. |

The route fallback allows extensionless browser routes without hiding missing JavaScript, CSS, image, or other asset errors.

The Worker serves the committed JSON at both API routes with a five-minute browser cache. The bundled data is also available at first render and remains visible if an API request fails.

## Frontend state and derived data

The main React state is:

```js
{
  sortBy: "date-read",
  viewMode: "grid",
  query: "",
  bookData: staticBooks,
  wantToReadData: staticWantToRead
}
```

Filtering, sorting, section grouping, favourites, hero covers, and want-to-read covers are derived with `useMemo()` so they are recalculated only when their relevant inputs change.

### Search

The case-insensitive search combines:

- full title;
- short title;
- author;
- additional authors;
- publisher;
- shelf text.

Search affects the main sections and favourites. It does not filter the want-to-read picker.

### Sort and grouping rules

| Sort | Ordering | Section grouping |
| --- | --- | --- |
| Date read | Newest date first | Read year, newest year first |
| Rating | Highest rating, then newest read date | Rating value, then Unrated |
| Title | Alphabetical title | Single `All Books` section |
| Author | Alphabetical author, then title | Single `All Books` section |
| Year published | Newest publication year first | Decade |
| Pages | Highest page count first | Page-length category |

Page-length groups are:

| Group | Page range |
| --- | --- |
| Epics | `800+` |
| Long Reads | `600–799` |
| Standard Reads | `400–599` |
| Short Reads | `200–399` |
| Quick Reads | `1–199` |
| Unknown | no page count |

The five-star favourites section is always sorted by most recent read date, independently of the selected sort.

### Grid and list views

Grid cards display:

- cover;
- short title;
- author;
- five-star rating;
- read month/year or publication year.

List rows display the fuller title and author metadata, read date, page count, and publication year.

Titles link to the explicit `goodreadsUrl` when present, otherwise a URL is constructed from `goodreadsId` or `id`.

### Cover handling

`getCoverUrl()` prefers `localCover` over `remoteCover`. A remote image failure is remembered inside the `Cover` component and replaced with a text fallback derived from the first letters of the first two title words.

Images use native lazy loading except for the prominent want-to-read or hero covers.

### Want-to-read picker

When the want-to-read shelf contains usable covers, one is selected at random for the hero.

Selecting the cover starts a sequence of progressively slower timeouts. Each step chooses a random index different from the current one, producing a decelerating spin effect. Timeout IDs are retained and cleared before a new spin and when the component unmounts.

If no want-to-read cover is available, the hero falls back to up to eight recent read books with usable covers.

## Committed snapshot refresh

`scripts/refresh-goodreads.mjs` updates:

```text
src/data/books.json
src/data/wantToRead.json
```

Download a fresh CSV from [Goodreads Import and Export](https://www.goodreads.com/review/import), then run:

```sh
npm run refresh:goodreads -- --csv /path/to/goodreads_library_export.csv
```

The export replaces membership of both shelves. Matching books retain existing covers and metadata where the export has no value. Inspect the two JSON diffs before pushing to `main`, which publishes them to the site. Keep the raw CSV out of the public repository.

The scheduled GitHub workflow skips its job until compatible replacement RSS feeds are configured for both shelves. To use replacement feeds, set `GOODREADS_RSS_URL` and `GOODREADS_WANT_TO_READ_RSS_URL` in GitHub Actions repository variables. These must be feeds providing Goodreads book IDs and shelf metadata.

## File map

| File | Responsibility |
| --- | --- |
| `index.html` | Vite document shell and React mount point. |
| `src/main.jsx` | React bootstrap. |
| `src/App.jsx` | Fetch-on-mount, state, search, sorting, grouping, display components, cover fallback, and picker. |
| `src/styles.css` | Responsive layout and component styling. |
| `src/data/books.json` | Bundled read-shelf snapshot. |
| `src/data/wantToRead.json` | Bundled to-read snapshot. |
| `worker/index.js` | Shelf snapshot API and static asset routing. |
| `scripts/refresh-goodreads.mjs` | CSV and optional replacement RSS import. |
| `vite.config.js` | Frontend build configuration. |
| `wrangler.toml` | Worker entry point, asset binding and custom domain. |

## Change map

| Change | Main location |
| --- | --- |
| Snapshot imports and merge rules | `scripts/refresh-goodreads.mjs` |
| Searchable fields | `filteredBooks` in `App.jsx` |
| Sort order | `sortBooks()` |
| Section categories | `groupBooks()` |
| Grid/list card content | `BookCard()` and `BookRow()` |
| Want-to-read animation | `WantToReadPicker()` |
| Cover priority and fallback | `getCoverUrl()` and `Cover()` |


The integration is read-only on Goodreads. The application never writes ratings, shelves, or reviews back to Goodreads.

## Updating and publishing

The live app is https://books.njmurray.com/. Make changes in this repository, run its checks, and push to `main`. GitHub Actions publishes the change to Cloudflare automatically after a successful build. See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact commands, resources, and production checks.
