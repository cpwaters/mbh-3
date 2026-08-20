// The auth provider contract. The real implementation verifies a Firebase
// ID token; the mock is a scriptable token -> actor map. Business code never
// sees a vendor token library.

export interface VerifiedActor {
  actorId: string;
  // The address on the VERIFIED token, not anything the client sent. Null
  // when the identity provider gave none. This is what founder-only actions
  // are authorized against.
  email: string | null;
}

export interface AuthProvider {
  // Returns the verified actor, or null when the token is invalid/expired.
  verifyIdToken(idToken: string): Promise<VerifiedActor | null>;
}
