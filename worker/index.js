import { XMLParser } from "fast-xml-parser";

const BOOKS_PREFIX = "/books";
const GOODREADS_USER_ID = "89023673";
const GOODREADS_CACHE_TTL_SECONDS = 60 * 60 * 24;
const GOODREADS_CACHE_VERSION = "2026-06-21-per-page-200";
const GOODREADS_RSS_PER_PAGE = 200;
const GOODREADS_MAX_RSS_PAGES = 10;
const GOODREADS_API_PATHS = new Map([
  [`${BOOKS_PREFIX}/api/books.json`, "read"],
  [`${BOOKS_PREFIX}/api/want-to-read.json`, "to-read"],
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  textNodeName: "#text",
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === BOOKS_PREFIX) {
      url.pathname = `${BOOKS_PREFIX}/`;
      return Response.redirect(url.toString(), 308);
    }

    if (!url.pathname.startsWith(`${BOOKS_PREFIX}/`)) {
      return new Response("Not Found", { status: 404 });
    }

    const shelf = GOODREADS_API_PATHS.get(url.pathname);
    if (shelf) {
      return getGoodreadsShelfResponse(request, shelf, ctx);
    }

    const assetUrl = new URL(request.url);
    assetUrl.pathname = url.pathname.slice(BOOKS_PREFIX.length) || "/";

    const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (assetResponse.status !== 404 || hasFileExtension(assetUrl.pathname)) {
      return assetResponse;
    }

    assetUrl.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },

  async scheduled(_event, _env, ctx) {
    for (const [path, shelf] of GOODREADS_API_PATHS) {
      ctx.waitUntil(refreshGoodreadsShelfCache(path, shelf));
    }
  },
};

async function getGoodreadsShelfResponse(request, shelf, ctx) {
  const cacheKey = getGoodreadsCacheKey(request);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const response = await buildGoodreadsShelfResponse(shelf);
  if (response.ok) {
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  }
  return response;
}

async function refreshGoodreadsShelfCache(path, shelf) {
  const response = await buildGoodreadsShelfResponse(shelf);
  if (response.ok) {
    const cacheUrl = new URL(`https://njmurray.com${path}`);
    cacheUrl.search = `?v=${GOODREADS_CACHE_VERSION}`;
    await caches.default.put(new Request(cacheUrl.toString()), response.clone());
  }
}

async function buildGoodreadsShelfResponse(shelf) {
  try {
    const books = sortBooks(await readGoodreadsShelf(shelf));

    return jsonResponse(books, 200);
  } catch {
    return jsonResponse({ error: "Goodreads refresh unavailable" }, 502);
  }
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control":
        status < 400
          ? `public, max-age=300, s-maxage=${GOODREADS_CACHE_TTL_SECONDS}`
          : "no-store",
    },
  });
}

function getGoodreadsCacheKey(request) {
  const url = new URL(request.url);
  url.search = `?v=${GOODREADS_CACHE_VERSION}`;
  return new Request(url.toString(), { method: "GET" });
}

async function readGoodreadsShelf(shelf) {
  const books = [];

  for (let page = 1; page <= GOODREADS_MAX_RSS_PAGES; page += 1) {
    const pageBooks = await readGoodreadsShelfPage(shelf, page);
    books.push(...pageBooks);

    if (pageBooks.length < GOODREADS_RSS_PER_PAGE) break;
  }

  return books;
}

async function readGoodreadsShelfPage(shelf, page) {
  const rssResponse = await fetch(getGoodreadsRssUrl(shelf, page), {
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      "User-Agent": "njmurray-books/1.0",
    },
  });

  if (!rssResponse.ok) {
    throw new Error(`Goodreads returned ${rssResponse.status}`);
  }

  const xml = await rssResponse.text();
  return ensureArray(parser.parse(xml).rss?.channel?.item)
    .map(normalizeRssBook)
    .filter(Boolean);
}

function getGoodreadsRssUrl(shelf, page) {
  const url = new URL(`https://www.goodreads.com/review/list_rss/${GOODREADS_USER_ID}`);
  url.searchParams.set("shelf", shelf);
  url.searchParams.set("per_page", String(GOODREADS_RSS_PER_PAGE));
  url.searchParams.set("page", String(page));
  return url.toString();
}

function normalizeRssBook(item) {
  const goodreadsId = cleanString(item.book_id || item.id || getGoodreadsIdFromLink(item.link));
  const title = cleanString(item.book_title || item.title);
  const author = cleanString(item.author_name);
  const isbn = sanitizeIsbn(item.isbn);
  const isbn13 = sanitizeIsbn(item.isbn13);

  if (!goodreadsId || !title) return null;

  return cleanBook({
    id: goodreadsId,
    goodreadsId,
    title,
    shortTitle: getShortTitle(title),
    author,
    isbn,
    isbn13,
    rating: toNumber(item.user_rating),
    pageCount: toNumber(item.book?.num_pages),
    yearPublished: toNumber(item.book_published),
    dateRead: toDate(item.user_read_at),
    dateAdded: toDate(item.user_date_added || item.pubDate),
    shelves: cleanString(item.user_shelves),
    review: cleanString(stripHtml(item.user_review)),
    readCount: 1,
    goodreadsUrl: getGoodreadsBookUrl(goodreadsId),
    remoteCover: firstCoverUrl(
      item.book_large_image_url,
      item.book_medium_image_url,
      item.book_image_url,
      item.book_small_image_url,
    ),
  });
}

function sortBooks(bookList) {
  return [...bookList].sort(
    (left, right) =>
      toTime(right.dateRead || right.dateAdded) -
        toTime(left.dateRead || left.dateAdded) ||
      cleanString(left.title).localeCompare(cleanString(right.title)),
  );
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanBook(book) {
  return Object.fromEntries(
    Object.entries(book).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function sanitizeIsbn(value) {
  const cleaned = cleanString(value)
    .replace(/^="?/, "")
    .replace(/"?$/, "")
    .replace(/[^\dXx]/g, "");
  return cleaned || undefined;
}

function toNumber(value) {
  const number = Number.parseInt(cleanString(value), 10);
  return Number.isFinite(number) ? number : undefined;
}

function toDate(value) {
  const raw = cleanString(value);
  if (!raw || raw.toLowerCase() === "not set") return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) return raw.replaceAll("/", "-");

  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function toTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getShortTitle(title) {
  return cleanString(title).replace(/\s+\([^)]*#\d+[^)]*\)$/u, "");
}

function getGoodreadsIdFromLink(link) {
  return cleanString(link).match(/\/book\/show\/?(\d+)/)?.[1];
}

function getGoodreadsBookUrl(goodreadsId) {
  return goodreadsId ? `https://www.goodreads.com/book/show/${goodreadsId}` : undefined;
}

function firstCoverUrl(...urls) {
  return urls.map(cleanString).find((url) => url && !isPlaceholderCover(url));
}

function isPlaceholderCover(url) {
  return !url || /nophoto|no_cover|nocover/i.test(url);
}

function stripHtml(value) {
  return cleanString(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function hasFileExtension(pathname) {
  return /\/[^/]+\.[^/]+$/.test(pathname);
}
