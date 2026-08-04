import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import {
  ACTIVE_JOB_STATUSES,
  isCompletedJobStatus,
  type Address,
  type JobStatus,
  type Listing,
  type Load,
  type LoadRoute,
  metersToMiles,
  type Role,
  type TenantCapability,
  type UserProfile,
  type Vehicle,
} from '@mbh/domain';
import {
  jobsCollection,
  listingsCollection,
  loadsCollection,
  MEMBERS_SUBCOLLECTION,
  tenantDoc,
  userProfileDoc,
  vehiclesCollection,
} from '@mbh/paths';
import type {
  CompletedJobView,
  DriverJobView,
  JobReader,
  ListingReader,
  Membership,
  MembershipReader,
  ProfileReader,
  ShipperLoad,
  ShipperLoadReader,
  VehicleReader,
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
  originCompanyName?: string;
  destinationCompanyName?: string;
  priceGbpPence: number;
  route?: LoadRoute;
  deliveredAt?: string;
}

export class FirestoreReader
  implements JobReader, ListingReader, MembershipReader, VehicleReader, ProfileReader, ShipperLoadReader
{
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
          ...(data.originCompanyName !== undefined ? { originCompanyName: data.originCompanyName } : {}),
          ...(data.destinationCompanyName !== undefined
            ? { destinationCompanyName: data.destinationCompanyName }
            : {}),
          priceGbpPence: data.priceGbpPence,
          ...(data.route !== undefined ? { route: data.route } : {}),
        };
      }
    }
    return null;
  }

  async completedJobsForDriver(actorId: string): Promise<CompletedJobView[]> {
    // Same authorized list as the active read (`driverActorId == uid`); we
    // filter to finished jobs client-side to avoid a composite index.
    const snap = await getDocs(
      query(collection(this.db, jobsCollection()), where('driverActorId', '==', actorId))
    );
    return snap.docs
      .map((d) => d.data() as JobDoc)
      .filter((data) => isCompletedJobStatus(data.status))
      .map((data) => ({
        jobId: data.jobId,
        origin: data.origin,
        destination: data.destination,
        priceGbpPence: data.priceGbpPence,
        deliveredAt: data.deliveredAt ?? '',
        ...(data.route !== undefined ? { distanceMeters: data.route.distanceMeters } : {}),
      }))
      .sort((a, b) => (a.deliveredAt < b.deliveredAt ? 1 : -1));
  }

  async vehiclesForTenant(tenantId: string): Promise<Vehicle[]> {
    // Rules authorize this subcollection read via membership of the tenant.
    const snap = await getDocs(collection(this.db, vehiclesCollection(tenantId)));
    return snap.docs
      .map((d) => d.data() as Vehicle)
      .filter((v) => v.status === 'active')
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async profileForActor(actorId: string): Promise<UserProfile | null> {
    // Rules authorize this via the doc id matching the caller's uid.
    const snap = await getDoc(doc(this.db, userProfileDoc(actorId)));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  }

  async availableListings(): Promise<Listing[]> {
    const snap = await getDocs(collection(this.db, listingsCollection()));
    const listings = snap.docs.map((d) => d.data() as Listing);
    // Newest first — deterministic without needing a composite index.
    return listings.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
  }

  async loadsForShipper(shipperTenantId: string): Promise<ShipperLoad[]> {
    // Rules authorize this list via the `tenantId == the member's tenant` match.
    const snap = await getDocs(
      query(collection(this.db, loadsCollection()), where('tenantId', '==', shipperTenantId))
    );
    return snap.docs
      .map((d) => d.data() as Load)
      .map((load) => ({
        loadId: load.loadId,
        origin: `${load.origin.town}, ${load.origin.postcode}`,
        destination: `${load.destination.town}, ${load.destination.postcode}`,
        // The drain's driving route, not the shipper's create-load estimate
        // (postingDetails.distanceMiles) — null until it's enriched.
        distanceMiles: load.route !== undefined ? Math.round(metersToMiles(load.route.distanceMeters)) : null,
        weightKg: load.consignment.weightKg,
        palletCount: load.consignment.palletCount,
        priceGbpPence: load.priceGbpPence,
        pickupBy: load.pickupBy,
        pickupTime: load.postingDetails?.pickupTime ?? '',
        deliverBy: load.deliverBy,
        deliveryTime: load.postingDetails?.deliveryTime ?? '',
        status: load.status,
      }))
      .sort((a, b) => (a.loadId < b.loadId ? 1 : -1));
  }

  async membershipsFor(actorId: string): Promise<Membership[]> {
    // Collection-group read of the user's OWN member docs (rules authorize via
    // the field-aligned `actorId == uid` match).
    const snap = await getDocs(
      query(collectionGroup(this.db, MEMBERS_SUBCOLLECTION), where('actorId', '==', actorId))
    );
    // Read each tenant for its capabilities (readable by active members).
    return Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() as { tenantId: string; role: Role };
        const tenant = await getDoc(doc(this.db, tenantDoc(data.tenantId)));
        const capabilities = (tenant.data()?.capabilities ?? []) as TenantCapability[];
        const name = (tenant.data()?.name ?? data.tenantId) as string;
        return { tenantId: data.tenantId, name, role: data.role, capabilities };
      })
    );
  }
}
