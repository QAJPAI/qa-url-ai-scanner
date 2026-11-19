// Copyright (C) 2026 iQi
// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Collection, MongoClient } from 'mongodb';
import {
  type AuditEntry,
  type LoginToken,
  type OwnerResult,
  type OwnerSession,
  type Store,
  type StoredResult,
  windowEnd,
  windowKey,
} from './types';

interface CounterDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}

type ResultDoc = Omit<StoredResult, 'id'> & { _id: string };
type TokenDoc = Omit<LoginToken, 'hash'> & { _id: string };
type SessionDoc = Omit<OwnerSession, 'hash'> & { _id: string };
type OwnerResultDoc = Omit<OwnerResult, 'id'> & { _id: string };

/**
 * MongoDB storage. Old documents are removed by TTL indexes on `expiresAt`,
 * so retention is enforced by the database, not by a job someone must run.
 * (MongoDB removes expired documents about once a minute, so every read also
 * checks `expiresAt` itself.)
 */
export class MongoStore implements Store {
  private constructor(
    private readonly client: MongoClient,
    private readonly results: Collection<ResultDoc>,
    private readonly counters: Collection<CounterDoc>,
    private readonly auditLog: Collection<AuditEntry>,
    private readonly tokens: Collection<TokenDoc>,
    private readonly sessions: Collection<SessionDoc>,
    private readonly ownerResults: Collection<OwnerResultDoc>,
  ) {}

  static async connect(uri: string, dbName: string): Promise<MongoStore> {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(dbName);
    const store = new MongoStore(
      client,
      db.collection<ResultDoc>('results'),
      db.collection<CounterDoc>('counters'),
      db.collection<AuditEntry>('audit'),
      db.collection<TokenDoc>('login_tokens'),
      db.collection<SessionDoc>('owner_sessions'),
      db.collection<OwnerResultDoc>('owner_results'),
    );
    await Promise.all([
      store.results.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      store.results.createIndex({ target: 1, createdAt: -1 }),
      store.counters.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      store.auditLog.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      store.auditLog.createIndex({ ip: 1, at: -1 }),
      store.tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      store.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      store.ownerResults.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    return store;
  }

  async saveResult(result: StoredResult): Promise<void> {
    const { id, ...rest } = result;
    await this.results.insertOne({ _id: id, ...rest });
  }

  async getResult(id: string, now: Date): Promise<StoredResult | null> {
    const doc = await this.results.findOne({ _id: id, expiresAt: { $gt: now } });
    return doc ? toResult(doc) : null;
  }

  async recentResult(target: string, since: Date, now: Date): Promise<StoredResult | null> {
    const doc = await this.results.findOne(
      { target, createdAt: { $gte: since }, expiresAt: { $gt: now } },
      { sort: { createdAt: -1 } },
    );
    return doc ? toResult(doc) : null;
  }

  async hit(key: string, windowMs: number, now: Date): Promise<number> {
    const doc = await this.counters.findOneAndUpdate(
      { _id: windowKey(key, windowMs, now) },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: windowEnd(windowMs, now) } },
      { upsert: true, returnDocument: 'after' },
    );
    return doc?.count ?? 1;
  }

  async audit(entry: AuditEntry): Promise<void> {
    await this.auditLog.insertOne({ ...entry });
  }

  async saveLoginToken(token: LoginToken): Promise<void> {
    const { hash, ...rest } = token;
    await this.tokens.insertOne({ _id: hash, ...rest });
  }

  async peekLoginToken(hash: string, now: Date): Promise<LoginToken | null> {
    const doc = await this.tokens.findOne({ _id: hash, expiresAt: { $gt: now } });
    return doc ? fromDoc(doc, 'hash') : null;
  }

  async takeLoginToken(hash: string, now: Date): Promise<LoginToken | null> {
    // findOneAndDelete is atomic: two clicks on one link cannot both succeed.
    const doc = await this.tokens.findOneAndDelete({ _id: hash });
    return doc && doc.expiresAt > now ? fromDoc(doc, 'hash') : null;
  }

  async saveSession(session: OwnerSession): Promise<void> {
    const { hash, ...rest } = session;
    await this.sessions.insertOne({ _id: hash, ...rest });
  }

  async getSession(hash: string, now: Date): Promise<OwnerSession | null> {
    const doc = await this.sessions.findOne({ _id: hash, expiresAt: { $gt: now } });
    return doc ? fromDoc(doc, 'hash') : null;
  }

  async deleteSession(hash: string): Promise<void> {
    await this.sessions.deleteOne({ _id: hash });
  }

  async saveOwnerResult(result: OwnerResult): Promise<void> {
    const { id, ...rest } = result;
    await this.ownerResults.insertOne({ _id: id, ...rest });
  }

  async getOwnerResult(id: string, now: Date): Promise<OwnerResult | null> {
    const doc = await this.ownerResults.findOne({ _id: id, expiresAt: { $gt: now } });
    return doc ? fromDoc(doc, 'id') : null;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function fromDoc<T, K extends string>(doc: { _id: string } & Omit<T, K>, key: K): T {
  const { _id, ...rest } = doc;
  return { [key]: _id, ...rest } as T;
}

function toResult(doc: ResultDoc): StoredResult {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}
