import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse as parseCsv } from "csv-parse/sync";
import { XMLParser } from "fast-xml-parser";

const BOOKS_PATH = "src/data/books.json";
const WANT_TO_READ_PATH = "src/data/wantToRead.json";
const DEFAULT_CSV_PATH = "data/goodreads_library_export.csv";
const DEFAULT_SHELF = "read";
const GOODREADS_RSS_PER_PAGE = 200;
const GOODREADS_MAX_RSS_PAGES = 10;

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(arg, next);
    index += 1;
  } else {
    args.set(arg, "true");
  }
}

const rssUrl =
  args.get("--rss") ||
  process.env.GOODREADS_RSS_URL ||
  getRssUrlFromListUrl(
    args.get("--list") || process.env.GOODREADS_LIST_URL,
  ) ||
  getRssUrlFromUserId(process.env.GOODREADS_USER_ID, process.env.GOODREADS_SHELF);

const wantToReadRssUrl =
  args.get("--want-rss") ||
  process.env.GOODREADS_WANT_TO_READ_RSS_URL ||
  getRssUrlFromListUrl(
    args.get("--want-list") || process.env.GOODREADS_WANT_TO_READ_LIST_URL,
  );

const csvPath = args.get("--csv") || process.env.GOODREADS_CSV_PATH;

const resolvedCsvPath = csvPath || (existsSync(DEFAULT_CSV_PATH) ? DEFAULT_CSV_PATH : "");
if (!resolvedCsvPath && !rssUrl && !wantToReadRssUrl) {
  throw new Error("Provide a Goodreads library export with --csv or configure a replacement RSS feed.");
}

const csvShelves = resolvedCsvPath ? await readGoodreadsCsv(resolvedCsvPath) : null;
const readRssBooks = rssUrl ? await readGoodreadsRss(rssUrl) : null;
const wantRssBooks = wantToReadRssUrl ? await readGoodreadsRss(wantToReadRssUrl) : null;

if (csvShelves || readRssBooks) {
  await updateShelf(BOOKS_PATH, csvShelves?.get("read"), readRssBooks);
}

if (csvShelves || wantRssBooks) {
  await updateShelf(WANT_TO_READ_PATH, csvShelves?.get("to-read"), wantRssBooks);
}

async function updateShelf(path, csvBooks, rssBooks) {
  const existing = existsSync(path) ? await readJson(path) : [];
  let books = existing;
  if (csvBooks) {
    const csvIds = new Set(csvBooks.map(getBookKey));
    books = mergeBooks(existing.filter((book) => csvIds.has(getBookKey(book))), csvBooks, true);
  }
  if (rssBooks) books = mergeBooks(books, rssBooks);

  const next = JSON.stringify(sortBooks(books), null, 2);
  if (JSON.stringify(existing, null, 2) === next) {
    console.log(`No changes to ${path}. ${books.length} books already current.`);
    return;
  }

  await writeFile(path, `${next}\n`);
  console.log(`Updated ${path} with ${books.length} books.`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function getRssUrlFromUserId(userId, shelf = DEFAULT_SHELF) {
  if (!userId) return "";
  const url = new URL(
    `https://www.goodreads.com/review/list_rss/${encodeURIComponent(userId)}`,
  );
  url.searchParams.set("shelf", shelf || DEFAULT_SHELF);
  url.searchParams.set("per_page", String(GOODREADS_RSS_PER_PAGE));
  return url.toString();
}

function getRssUrlFromListUrl(listUrl) {
  if (!listUrl) return "";
  const url = new URL(listUrl);
  const userId = url.pathname.match(/\/review\/list\/(\d+)/)?.[1];
  if (!userId) return "";

  const shelf = url.searchParams.get("shelf") || DEFAULT_SHELF;
  return getRssUrlFromUserId(userId, shelf);
}

async function readGoodreadsCsv(filePath) {
  const raw = await readFile(filePath, "utf8");
  const rows = parseCsv(raw, {
    columns: (headers) => {
      for (const header of ["Book Id", "Title", "Author", "Exclusive Shelf"]) {
        if (!headers.includes(header)) {
          throw new Error(`Invalid Goodreads export. Missing column: ${header}`);
        }
      }
      return headers;
    },
    bom: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  });

  if (rows.length === 0) throw new Error("The Goodreads export contains no books.");

  const shelves = new Map([["read", []], ["to-read", []]]);
  for (const row of rows) {
    const shelf = shelves.get(cleanString(row["Exclusive Shelf"]).toLowerCase());
    if (shelf) shelf.push(normalizeCsvBook(row));
  }
  console.log(`Read Goodreads library export from ${filePath}.`);
  return shelves;
}

async function readGoodreadsRss(url) {
  const books = [];
  const baseUrl = new URL(url);
  baseUrl.searchParams.set("per_page", String(GOODREADS_RSS_PER_PAGE));

  for (let page = 1; page <= GOODREADS_MAX_RSS_PAGES; page += 1) {
    baseUrl.searchParams.set("page", String(page));
    const pageBooks = await readGoodreadsRssPage(baseUrl.toString());
    books.push(...pageBooks);

    if (pageBooks.length < GOODREADS_RSS_PER_PAGE) break;
  }

  return books;
}

async function readGoodreadsRssPage(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "njmurray-books-refresh/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Goodreads RSS request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
    isArray: (_name, jpath) => jpath === "rss.channel.item",
  });
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel) throw new Error("The replacement feed did not return an RSS channel.");
  const items = channel.item ?? [];

  return items
    .map(normalizeRssBook)
    .filter(Boolean);
}

