import type { Job, Member, Tenant } from './entities.js';

// Who may switch location tracking off, and what it takes for a job to be
// tracked: the founder can switch it off for a whole company (shipper or
// carrier) or for one driver at one company, and a job is tracked only while
// none of the three that touch it — its shipper, its carrier, its driver —
// is switched off. Any one "off" wins: tracking is something people agree
// to, so the narrowest refusal decides.
export function isTrackingAllowed(parties: {
  shipper: Pick<Tenant, 'trackingDisabled'> | null;
  carrier: Pick<Tenant, 'trackingDisabled'> | null;
  driver: Pick<Member, 'trackingDisabled'> | null;
}): boolean {
  return (
    parties.shipper?.trackingDisabled !== true &&
    parties.carrier?.trackingDisabled !== true &&
    parties.driver?.trackingDisabled !== true
  );
}

// Older jobs predate the switch and carry no flag: they were tracked, so
// absent means allowed.
export function isJobTracked(job: Pick<Job, 'trackingAllowed'>): boolean {
  return job.trackingAllowed !== false;
}
