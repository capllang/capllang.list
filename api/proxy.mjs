const UPSTREAM_ORIGIN = 'https://jsonbin-proxy.awak-cot-u-sibak.workers.dev';
const FRONTEND_ORIGIN = 'https://capllang-list.vercel.app';
const SESSION_COOKIE = 'admin_session';
const MAX_BODY_BYTES = 16 * 1024;

const ROUTES = [
  { pattern: /^health$/, methods: new Set(['GET']) },
  { pattern: /^auth\/login$/, methods: new Set(['POST']) },
  { pattern: /^auth\/me$/, methods: new Set(['GET']) },
  { pattern: /^auth\/logout$/, methods: new Set(['POST']) },
  { pattern: /^admin\/audit$/, methods: new Set(['GET']) },
  { pattern: /^records$/, methods: new Set(['GET', 'POST']) },
  { pattern: /^records\/[^/]+$/, methods: new Set(['GET', 'PUT', 'DELETE']) }
];

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE']);

function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const cookie = headers.get('set-cookie');
  return cookie ? [cookie] : [];
}

function jsonError(message, status, extraHeaders = {}) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow, noarchive',
        ...extraHeaders
      }
    }
  );
}

function getRoute(path) {
  return ROUTES.find(route => route.pattern.test(path)) || null;
}

function normalizePath(value) {
  const path = String(value || '').replace(/^\/+|\/+$/g, '');

  // Tolak karakter yang dapat mengubah interpretasi URL upstream.
  if (
    !path ||
    path === 'proxy' ||
    path.includes('\\') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('..') ||
    /%2f|%5c/i.test(path)
  ) {
    return null;
  }

  return path;
}

function isTrustedBrowserOrigin(request) {
  return request.headers.get('origin') === FRONTEND_ORIGIN;
}

export default {
  async fetch(request) {
    try {
      const incomingUrl = new URL(request.url);
      const rawPath = normalizePath(incomingUrl.searchParams.get('path'));

      if (!rawPath) {
        return jsonError('Invalid API proxy path.', 400);
      }

      const route = getRoute(rawPath);
      if (!route) {
        return jsonError('API route not allowed.', 404);
      }

      const method = request.method.toUpperCase();
      if (!route.methods.has(method)) {
        return jsonError(
          'Method not allowed.',
          405,
          { allow: [...route.methods].join(', ') }
        );
      }

      // Semua request yang mengubah state wajib benar-benar berasal dari
      // frontend resmi. Proxy tidak lagi "memutihkan" Origin yang tidak valid.
      if (STATE_CHANGING_METHODS.has(method) && !isTrustedBrowserOrigin(request)) {
        return jsonError('Origin not allowed.', 403);
      }

      let body;
      if (method !== 'GET' && method !== 'HEAD') {
        const declaredLength = Number(request.headers.get('content-length') || 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
          return jsonError('Request body too large.', 413);
        }

        body = await request.arrayBuffer();
        if (body.byteLength > MAX_BODY_BYTES) {
          return jsonError('Request body too large.', 413);
        }
      }

      const upstreamUrl = new URL(`/${rawPath}`, UPSTREAM_ORIGIN);
      for (const [key, value] of incomingUrl.searchParams.entries()) {
        if (key !== 'path') upstreamUrl.searchParams.append(key, value);
      }

      const upstreamHeaders = new Headers();
      for (const name of ['accept', 'accept-language', 'content-type', 'user-agent']) {
        const value = request.headers.get(name);
        if (value) upstreamHeaders.set(name, value);
      }

      const cookieHeader = request.headers.get('cookie') || '';
      const sessionToken = parseCookies(cookieHeader)[SESSION_COOKIE] || '';

      if (sessionToken) {
        // Cookie adalah satu-satunya representasi sesi yang diteruskan.
        // Worker tetap melakukan verifikasi signature + status sesi di D1.
        upstreamHeaders.set('cookie', `${SESSION_COOKIE}=${sessionToken}`);
      }

      // Worker memerlukan Origin resmi pada route state-changing.
      // Nilai ini hanya dipasang setelah Origin browser lolos validasi di atas.
      if (STATE_CHANGING_METHODS.has(method)) {
        upstreamHeaders.set('origin', FRONTEND_ORIGIN);
      }

      const upstream = await fetch(upstreamUrl, {
        method,
        headers: upstreamHeaders,
        body,
        redirect: 'manual'
      });

      const responseHeaders = new Headers();
      for (const name of [
        'content-type',
        'cache-control',
        'etag',
        'retry-after',
        'location',
        'x-request-id',
        'x-robots-tag'
      ]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }

      if (!responseHeaders.has('x-robots-tag')) {
        responseHeaders.set('x-robots-tag', 'noindex, nofollow, noarchive');
      }

      // Semua respons auth/admin bersifat private dan tidak boleh dicache.
      if (rawPath.startsWith('auth/') || rawPath.startsWith('admin/')) {
        responseHeaders.set('cache-control', 'no-store, private');
      }

      for (const cookie of getSetCookies(upstream.headers)) {
        responseHeaders.append('set-cookie', cookie);
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders
      });
    } catch (error) {
      console.error('API proxy error:', error);
      return jsonError('API proxy temporarily unavailable.', 502);
    }
  }
};
