import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { FirestoreDataStore } from '@mbh/provider-firestore';
import { PostcodesIoGeocoder } from '@mbh/provider-postcodes-io';
import { OsrmRouteProvider } from '@mbh/provider-osrm';
import { buildRegistry, type DrainDeps, type HttpDispatchDeps } from '@mbh/actions';
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

function ensureApp(): void {
  if (getApps().length === 0) initializeApp();
}

const isoNow = (): string => new Date().toISOString();
const prefixedId = (prefix: string): string => `${prefix}-${randomUUID()}`;

let cached: HttpDispatchDeps | null = null;

export function getDeps(): HttpDispatchDeps {
  if (cached !== null) return cached;
  ensureApp();
  cached = {
    store: new FirestoreDataStore(getFirestore()),
    auth: new FirebaseAuthProvider(),
    registry: buildRegistry(),
    now: isoNow,
    newId: prefixedId,
  };
  return cached;
}

let cachedDrain: DrainDeps | null = null;

// The OSRM routing endpoint. Defaults to the public demo server (rate-limited,
// fine at pre-launch volume); set the OSRM_BASE_URL env var (functions/.env,
// applied at deploy) to a self-hosted OSRM before real volume — see
// infrastructure/osrm/ + docs/runbooks/osrm.md. No code change needed to swap.
// A plain env read (not a defineString param) so the emulator never prompts.
const osrmBaseUrl = process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org';

// The drain's providers: the real HTTP adapters. postcodes.io is keyless.
export function getDrainDeps(): DrainDeps {
  if (cachedDrain !== null) return cachedDrain;
  ensureApp();
  cachedDrain = {
    store: new FirestoreDataStore(getFirestore()),
    geocoder: new PostcodesIoGeocoder(),
    routeProvider: new OsrmRouteProvider({ baseUrl: osrmBaseUrl }),
    now: isoNow,
    newId: prefixedId,
  };
  return cachedDrain;
}
