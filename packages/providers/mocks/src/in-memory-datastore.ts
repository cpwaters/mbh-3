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

// The scriptable in-memory DataStore — the CI default. Semantics are pinned
// by the shared contract suite, which the real provider must also pass.
//
// Atomicity: batches validate every precondition against committed state,
// then apply all ops. Transactions are serialized (one at a time), so a
// compare-and-swap read inside a transaction is authoritative.

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertDocumentPath(path: string): void {
  if (!isDocumentPath(path)) {
    throw new DataStoreError('invalid-path', `Not a document path: ${path}`);
  }
}

export class InMemoryDataStore implements DataStore {
  private docs = new Map<string, DocData>();
  private txQueue: Promise<unknown> = Promise.resolve();

  async getDoc(path: string): Promise<DocData | null> {
    assertDocumentPath(path);
    const doc = this.docs.get(path);
    return doc === undefined ? null : clone(doc);
  }

  async query(spec: QuerySpec): Promise<QueryResult[]> {
    return this.queryCommitted(spec);
  }

  private queryCommitted(spec: QuerySpec): QueryResult[] {
    if (!isCollectionPath(spec.collection)) {
      throw new DataStoreError('invalid-path', `Not a collection path: ${spec.collection}`);
    }
    const prefix = `${spec.collection}/`;
    const results: QueryResult[] = [];
    const paths = [...this.docs.keys()].sort();
    for (const path of paths) {
      if (!path.startsWith(prefix)) continue;
      // Direct children only — no further slash after the doc id.
      if (path.slice(prefix.length).includes('/')) continue;
      const data = this.docs.get(path)!;
      const matches = (spec.filters ?? []).every((f) => data[f.field] === f.value);
      if (!matches) continue;
      results.push({ path, data: clone(data) });
      if (spec.limit !== undefined && results.length >= spec.limit) break;
    }
    return results;
  }

  async runBatch(ops: readonly WriteOp[]): Promise<void> {
    this.validate(ops);
    this.apply(ops);
  }

  async runTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const buffered: WriteOp[] = [];
      const tx: TransactionContext = {
        get: async (path) => {
          assertDocumentPath(path);
          const doc = this.docs.get(path);
          return doc === undefined ? null : clone(doc);
        },
        query: async (spec) => this.queryCommitted(spec),
        write: (op) => {
          buffered.push(op);
        },
      };
      const result = await fn(tx);
      this.validate(buffered);
      this.apply(buffered);
      return result;
    };
    // Serialize transactions so read-guard-write is race-free.
    const next = this.txQueue.then(run, run);
    this.txQueue = next.catch(() => undefined);
    return next;
  }

  private validate(ops: readonly WriteOp[]): void {
    // Track intra-batch creations so a create followed by an update of the
    // same doc inside one batch validates coherently.
    const willExist = new Set<string>();
    const willBeDeleted = new Set<string>();
    const exists = (path: string): boolean => {
      if (willBeDeleted.has(path)) return false;
      return willExist.has(path) || this.docs.has(path);
    };

    for (const op of ops) {
      assertDocumentPath(op.path);
      if (op.kind === 'create') {
        if (exists(op.path)) {
          throw new DataStoreError('already-exists', `Document already exists: ${op.path}`);
        }
        willExist.add(op.path);
        willBeDeleted.delete(op.path);
      } else if (op.kind === 'update') {
        if (!exists(op.path)) {
          throw new DataStoreError('not-found', `Document not found: ${op.path}`);
        }
      } else if (op.kind === 'set') {
        willExist.add(op.path);
        willBeDeleted.delete(op.path);
      } else {
        willBeDeleted.add(op.path);
        willExist.delete(op.path);
      }
    }
  }

  private apply(ops: readonly WriteOp[]): void {
    for (const op of ops) {
      if (op.kind === 'create' || op.kind === 'set') {
        this.docs.set(op.path, clone(op.data));
      } else if (op.kind === 'update') {
        const current = this.docs.get(op.path) ?? {};
        this.docs.set(op.path, { ...current, ...clone(op.data) });
      } else {
        this.docs.delete(op.path);
      }
    }
  }
}
