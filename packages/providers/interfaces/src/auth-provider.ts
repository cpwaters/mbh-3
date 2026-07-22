// The auth provider contract. The real implementation verifies a Firebase
// ID token; the mock is a scriptable token -> actor map. Business code never
// sees a vendor token library.

export interface VerifiedActor {
  actorId: string;
}

export interface AuthProvider {
  // Returns the verified actor, or null when the token is invalid/expired.
  verifyIdToken(idToken: string): Promise<VerifiedActor | null>;
}
