import books from "../src/data/books.json";
import wantToRead from "../src/data/wantToRead.json";

const shelfSnapshots = new Map([
  ["/api/books.json", books],
  ["/api/want-to-read.json", wantToRead],
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (shelfSnapshots.has(url.pathname)) {
      return Response.json(shelfSnapshots.get(url.pathname), {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    }

    const assetUrl = new URL(request.url);

    const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (assetResponse.status !== 404 || hasFileExtension(assetUrl.pathname)) {
      return assetResponse;
    }

    assetUrl.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};

function hasFileExtension(pathname) {
  return /\/[^/]+\.[^/]+$/.test(pathname);
}
