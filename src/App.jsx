import { BookOpen, Grid2X2, List, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import books from "./data/books.json";

const SORT_OPTIONS = [
  { value: "date-read", label: "Date read" },
  { value: "rating", label: "Rating" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "year-published", label: "Year published" },
  { value: "pages", label: "Pages" },
];

export default function App() {
  const [sortBy, setSortBy] = useState("date-read");
  const [viewMode, setViewMode] = useState("grid");
  const [query, setQuery] = useState("");

  const filteredBooks = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return books;

    return books.filter((book) =>
      [
        book.title,
        book.shortTitle,
        book.author,
        book.additionalAuthors,
        book.publisher,
        book.shelves,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [query]);

  const sortedBooks = useMemo(
    () => sortBooks(filteredBooks, sortBy),
    [filteredBooks, sortBy],
  );
  const sections = useMemo(
    () => groupBooks(sortedBooks, sortBy),
    [sortedBooks, sortBy],
  );
  const favourites = useMemo(
    () => sortBooks(filteredBooks.filter((book) => book.rating === 5), "date-read"),
    [filteredBooks],
  );
  const heroBooks = useMemo(
    () => sortBooks(books, "date-read").filter(getCoverUrl).slice(0, 8),
    [],
  );

  return (
    <div className="site-shell">
      <Header />

      <main className="main">
        <section className="intro">
          <div className="intro__copy">
            <p className="eyebrow">Reading List</p>
            <h1>Nic's Reading List</h1>
            {favourites.length > 0 ? (
              <a className="jump-link" href="#favourites">
                Jump to favourites
              </a>
            ) : null}
          </div>
          {heroBooks.length > 0 ? <HeroShelf books={heroBooks} /> : null}
        </section>

        <section className="toolbar" aria-label="Book controls">
          <label className="search" htmlFor="book-search">
            <Search aria-hidden="true" size={18} />
            <input
              id="book-search"
              type="search"
              placeholder="Search books"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="select" htmlFor="sort-books">
            <span>Sort</span>
            <select
              id="sort-books"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="view-toggle" aria-label="View mode">
            <button
              type="button"
              className={viewMode === "grid" ? "is-active" : ""}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              title="Grid view"
            >
              <Grid2X2 aria-hidden="true" size={18} />
            </button>
            <button
              type="button"
              className={viewMode === "list" ? "is-active" : ""}
              onClick={() => setViewMode("list")}
              aria-label="List view"
              title="List view"
            >
              <List aria-hidden="true" size={18} />
            </button>
          </div>
        </section>

        {books.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {sections.map((section) => (
              <BookSection
                key={section.key}
                title={section.title}
                subtitle={section.subtitle}
                books={section.books}
                viewMode={viewMode}
              />
            ))}
            {favourites.length > 0 ? (
              <BookSection
                id="favourites"
                title="Favourites"
                books={favourites}
                viewMode={viewMode}
                isFeatured
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="header">
      <a
        href="https://njmurray.com"
        className="brand"
        aria-label="njmurray homepage"
      >
        <BookOpen aria-hidden="true" size={20} />
        <span>njmurray</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="https://njmurray.com">Home</a>
        <a href="/books/" aria-current="page">
          Books
        </a>
      </nav>
    </header>
  );
}

function HeroShelf({ books: heroBooks }) {
  return (
    <div className="hero-shelf" aria-hidden="true">
      {heroBooks.map((book) => {
        const cover = getCoverUrl(book);
        return cover ? (
          <div className="hero-shelf__book" key={book.id}>
            <img src={cover} alt="" loading="eager" />
          </div>
        ) : null;
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="empty-state">
      <BookOpen aria-hidden="true" size={32} />
      <h2>No books imported yet</h2>
      <p>The reading list will appear here after the Goodreads refresh runs.</p>
    </section>
  );
}

function BookSection({
  id,
  title,
  subtitle,
  books: sectionBooks,
  viewMode,
  isFeatured = false,
}) {
  return (
    <section
      id={id}
      className={isFeatured ? "book-section book-section--featured" : "book-section"}
    >
      <div className="section-heading">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {viewMode === "grid" ? (
        <div className="book-grid">
          {sectionBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <div className="book-list">
          {sectionBooks.map((book) => (
            <BookRow key={book.id} book={book} />
          ))}
        </div>
      )}
    </section>
  );
}

function BookCard({ book }) {
  return (
    <article className="book-card">
      <Cover book={book} />
      <div className="book-card__body">
        <h3 title={book.title}>{book.shortTitle || book.title}</h3>
        <p>{book.author}</p>
        <div className="book-meta">
          <Rating value={book.rating} />
          <span>{formatMonth(book.dateRead) || book.yearPublished || "Unread date"}</span>
        </div>
      </div>
    </article>
  );
}

function BookRow({ book }) {
  return (
    <article className="book-row">
      <Cover book={book} compact />
      <div className="book-row__body">
        <div>
          <h3>{book.title}</h3>
          <p>
            {book.author}
            {book.additionalAuthors ? `, ${book.additionalAuthors}` : ""}
          </p>
        </div>
        <div className="book-row__meta">
          <Rating value={book.rating} />
          <span>{formatMonth(book.dateRead) || "Date not tracked"}</span>
          {book.pageCount ? <span>{formatNumber(book.pageCount)} pages</span> : null}
          {book.yearPublished ? <span>{book.yearPublished}</span> : null}
        </div>
      </div>
    </article>
  );
}

function Cover({ book, compact = false }) {
  const [hasError, setHasError] = useState(false);
  const cover = getCoverUrl(book);

  return (
    <div className={compact ? "cover cover--compact" : "cover"}>
      {cover && !hasError ? (
        <img
          src={cover}
          alt={`Cover of ${book.title}`}
          loading="lazy"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="cover__fallback" aria-hidden="true">
          <span>{getInitials(book.shortTitle || book.title)}</span>
        </div>
      )}
    </div>
  );
}

function Rating({ value }) {
  const rating = Number(value || 0);

  return (
    <span
      className="rating"
      aria-label={rating > 0 ? `${rating} out of 5 stars` : "Unrated"}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          size={14}
          strokeWidth={1.6}
          className={
            index < rating ? "rating__star rating__star--filled" : "rating__star"
          }
        />
      ))}
    </span>
  );
}

function sortBooks(bookList, sortBy) {
  return [...bookList].sort((left, right) => {
    switch (sortBy) {
      case "date-read":
        return toTime(right.dateRead) - toTime(left.dateRead);
      case "rating":
        return (
          (right.rating || 0) - (left.rating || 0) ||
          toTime(right.dateRead) - toTime(left.dateRead)
        );
      case "title":
        return left.title.localeCompare(right.title);
      case "author":
        return left.author.localeCompare(right.author) || left.title.localeCompare(right.title);
      case "year-published":
        return (right.yearPublished || 0) - (left.yearPublished || 0);
      case "pages":
        return (right.pageCount || 0) - (left.pageCount || 0);
      default:
        return 0;
    }
  });
}

function groupBooks(bookList, sortBy) {
  if (sortBy === "date-read") {
    return Object.entries(groupBy(bookList, (book) => getReadYear(book) ?? "Date not tracked"))
      .sort(([left], [right]) =>
        left === "Date not tracked"
          ? 1
          : right === "Date not tracked"
            ? -1
            : Number(right) - Number(left),
      )
      .map(([year, yearBooks]) => ({
        key: year,
        title: year,
        subtitle: getBookCountText(yearBooks.length),
        books: yearBooks,
      }));
  }

  if (sortBy === "rating") {
    return Object.entries(groupBy(bookList, (book) => (book.rating ? `${book.rating}` : "Unrated")))
      .sort(([left], [right]) =>
        left === "Unrated"
          ? 1
          : right === "Unrated"
            ? -1
            : Number(right) - Number(left),
      )
      .map(([rating, ratingBooks]) => ({
        key: rating,
        title: rating === "Unrated" ? "Unrated" : `${rating} Star`,
        subtitle: getBookCountText(ratingBooks.length),
        books: ratingBooks,
      }));
  }

  if (sortBy === "year-published") {
    return Object.entries(
      groupBy(bookList, (book) =>
        book.yearPublished ? `${Math.floor(book.yearPublished / 10) * 10}s` : "Unknown",
      ),
    )
      .sort(([left], [right]) =>
        left === "Unknown"
          ? 1
          : right === "Unknown"
            ? -1
            : Number.parseInt(right, 10) - Number.parseInt(left, 10),
      )
      .map(([decade, decadeBooks]) => ({
        key: decade,
        title: decade,
        subtitle: getBookCountText(decadeBooks.length),
        books: decadeBooks,
      }));
  }

  if (sortBy === "pages") {
    const pageGroups = ["Epics", "Long Reads", "Standard Reads", "Short Reads", "Quick Reads", "Unknown"];
    const grouped = groupBy(bookList, (book) => {
      const pages = book.pageCount || 0;
      if (!pages) return "Unknown";
      if (pages >= 800) return "Epics";
      if (pages >= 600) return "Long Reads";
      if (pages >= 400) return "Standard Reads";
      if (pages >= 200) return "Short Reads";
      return "Quick Reads";
    });

    return pageGroups
      .filter((group) => grouped[group])
      .map((group) => ({
        key: group,
        title: group,
        subtitle: getBookCountText(grouped[group].length),
        books: grouped[group],
      }));
  }

  return [
    {
      key: sortBy,
      title: "All Books",
      subtitle: getBookCountText(bookList.length),
      books: bookList,
    },
  ];
}

function groupBy(bookList, getKey) {
  return bookList.reduce((groups, book) => {
    const key = getKey(book);
    groups[key] ||= [];
    groups[key].push(book);
    return groups;
  }, {});
}

function getCoverUrl(book) {
  return book.localCover ? `/books/${book.localCover.replace(/^\/+/, "")}` : book.remoteCover;
}

function getReadYear(book) {
  if (!book.dateRead) return undefined;
  const year = new Date(book.dateRead).getFullYear();
  return Number.isFinite(year) ? String(year) : undefined;
}

function toTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatMonth(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(date)
    : "";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function getInitials(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function getBookCountText(count) {
  return `${count} ${count === 1 ? "book" : "books"}`;
}
