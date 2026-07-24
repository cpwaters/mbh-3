// External-service wire schemas + the ONE mapper each. Adapters
// (providers/<vendor>) do the HTTP; this package owns the shape validation
// and the mapping to domain types, so the boundary is in exactly one place.
export * from './postcodes-io.js';
export * from './osrm.js';
