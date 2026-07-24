// Client-side authentication — the browser's sign-in. Distinct from the
// server-side AuthProvider (which VERIFIES tokens in the dispatch function).
// One implementation wraps the Firebase Auth web SDK; the in-memory mock is
// the CI default. The app depends only on this interface.

export interface AuthSession {
  actorId: string; // the verified uid — becomes the dispatch actor
  email: string | null;
  displayName: string | null;
}

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'cancelled' // user closed the Google popup
  | 'network'
  | 'unknown';

export class AuthClientError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AuthClientError';
  }
}

export interface AuthClient {
  signInWithPassword(email: string, password: string): Promise<AuthSession>;
  signInWithGoogle(): Promise<AuthSession>;
  signOut(): Promise<void>;
  // The current bearer token for POST /api/dispatch, or null when signed out.
  getIdToken(): Promise<string | null>;
  currentSession(): AuthSession | null;
  // Subscribe to session changes. Fires immediately with the current session,
  // then on every sign-in/out. Returns an unsubscribe function.
  subscribe(listener: (session: AuthSession | null) => void): () => void;
}
