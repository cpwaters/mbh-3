import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { FirestoreDataStore } from '@mbh/provider-firestore';
import { buildRegistry, type HttpDispatchDeps } from '@mbh/actions';
import type { AuthProvider, VerifiedActor } from '@mbh/provider-interfaces';

// The server composition root: the ONE place the concrete cloud providers are
// chosen and injected. Everything above depends on interfaces. Built lazily
// and cached across warm invocations.

class FirebaseAuthProvider implements AuthProvider {
  async verifyIdToken(idToken: string): Promise<VerifiedActor | null> {
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      return { actorId: decoded.uid };
    } catch {
      return null;
    }
  }
}

let cached: HttpDispatchDeps | null = null;

export function getDeps(): HttpDispatchDeps {
  if (cached !== null) return cached;
  if (getApps().length === 0) initializeApp();
  cached = {
    store: new FirestoreDataStore(getFirestore()),
    auth: new FirebaseAuthProvider(),
    registry: buildRegistry(),
    now: () => new Date().toISOString(),
    newId: (prefix: string) => `${prefix}-${randomUUID()}`,
  };
  return cached;
}
