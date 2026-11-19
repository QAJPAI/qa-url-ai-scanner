// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ServerResponse } from 'node:http';

/**
 * Headers on every response. The pages use no script at all, so the content
 * security policy allows none; styles come from our own stylesheet only.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Result pages have unguessable addresses; never pass them on to other sites.
  // Not 'no-referrer': with it, browsers send "Origin: null" on our own form
  // posts, and the same-origin check could no longer recognise them.
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = 'text/html; charset=utf-8',
  extra: Record<string, string> = {},
): void {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(body);
}

export function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { ...SECURITY_HEADERS, Location: location, 'Cache-Control': 'no-store' });
  res.end();
}
