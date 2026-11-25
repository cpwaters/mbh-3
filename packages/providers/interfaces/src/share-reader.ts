import type { Listing } from '@mbh/domain';

// What a shared link (/l/<code>) opens, read without signing in: the load's
// listing while it is on offer, or word that it has gone (taken, withdrawn).
// null: no such link.
export type SharedLoad = { status: 'available'; listing: Listing } | { status: 'gone' };

export interface ShareReader {
  sharedLoad(code: string): Promise<SharedLoad | null>;
}
