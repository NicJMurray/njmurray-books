import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse as parseCsv } from "csv-parse/sync";
import { XMLParser } from "fast-xml-parser";

const BOOKS_PATH = "src/data/books.json";
const DEFAULT_CSV_PATH = "data/goodreads_library_export.csv";
const DEFAULT_SHELF = "read";

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
  getRssUrlFromUserId(process.env.GOODREADS_USER_ID, process.env.GOODREADS_SHELF);

const csvPath = args.get("--csv") || process.env.GOODREADS_CSV_PATH;

const existingBooks = await readJson(BOOKS_PATH);
let nextBooks = existingBooks;
let importedCount = 0;

if (csvPath || existsSync(DEFAULT_CSV_PATH)) {
  const resolvedCsvPath = csvPath || DEFAULT_CSV_PATH;
  if (existsSync(resolvedCsvPath)) {
    const csvBooks = await readGoodreadsCsv(resolvedCsvPath);
    nextBooks = mergeBooks(nextBooks, csvBooks);
    importedCount += csvBooks.length;
    console.log(`Imported ${csvBooks.length} books from ${resolvedCsvPath}`);
  } else {
    console.log(`CSV file not found at ${resolvedCsvPath}; skipping CSV import`);
  }
}

if (rssUrl) {
  const rssBooks = await readGoodreadsRss(rssUrl);
  nextBooks = mergeBooks(nextBooks, rssBooks);
  importedCount += rssBooks.length;
  console.log(`Imported ${rssBooks.length} books from Goodreads RSS`);
}

if (importedCount === 0) {
  console.log(
    "No Goodreads source configured. Set GOODREADS_RSS_URL, GOODREADS_USER_ID, or pass --csv.",
  );
  process.exit(0);
}

nextBooks = sortBooks(nextBooks);

const before = JSON.stringify(existingBooks, null, 2);
const after = JSON.stringify(nextBooks, null, 2);

if (before === after) {
  console.log(`No book changes detected. ${nextBooks.length} books already current.`);
  process.exit(0);
}

await writeFile(BOOKS_PATH, `${after}\n`);
console.log(`Updated ${BOOKS_PATH} with ${nextBooks.length} books.`);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function getRssUrlFromUserId(userId, shelf = DEFAULT_SHELF) {
  if (!userId) return "";
  return `https://www.goodreads.com/review/list_rss/${encodeURIComponent(
    userId,
  )}?shelf=${encodeURIComponent(shelf || DEFAULT_SHELF)}`;
}

async function readGoodreadsCsv(filePath) {
  const raw = await readFile(filePath, "utf8");
  const rows = parseCsv(raw, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  });

  return rows
    .map(normalizeCsvBook)
    .filter(Boolean);
}

async function readGoodreadsRss(url) {
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
  const items = parsed?.rss?.channel?.item ?? [];

  return items
    .map(normalizeRssBook)
    .filter(Boolean);
}

function normalizeCsvBook(row) {
  const exclusiveShelf = cleanString(row["Exclusive Shelf"]).toLowerCase();
  if (exclusiveShelf && exclusiveShelf !== "read") return null;

  const id = cleanString(row["Book Id"]);
  const isbn = sanitizeIsbn(row.ISBN);
  const isbn13 = sanitizeIsbn(row.ISBN13);
  const title = cleanString(row.Title);
  const author = cleanString(row.Author);

  if (!id || !title || !author) return null;

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
    readCount: toNumber(row["Read Count"]) || 1,
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
    yearPublished: toNumber(item.book_published),
    dateRead: toDate(item.user_read_at),
    dateAdded: toDate(item.user_date_added || item.pubDate),
    shelves: cleanString(item.user_shelves),
    review: cleanString(stripHtml(item.user_review)),
    readCount: 1,
    remoteCover:
      firstCoverUrl(
        item.book_large_image_url,
        item.book_medium_image_url,
        item.book_image_url,
        item.book_small_image_url,
      ) || getOpenLibraryCover(isbn13, isbn),
  });
}

function mergeBooks(existingBooks, incomingBooks) {
  const booksById = new Map();

  for (const book of existingBooks) {
    booksById.set(getBookKey(book), book);
  }

  for (const incoming of incomingBooks) {
    const key = getBookKey(incoming);
    const existing = booksById.get(key);
    booksById.set(key, mergeBook(existing, incoming));
  }

  return [...booksById.values()];
}

function mergeBook(existing = {}, incoming) {
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
    "shelves",
    "review",
    "localCover",
  ]) {
    if (existing[key] && !incoming[key]) {
      merged[key] = existing[key];
    }
  }

  if (isPlaceholderCover(incoming.remoteCover) && existing.remoteCover) {
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

function firstCoverUrl(...urls) {
  return urls.map(cleanString).find((url) => url && !isPlaceholderCover(url));
}

function isPlaceholderCover(url) {
  return !url || /nophoto|no_cover|nocover/i.test(url);
}

function stripHtml(value) {
  return cleanString(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}
