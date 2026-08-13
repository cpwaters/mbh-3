import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AddressBookEntry } from '@mbh/domain';
import { getReader } from '../lib/reader';

export interface AddressBookState {
  loading: boolean;
  entries: AddressBookEntry[];
  reload: () => void;
}

// Reads a shipper tenant's saved addresses from Firestore (active only,
// alphabetical). Re-reads when the tenant changes or `reload` is called (just
// after saving/editing/archiving). A null tenant resolves to an empty book.
export function useAddressBook(tenantId: string | null): AddressBookState {
  const reader = useMemo(getReader, []);
  const [state, setState] = useState<{ loading: boolean; entries: AddressBookEntry[] }>({
    loading: tenantId !== null,
    entries: [],
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (tenantId === null) {
      setState({ loading: false, entries: [] });
      return;
    }
    let cancelled = false;
    setState({ loading: true, entries: [] });
    reader
      .addressBookForTenant(tenantId)
      .then((entries) => {
        if (!cancelled) setState({ loading: false, entries });
      })
      .catch(() => {
        // A read failure here must never block posting a load — the picker
        // simply has nothing to offer and the shipper types the address.
        if (!cancelled) setState({ loading: false, entries: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [reader, tenantId, nonce]);

  return { ...state, reload };
}
