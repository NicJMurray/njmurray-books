const BOOKS_PREFIX = "/books";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === BOOKS_PREFIX) {
      url.pathname = `${BOOKS_PREFIX}/`;
      return Response.redirect(url.toString(), 308);
    }

    if (!url.pathname.startsWith(`${BOOKS_PREFIX}/`)) {
      return new Response("Not Found", { status: 404 });
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
};

function hasFileExtension(pathname) {
  return /\/[^/]+\.[^/]+$/.test(pathname);
}
