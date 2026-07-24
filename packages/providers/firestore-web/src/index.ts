import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  getDocs,
  getFirestore,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { ACTIVE_JOB_STATUSES, type Address, type JobStatus, type LoadRoute } from '@mbh/domain';
import { jobsCollection } from '@mbh/paths';
import type { DriverJobView, JobReader } from '@mbh/provider-interfaces';

// The ONLY package that imports the Firestore web SDK. Business READS go
// directly to the store (rules-gated); this adapts that read to the JobReader
// interface. Shares the Firebase app with the auth provider (getApps()[0]).

export interface FirestoreWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface FirestoreWebOptions {
  config: FirestoreWebConfig;
  emulator?: { host: string; port: number };
}

interface JobDoc {
  jobId: string;
  carrierTenantId: string;
  status: JobStatus;
  origin: Address;
  destination: Address;
  route?: LoadRoute;
}

export class FirestoreJobReader implements JobReader {
  private readonly db: Firestore;

  constructor(options: FirestoreWebOptions) {
    const app = getApps()[0] ?? initializeApp(options.config);
    this.db = getFirestore(app);
    if (options.emulator !== undefined) {
      connectFirestoreEmulator(this.db, options.emulator.host, options.emulator.port);
    }
  }

  async activeJobForDriver(actorId: string): Promise<DriverJobView | null> {
    // Rules authorize this list via the `driverActorId == uid` match.
    const snap = await getDocs(
      query(collection(this.db, jobsCollection()), where('driverActorId', '==', actorId))
    );
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as JobDoc;
      if ((ACTIVE_JOB_STATUSES as readonly string[]).includes(data.status)) {
        return {
          jobId: data.jobId,
          carrierTenantId: data.carrierTenantId,
          status: data.status,
          origin: data.origin,
          destination: data.destination,
          ...(data.route !== undefined ? { route: data.route } : {}),
        };
      }
    }
    return null;
  }
}
