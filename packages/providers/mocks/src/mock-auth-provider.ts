import type { AuthProvider, VerifiedActor } from '@mbh/provider-interfaces';

// Scriptable auth: a plain token -> actorId map. Tests mint whatever
// identities they need without any token infrastructure.
export class MockAuthProvider implements AuthProvider {
  constructor(private readonly tokens: Record<string, string> = {}) {}

  grant(token: string, actorId: string): void {
    this.tokens[token] = actorId;
  }

  async verifyIdToken(idToken: string): Promise<VerifiedActor | null> {
    const actorId = this.tokens[idToken];
    return actorId === undefined ? null : { actorId };
  }
}
