/**
 * harFactory.ts — Generates synthetic HAR objects for tests that
 * need data beyond what sample.har provides (e.g. truncation tests).
 */

const METHODS  = ['GET', 'POST', 'PUT', 'DELETE'] as const;
const STATUSES = [200, 201, 204, 301, 400, 404, 500] as const;
const MIMES    = [
  'application/json',
  'text/html',
  'text/css',
  'application/javascript',
] as const;
const DOMAINS  = [
  'api.example.com',
  'cdn.example.com',
  'static.example.com',
] as const;

/**
 * Produce a valid HAR object with `count` entries.
 * Entries cycle through methods, statuses, MIMEs and domains so the
 * fixture has realistic variety without being hand-crafted.
 */
export function generateHar(count: number): object {
  const entries = Array.from({ length: count }, (_, i) => ({
    startedDateTime: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    time: 50 + (i % 500),
    request: {
      method:      METHODS[i % METHODS.length],
      url:         `https://${DOMAINS[i % DOMAINS.length]}/resource-${i}`,
      httpVersion: 'HTTP/1.1',
      headers:     [],
      queryString: [],
      cookies:     [],
      headersSize: 100,
      bodySize:    0,
    },
    response: {
      status:      STATUSES[i % STATUSES.length],
      statusText:  'OK',
      httpVersion: 'HTTP/1.1',
      headers:     [],
      cookies:     [],
      content:     { size: 256 + i, mimeType: MIMES[i % MIMES.length] },
      redirectURL: '',
      headersSize: 100,
      bodySize:    256 + i,
    },
    cache:   {},
    timings: { send: 5, wait: 40 + (i % 450), receive: 5 },
  }));

  return {
    log: {
      version: '1.2',
      creator: { name: 'HAR Factory', version: '1.0' },
      entries,
    },
  };
}
