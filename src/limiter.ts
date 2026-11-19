// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later

export class BusyError extends Error {
  constructor() {
    super('Too many checks are running');
    this.name = 'BusyError';
  }
}

/**
 * At most `maxConcurrent` jobs run at once and at most `maxQueued` wait.
 * Beyond that a job is refused at once rather than piling up: a burst of
 * requests cannot exhaust the server, and the visitor is told to try later.
 */
export class ConcurrencyLimiter {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {}

  get active(): number {
    return this.running;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueued) throw new BusyError();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running++;
    }
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      // Hand the slot straight to the next job; `running` stays the same.
      if (next) next();
      else this.running--;
    }
  }
}
