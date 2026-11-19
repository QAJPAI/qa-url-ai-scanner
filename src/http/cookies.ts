// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Two cookies, both only for people verifying ownership; nobody else gets one.
 *   sid: a verified owner's session (24 hours at most).
 *   vid: an anonymous id that keeps the file / DNS verification code stable
 *        while the owner sets it up.
 * Over https they use the __Host- prefix: Secure, Path=/, no Domain, so no
 * other host can set or read them.
 */
export interface CookieNames {
  session: string;
  verifier: string;
  secure: boolean;
}

export function cookieNames(baseUrl: URL): CookieNames {
  const secure = baseUrl.protocol === 'https:';
  return {
    session: secure ? '__Host-sid' : 'sid',
    verifier: secure ? '__Host-vid' : 'vid',
    secure,
  };
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return part.slice(eq + 1).trim() || undefined;
  }
  return undefined;
}

export function setCookie(names: CookieNames, name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(names.secure ? ['Secure'] : []),
  ].join('; ');
}

export const clearCookie = (names: CookieNames, name: string) => setCookie(names, name, '', 0);

export const newSecret = (): string => randomBytes(32).toString('base64url');

/** What is stored in place of a secret: its hash. A copy of the database opens no session. */
export const hashSecret = (value: string): string => createHash('sha256').update(value).digest('base64url');
