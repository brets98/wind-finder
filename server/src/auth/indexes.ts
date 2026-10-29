import type { Db } from 'mongodb';

/**
 * Indexes for Better Auth's collections, which it does not create on MongoDB.
 * TTL indexes delete expired sessions and verification tokens. Safe to run on
 * every startup: existing indexes are left as they are.
 */
export async function ensureAuthIndexes(db: Db) {
  await Promise.all([
    db.collection('sessions').createIndex({ token: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ userId: 1 }),
    db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('accounts').createIndex({ userId: 1 }),
    db.collection('accounts').createIndex({ providerId: 1, accountId: 1 }),
    db.collection('verifications').createIndex({ identifier: 1 }),
    db.collection('verifications').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