function normalizeCsvBook(row) {
  const id = cleanString(row["Book Id"]);
  const isbn = sanitizeIsbn(row.ISBN);
  const isbn13 = sanitizeIsbn(row.ISBN13);
  const title = cleanString(row.Title);
  const author = cleanString(row.Author);

  if (!id || !title || !author) {
    throw new Error("A Goodreads export row is missing a book ID, title, or author.");
  }

  return cleanBook({
    id,
    goodreadsId: id,
    title,
    shortTitle: getShortTitle(title),
    author,
    additionalAuthors: cleanString(row["Additional Authors"]),
    isbn,
    isbn13,
    rating: toNumber(row["My Rating"]),
    publisher: cleanString(row.Publisher),
    binding: cleanString(row.Binding),
    pageCount: toNumber(row["Number of Pages"]),
    yearPublished: toNumber(row["Year Published"]),
    originalYear: toNumber(row["Original Publication Year"]),
    dateRead: toDate(row["Date Read"]),
    dateAdded: toDate(row["Date Added"]),
    shelves: cleanString(row.Bookshelves),
    review: cleanString(row["My Review"]),
    readCount: toNumber(row["Read Count"]) ?? (row["Exclusive Shelf"] === "read" ? 1 : 0),
    goodreadsUrl: getGoodreadsBookUrl(id),
    remoteCover: getOpenLibraryCover(isbn13, isbn),
  });
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
    remoteCover:
      firstCoverUrl(
        item.book_large_image_url,
        item.book_medium_image_url,
        item.book_image_url,
        item.book_small_image_url,
      ) || getOpenLibraryCover(isbn13, isbn),
  });
}

function mergeBooks(existingBooks, incomingBooks, preferExistingCover = false) {
  const booksById = new Map();

  for (const book of existingBooks) {
    booksById.set(getBookKey(book), book);
  }

  for (const incoming of incomingBooks) {
    const key = getBookKey(incoming);
    const existing = booksById.get(key);
    booksById.set(key, mergeBook(existing, incoming, preferExistingCover));
  }

  return [...booksById.values()];
}

function mergeBook(existing = {}, incoming, preferExistingCover) {
  const merged = {
    ...existing,
    ...incoming,
  };

  for (const key of [
    "additionalAuthors",
    "publisher",
    "binding",
    "pageCount",
    "yearPublished",
    "originalYear",
    "isbn",
    "isbn13",
    "shelves",
    "review",
    "localCover",
  ]) {
    if (existing[key] && !incoming[key]) {
      merged[key] = existing[key];
    }
  }

  if ((preferExistingCover || isPlaceholderCover(incoming.remoteCover)) && !isPlaceholderCover(existing.remoteCover)) {
    merged.remoteCover = existing.remoteCover;
  }

  return cleanBook(merged);
}

function getBookKey(book) {
  return book.goodreadsId || book.id || book.isbn13 || book.isbn || book.title;
}

function sortBooks(bookList) {
  return [...bookList].sort(
    (left, right) =>
      toTime(right.dateRead || right.dateAdded) -
        toTime(left.dateRead || left.dateAdded) ||
      cleanString(left.title).localeCompare(cleanString(right.title)),
  );
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
  return cleanString(link).match(/\/(?:book\/show|book\/show\/|book\/show\/)(\d+)/)?.[1];
}

function getOpenLibraryCover(isbn13, isbn) {
  const value = isbn13 || isbn;
  return value ? `https://covers.openlibrary.org/b/isbn/${value}-L.jpg?default=false` : undefined;
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
