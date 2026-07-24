import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  getDocs,
  getFirestore,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import {
  ACTIVE_JOB_STATUSES,
  type Address,
  type JobStatus,
  type Listing,
  type LoadRoute,
  type Role,
} from '@mbh/domain';
import { jobsCollection, listingsCollection, MEMBERS_SUBCOLLECTION } from '@mbh/paths';
import type {
  DriverJobView,
  JobReader,
  ListingReader,
  Membership,
  MembershipReader,
} from '@mbh/provider-interfaces';

// The ONLY package that imports the Firestore web SDK. Business READS go
// directly to the store (rules-gated); this adapts them to the reader
// interfaces the app depends on. One class + one Firestore instance so the
// emulator connection is made exactly once.

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

export class FirestoreReader implements JobReader, ListingReader, MembershipReader {
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

  async availableListings(): Promise<Listing[]> {
    const snap = await getDocs(collection(this.db, listingsCollection()));
    const listings = snap.docs.map((d) => d.data() as Listing);
    // Newest first — deterministic without needing a composite index.
    return listings.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
  }

  async membershipsFor(actorId: string): Promise<Membership[]> {
    // Collection-group read of the user's OWN member docs (rules authorize via
    // the field-aligned `actorId == uid` match).
    const snap = await getDocs(
      query(collectionGroup(this.db, MEMBERS_SUBCOLLECTION), where('actorId', '==', actorId))
    );
    return snap.docs.map((d) => {
      const data = d.data() as { tenantId: string; role: Role };
      return { tenantId: data.tenantId, role: data.role };
    });
  }
}
