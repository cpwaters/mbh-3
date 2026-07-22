// The DataStore contract. Business logic depends on THIS, never on a vendor
// SDK. The in-memory mock (CI default) and the real cloud provider must both
// pass the same contract suite — that equivalence is what makes mock-first
// development trustworthy.
//
// Paths are slash-separated: an even number of segments addresses a document
// ("loads/l1", "jobs/j1/events/e1"); an odd number addresses a collection
// ("loads", "jobs/j1/events"). Queries address direct children of one
// collection only.

export type DocData = Record<string, unknown>;

export type WriteOp =
  | { kind: 'create'; path: string; data: DocData } // fails if the doc exists
  | { kind: 'set'; path: string; data: DocData } // full replace, upsert
  | { kind: 'update'; path: string; data: DocData } // shallow merge, fails if missing
  | { kind: 'delete'; path: string };

export interface QueryFilter {
  field: string;
  op: '==';
  value: unknown;
}

export interface QuerySpec {
  collection: string;
  filters?: QueryFilter[];
  limit?: number;
}

export interface QueryResult {
  path: string;
  data: DocData;
}

export interface TransactionContext {
  get(path: string): Promise<DocData | null>;
  write(op: WriteOp): void;
}

export interface DataStore {
  getDoc(path: string): Promise<DocData | null>;
  query(spec: QuerySpec): Promise<QueryResult[]>;
  // All ops apply atomically or none do.
  runBatch(ops: readonly WriteOp[]): Promise<void>;
  // Read-guard-write flows (e.g. the drain claiming work with a status CAS).
  // Reads observe committed state; buffered writes apply atomically at the end.
  runTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export type DataStoreErrorCode = 'already-exists' | 'not-found' | 'invalid-path' | 'aborted';

export class DataStoreError extends Error {
  constructor(
    readonly code: DataStoreErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DataStoreError';
  }
}

export function isDocumentPath(path: string): boolean {
  const segments = path.split('/');
  return segments.length % 2 === 0 && segments.every((s) => s.length > 0);
}

export function isCollectionPath(path: string): boolean {
  const segments = path.split('/');
  return segments.length % 2 === 1 && segments.every((s) => s.length > 0);
}
