import {
  type AuthClient,
  AuthClientError,
  type AuthSession,
} from '@mbh/provider-interfaces';

export interface MockCredential {
  actorId: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface MockGoogleAccount {
  actorId: string;
  email: string;
  displayName?: string;
}

// Scriptable in-memory AuthClient — the CI default. Seed it with the
// password credentials a test cares about and (optionally) the Google account
// a popup would return. Issues deterministic tokens of the form
// `mock-token:<actorId>` so a paired MockAuthProvider can resolve the actor.
export class MockAuthClient implements AuthClient {
  private readonly credentials: MockCredential[];
  private readonly googleAccount: MockGoogleAccount | null;
  private session: AuthSession | null = null;
  private readonly listeners = new Set<(s: AuthSession | null) => void>();

  constructor(options: { credentials?: MockCredential[]; googleAccount?: MockGoogleAccount } = {}) {
    this.credentials = options.credentials ?? [];
    this.googleAccount = options.googleAccount ?? null;
  }

  async signInWithPassword(email: string, password: string): Promise<AuthSession> {
    const match = this.credentials.find(
      (c) => c.email.toLowerCase() === email.toLowerCase() && c.password === password
    );
    if (match === undefined) {
      throw new AuthClientError('invalid-credentials', 'Wrong email or password.');
    }
    return this.setSession({
      actorId: match.actorId,
      email: match.email,
      displayName: match.displayName ?? null,
    });
  }

  async signInWithGoogle(): Promise<AuthSession> {
    if (this.googleAccount === null) {
      throw new AuthClientError('cancelled', 'Google sign-in was cancelled.');
    }
    return this.setSession({
      actorId: this.googleAccount.actorId,
      email: this.googleAccount.email,
      displayName: this.googleAccount.displayName ?? null,
    });
  }

  async signOut(): Promise<void> {
    this.session = null;
    this.notify();
  }

  async getIdToken(): Promise<string | null> {
    return this.session === null ? null : `mock-token:${this.session.actorId}`;
  }

  currentSession(): AuthSession | null {
    return this.session;
  }

  subscribe(listener: (s: AuthSession | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.session); // fire immediately with current state
    return () => this.listeners.delete(listener);
  }

  private setSession(session: AuthSession): AuthSession {
    this.session = session;
    this.notify();
    return session;
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.session);
  }
}
