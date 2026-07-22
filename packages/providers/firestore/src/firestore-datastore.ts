import type { Firestore, Query, Transaction } from 'firebase-admin/firestore';
import {
  DataStoreError,
  isCollectionPath,
  isDocumentPath,
  type DataStore,
  type DocData,
  type QueryResult,
  type QuerySpec,
  type TransactionContext,
  type WriteOp,
} from '@mbh/provider-interfaces';

// The real DataStore, backed by Cloud Firestore (Admin SDK). It is the ONLY
// package that imports firebase-admin. It must pass the SAME contract suite
// the in-memory mock passes — that equivalence is what makes CI's mock-first
// results trustworthy in production.
//
// Transaction writes are buffered and flushed after the user callback so all
// Firestore reads precede all Firestore writes (Firestore's rule), while the
// callback can still read-then-write in natural order. The buffer is local to
// each callback invocation, so Firestore's automatic retry-on-contention
// re-runs cleanly.

export class FirestoreDataStore implements DataStore {
  constructor(private readonly db: Firestore) {}

  private docRef(path: string) {
    if (!isDocumentPath(path)) {
      throw new DataStoreError('invalid-path', `Not a document path: ${path}`);
    }
    return this.db.doc(path);
  }

  private buildQuery(spec: QuerySpec): Query {
    if (!isCollectionPath(spec.collection)) {
      throw new DataStoreError('invalid-path', `Not a collection path: ${spec.collection}`);
    }
    let q: Query = this.db.collection(spec.collection);
    for (const f of spec.filters ?? []) {
      q = q.where(f.field, '==', f.value);
    }
    if (spec.limit !== undefined) {
      q = q.limit(spec.limit);
    }
    return q;
  }

  async getDoc(path: string): Promise<DocData | null> {
    const snap = await this.docRef(path).get();
    return snap.exists ? (snap.data() as DocData) : null;
  }

  async query(spec: QuerySpec): Promise<QueryResult[]> {
    const snap = await this.buildQuery(spec).get();
    return snap.docs.map((d) => ({ path: d.ref.path, data: d.data() as DocData }));
  }

  async runBatch(ops: readonly WriteOp[]): Promise<void> {
    for (const op of ops) {
      if (!isDocumentPath(op.path)) {
        throw new DataStoreError('invalid-path', `Not a document path: ${op.path}`);
      }
    }
    const batch = this.db.batch();
    for (const op of ops) {
      const ref = this.db.doc(op.path);
      if (op.kind === 'create') batch.create(ref, op.data);
      else if (op.kind === 'set') batch.set(ref, op.data);
      else if (op.kind === 'update') batch.update(ref, op.data);
      else batch.delete(ref);
    }
    try {
      await batch.commit();
    } catch (err) {
      throw mapFirestoreError(err);
    }
  }

  async runTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    try {
      return await this.db.runTransaction(async (ftx: Transaction) => {
        const buffered: WriteOp[] = [];
        const tx: TransactionContext = {
          get: async (path) => {
            const snap = await ftx.get(this.docRef(path));
            return snap.exists ? (snap.data() as DocData) : null;
          },
          query: async (spec) => {
            const snap = await ftx.get(this.buildQuery(spec));
            return snap.docs.map((d) => ({ path: d.ref.path, data: d.data() as DocData }));
          },
          write: (op) => {
            if (!isDocumentPath(op.path)) {
              throw new DataStoreError('invalid-path', `Not a document path: ${op.path}`);
            }
            buffered.push(op);
          },
        };

        const result = await fn(tx);

        // Flush buffered writes now — after every read this attempt made.
        for (const op of buffered) {
          const ref = this.db.doc(op.path);
          if (op.kind === 'create') ftx.create(ref, op.data);
          else if (op.kind === 'set') ftx.set(ref, op.data);
          else if (op.kind === 'update') ftx.update(ref, op.data);
          else ftx.delete(ref);
        }
        return result;
      });
    } catch (err) {
      throw mapFirestoreError(err);
    }
  }
}

// Map Firestore's gRPC failures onto the DataStore contract's error codes so
// callers get identical behaviour to the in-memory store. DataStoreErrors
// (e.g. invalid-path thrown in tx.write) pass through unchanged.
function mapFirestoreError(err: unknown): Error {
  if (err instanceof DataStoreError) return err;
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined;
  const message = err instanceof Error ? err.message : String(err);
  // gRPC: 6 = ALREADY_EXISTS, 5 = NOT_FOUND.
  if (code === 6 || /ALREADY_EXISTS/i.test(message)) {
    return new DataStoreError('already-exists', message);
  }
  if (code === 5 || /NOT_FOUND|No document to update/i.test(message)) {
    return new DataStoreError('not-found', message);
  }
  return err instanceof Error ? err : new Error(message);
}
