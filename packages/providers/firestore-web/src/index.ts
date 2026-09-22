import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
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
  type ProfileContact,
  type Role,
  type TenantCapability,
  type UserProfile,
  type Vehicle,
  type AddressBookEntry,
  type Invite,
} from '@mbh/domain';
import {
  jobEventsCollection,
  jobsCollection,
  listingsCollection,
  loadsCollection,
  MEMBERS_SUBCOLLECTION,
  outboxTaskDoc,
  tenantDoc,
  userProfileDoc,
  vehiclesCollection,
  addressBookCollection,
  inviteDoc,
  invitesCollection,
} from '@mbh/paths';
import type {
  AddressBookReader,
  InviteReader,
  CompletedJobView,
  DriverJobView,
  JobReader,
  JobTrail,
  JobTrailReader,
  ListingReader,
  Membership,
  MembershipReader,
  OutboxTaskReader,
  ProfileReader,
  ShipperLoad,
  TrailPoint,
  ShipperLoadReader,
  TestEmailTaskView,
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

// A load with no postingDetails carries no contact info at all — this is the
// fallback for loadsForShipper's ShipperLoad projection.
const emptyContact: ProfileContact = { name: '', email: '', phone: '' };

interface JobDoc {
  jobId: string;
  // The load this job was created from — how a shipper gets from the listing
  // they posted to the job it became.
  loadId: string;
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

// A long job's trail is bounded so one read cannot balloon: 500 points is
// ~500 miles at today's one-mile breadcrumbs, and the newest are kept.
const MAX_TRAIL_EVENTS = 500;

export class FirestoreReader
  implements
    JobReader,
    JobTrailReader,
    ListingReader,
    MembershipReader,
    VehicleReader,
    ProfileReader,
    ShipperLoadReader,
    OutboxTaskReader,
    AddressBookReader,
    InviteReader
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

  // A load's trail, for the shipper who posted it. Two reads: find the job
  // this load became, then read that job's breadcrumb events.
  //
  // Rules authorize both — `jobs` by the shipperTenantId match, and
  // `jobs/{id}/events` by membership of either side — so nothing here needs
  // new rules. The events read is ordered ONLY (no type filter) and narrowed
  // client-side, the same index-avoiding idiom completedJobsForDriver uses: a
  // where+orderBy pair would need a composite index, and a missing index is
  // the one failure mode the emulator cannot catch (docs/HANDOFF.md).
  async trailForLoad(loadId: string, shipperTenantId: string): Promise<JobTrail | null> {
    // Constrained by shipperTenantId, NOT by loadId. The rules refuse the
    // latter: a list has to prove ownership from the query itself, and
    // `where('loadId','==',...)` proves nothing about who owns the job. Same
    // shape as activeJobForDriver — authorized list, narrowed client-side.
    const jobs = await getDocs(
      query(collection(this.db, jobsCollection()), where('shipperTenantId', '==', shipperTenantId))
    );
    const jobDoc = jobs.docs.find((d) => (d.data() as JobDoc).loadId === loadId);
    if (jobDoc === undefined) return null; // not accepted yet — no job exists
    const job = jobDoc.data() as JobDoc;

    // Newest first with a ceiling, so a long job returns its RECENT trail
    // rather than being truncated at the yard; reversed below to draw.
    const events = await getDocs(
      query(collection(this.db, jobEventsCollection(job.jobId)), orderBy('at', 'desc'), limit(MAX_TRAIL_EVENTS))
    );

    const points: TrailPoint[] = [];
    // Newest first, so the FIRST motion event seen is the current state.
    let stoppedSince: string | null = null;
    let motionSeen = false;
    let pausedSince: string | null = null;
    let pauseSeen = false;
    for (const e of events.docs) {
      const data = e.data() as {
        type?: string;
        at?: string;
        detail?: { lat?: number; lng?: number; since?: string };
      };
      if (data.type === 'job.trackingPaused' || data.type === 'job.trackingResumed') {
        if (!pauseSeen) {
          pauseSeen = true;
          pausedSince = data.type === 'job.trackingPaused' ? (data.at ?? null) : null;
        }
        continue;
      }
      if (data.type === 'job.stopped' || data.type === 'job.resumed') {
        if (!motionSeen) {
          motionSeen = true;
          stoppedSince =
            data.type === 'job.stopped' ? (data.detail?.since ?? data.at ?? null) : null;
        }
        continue;
      }
      if (data.type !== 'job.routePoint') continue;
      const { lat, lng } = data.detail ?? {};
      if (typeof lat !== 'number' || typeof lng !== 'number' || typeof data.at !== 'string') continue;
      points.push({ lat, lng, at: data.at });
    }
    points.reverse(); // oldest first, so it draws as a path

    return {
      jobId: job.jobId,
      status: job.status,
      points,
      pausedSince,
      // A paused tracker reports no movement, so any stop it was in is not
      // something we can still vouch for.
      stoppedSince: pausedSince !== null ? null : stoppedSince,
      lastSeenAt: points.length > 0 ? (points[points.length - 1]?.at ?? null) : null,
    };
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

  async addressBookForTenant(shipperTenantId: string): Promise<AddressBookEntry[]> {
    // Rules authorize this subcollection read via membership of the tenant.
    const snap = await getDocs(collection(this.db, addressBookCollection(shipperTenantId)));
    return snap.docs
      .map((d) => d.data() as AddressBookEntry)
      .filter((e) => e.status === 'active')
      // Alphabetical: this is a pick-list a shipper scans by name, not a feed.
      .sort((a, b) => a.label.localeCompare(b.label));
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
    const [snap, stuckJobsSnap] = await Promise.all([
      getDocs(query(collection(this.db, loadsCollection()), where('tenantId', '==', shipperTenantId))),
      // Jobs stuck at 'delivered' with no closeJob task to move them on —
      // authorized by the same `shipperTenantId` field match as the driver-
      // home query (see firestore.rules's comment on /jobs/{jobId}).
      getDocs(
        query(
          collection(this.db, jobsCollection()),
          where('shipperTenantId', '==', shipperTenantId),
          where('status', '==', 'delivered')
        )
      ),
    ]);
    const stuckLoadIds = new Set(stuckJobsSnap.docs.map((d) => (d.data() as { loadId: string }).loadId));
    return snap.docs
      .map((d) => d.data() as Load)
      .map((load) => ({
        loadId: load.loadId,
        origin: `${load.origin.town}, ${load.origin.postcode}`,
        destination: `${load.destination.town}, ${load.destination.postcode}`,
        originAddress: load.origin,
        destinationAddress: load.destination,
        sourceCompanyName: load.postingDetails?.sourceCompanyName ?? '',
        destinationCompanyName: load.postingDetails?.destinationCompanyName ?? '',
        sourceContact: load.postingDetails?.sourceContact ?? emptyContact,
        destinationContact: load.postingDetails?.destinationContact ?? emptyContact,
        needsClosureBackfill: stuckLoadIds.has(load.loadId),
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
        const logoRef = (tenant.data()?.logoRef ?? '') as string;
        const logoContentType = (tenant.data()?.logoContentType ?? '') as string;
        return {
          tenantId: data.tenantId,
          name,
          role: data.role,
          capabilities,
          ...(logoRef !== '' ? { logoRef, logoContentType } : {}),
        };
      })
    );
  }

  // The caller already knows the id — it was in the link they were sent, and
  // knowing it is what authorizes the read (see the `get` rule on /invites).
  async inviteById(inviteId: string): Promise<Invite | null> {
    const snap = await getDoc(doc(this.db, inviteDoc(inviteId)));
    return snap.exists() ? (snap.data() as Invite) : null;
  }

  // Founder-only, enforced by the `list` rule: for anyone else this rejects
  // rather than returning an empty list, so a harvest cannot be mistaken for
  // "no invites".
  async invitesForFounder(): Promise<Invite[]> {
    const snap = await getDocs(collection(this.db, invitesCollection()));
    return snap.docs
      .map((d) => d.data() as Invite)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
  }

  async testEmailTaskStatus(taskId: string): Promise<TestEmailTaskView | null> {
    // Rules authorize this read only for the task's own requester
    // (resource.data.actorId == uid) and only for type 'sendTestInvoiceEmail'
    // — every other outbox task type stays server-internal.
    const snap = await getDoc(doc(this.db, outboxTaskDoc(taskId)));
    if (!snap.exists()) return null;
    const data = snap.data() as { status: TestEmailTaskView['status']; lastError?: string };
    return { status: data.status, ...(data.lastError !== undefined ? { lastError: data.lastError } : {}) };
  }
}
