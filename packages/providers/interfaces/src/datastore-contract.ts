import { describe, expect, it } from 'vitest';
import { DataStoreError, type DataStore } from './datastore.js';

// The DataStore contract suite. Run it against every implementation — the
// in-memory mock in unit tests, the real provider on the emulator in
// pnpm test:contract. If both pass, mock-first CI results are trustworthy.

export function describeDataStoreContract(
  label: string,
  makeStore: () => DataStore | Promise<DataStore>
): void {
  describe(`DataStore contract: ${label}`, () => {
    it('returns null for a missing document', async () => {
      const store = await makeStore();
      expect(await store.getDoc('tenants/none')).toBeNull();
    });

    it('round-trips create -> getDoc', async () => {
      const store = await makeStore();
      await store.runBatch([{ kind: 'create', path: 'tenants/t1', data: { name: 'Acme' } }]);
      expect(await store.getDoc('tenants/t1')).toEqual({ name: 'Acme' });
    });

    it('returns copies from reads — mutating a result does not corrupt the store', async () => {
      const store = await makeStore();
      await store.runBatch([{ kind: 'create', path: 'tenants/t1', data: { name: 'Acme' } }]);
      const read = await store.getDoc('tenants/t1');
      (read as Record<string, unknown>).name = 'Mutated';
      expect(await store.getDoc('tenants/t1')).toEqual({ name: 'Acme' });
    });

    it('refuses create on an existing document', async () => {
      const store = await makeStore();
      await store.runBatch([{ kind: 'create', path: 'tenants/t1', data: { name: 'Acme' } }]);
      await expect(
        store.runBatch([{ kind: 'create', path: 'tenants/t1', data: { name: 'Other' } }])
      ).rejects.toMatchObject({ code: 'already-exists' });
    });

    it('set replaces the whole document; update shallow-merges', async () => {
      const store = await makeStore();
      await store.runBatch([
        { kind: 'create', path: 'loads/l1', data: { status: 'available', priceGbpPence: 100 } },
      ]);
      await store.runBatch([{ kind: 'update', path: 'loads/l1', data: { status: 'matched' } }]);
      expect(await store.getDoc('loads/l1')).toEqual({ status: 'matched', priceGbpPence: 100 });

      await store.runBatch([{ kind: 'set', path: 'loads/l1', data: { status: 'cancelled' } }]);
      expect(await store.getDoc('loads/l1')).toEqual({ status: 'cancelled' });
    });

    it('refuses update on a missing document', async () => {
      const store = await makeStore();
      await expect(
        store.runBatch([{ kind: 'update', path: 'loads/none', data: { status: 'matched' } }])
      ).rejects.toMatchObject({ code: 'not-found' });
    });

    it('deletes a document', async () => {
      const store = await makeStore();
      await store.runBatch([{ kind: 'create', path: 'loads/l1', data: { status: 'available' } }]);
      await store.runBatch([{ kind: 'delete', path: 'loads/l1' }]);
      expect(await store.getDoc('loads/l1')).toBeNull();
    });

    it('applies batches atomically — one failing op means nothing applies', async () => {
      const store = await makeStore();
      await store.runBatch([{ kind: 'create', path: 'tenants/t1', data: { name: 'Acme' } }]);
      await expect(
        store.runBatch([
          { kind: 'create', path: 'loads/l1', data: { status: 'available' } },
          { kind: 'create', path: 'tenants/t1', data: { name: 'Duplicate' } }, // fails
        ])
      ).rejects.toBeInstanceOf(DataStoreError);
      // The first op must NOT have applied.
      expect(await store.getDoc('loads/l1')).toBeNull();
      expect(await store.getDoc('tenants/t1')).toEqual({ name: 'Acme' });
    });

    it('queries direct children of a collection with equality filters and limit', async () => {
      const store = await makeStore();
      await store.runBatch([
        { kind: 'create', path: 'loads/l1', data: { status: 'available', tenantId: 't1' } },
        { kind: 'create', path: 'loads/l2', data: { status: 'matched', tenantId: 't1' } },
        { kind: 'create', path: 'loads/l3', data: { status: 'available', tenantId: 't2' } },
        // A doc in a subcollection must NOT appear in a query on 'loads'.
        { kind: 'create', path: 'loads/l1/notes/n1', data: { status: 'available' } },
      ]);

      const available = await store.query({
        collection: 'loads',
        filters: [{ field: 'status', op: '==', value: 'available' }],
      });
      expect(available.map((r) => r.path).sort()).toEqual(['loads/l1', 'loads/l3']);

      const t1Available = await store.query({
        collection: 'loads',
        filters: [
          { field: 'status', op: '==', value: 'available' },
          { field: 'tenantId', op: '==', value: 't1' },
        ],
      });
      expect(t1Available.map((r) => r.path)).toEqual(['loads/l1']);

      const limited = await store.query({ collection: 'loads', limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it('supports a compare-and-swap claim in a transaction (the drain pattern)', async () => {
      const store = await makeStore();
      await store.runBatch([{ kind: 'create', path: 'outbound/w1', data: { status: 'queued' } }]);

      const claim = () =>
        store.runTransaction(async (tx) => {
          const doc = await tx.get('outbound/w1');
          if (doc === null || doc.status !== 'queued') return false;
          tx.write({ kind: 'update', path: 'outbound/w1', data: { status: 'submitting' } });
          return true;
        });

      expect(await claim()).toBe(true);
      expect(await store.getDoc('outbound/w1')).toEqual({ status: 'submitting' });
      // A second claimant must observe the CAS and refuse.
      expect(await claim()).toBe(false);
    });

    it('supports queries inside a transaction observing committed state', async () => {
      const store = await makeStore();
      await store.runBatch([
        { kind: 'create', path: 'jobs/j1', data: { driverActorId: 'd1', status: 'accepted' } },
        { kind: 'create', path: 'jobs/j2', data: { driverActorId: 'd2', status: 'closed' } },
      ]);
      const activeForD1 = await store.runTransaction(async (tx) => {
        const rows = await tx.query({
          collection: 'jobs',
          filters: [{ field: 'driverActorId', op: '==', value: 'd1' }],
        });
        return rows.map((r) => r.path);
      });
      expect(activeForD1).toEqual(['jobs/j1']);
    });

    it('discards transaction writes when the function throws', async () => {
      const store = await makeStore();
      await store.runBatch([{ kind: 'create', path: 'outbound/w1', data: { status: 'queued' } }]);
      await expect(
        store.runTransaction(async (tx) => {
          tx.write({ kind: 'update', path: 'outbound/w1', data: { status: 'submitting' } });
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
      expect(await store.getDoc('outbound/w1')).toEqual({ status: 'queued' });
    });

    it('rejects document ops on collection paths and vice versa', async () => {
      const store = await makeStore();
      await expect(
        store.runBatch([{ kind: 'create', path: 'loads', data: {} }])
      ).rejects.toMatchObject({ code: 'invalid-path' });
      await expect(store.getDoc('loads')).rejects.toMatchObject({ code: 'invalid-path' });
      await expect(store.query({ collection: 'loads/l1' })).rejects.toMatchObject({
        code: 'invalid-path',
      });
    });
  });
}
