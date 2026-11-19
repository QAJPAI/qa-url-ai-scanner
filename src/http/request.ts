// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * The visitor's address. X-Real-IP (set by nginx) is believed only when the
 * connection itself comes from this machine and the proxy is trusted;
 * otherwise anyone could pick their own address and escape the limits.
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  const peer = req.socket.remoteAddress ?? 'unknown';
  if (trustProxy && LOOPBACK.has(peer)) {
    const header = req.headers['x-real-ip'];
    const value = Array.isArray(header) ? header[0] : header;
    if (value && isIP(value.trim())) return value.trim();
  }
  return peer;
}

/**
 * A form POST must come from url.jp.ai's own pages. Browsers send Origin on
 * form posts; without this, any other site could make its visitors' browsers
 * start checks, spreading them over many addresses to get round the limits.
 */
export function isSameOrigin(req: IncomingMessage, baseUrl: URL): boolean {
  const origin = req.headers.origin;
  // "null" is sent for privacy reasons as well as by sandboxed frames; then
  // the browser's own Sec-Fetch-Site decides, which a page cannot set.
  if (origin !== undefined && origin !== 'null') return origin === baseUrl.origin;
  return req.headers['sec-fetch-site'] === 'same-origin';
}

export class BodyTooLargeError extends Error {}

/** Read a small urlencoded form body. Anything larger than `maxBytes` is refused. */
export async function readForm(req: IncomingMessage, maxBytes = 4096): Promise<URLSearchParams> {
  const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') return new URLSearchParams();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new BodyTooLargeError();
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
