import type { AuthProvider, VerifiedActor } from '@mbh/provider-interfaces';

// Scriptable auth: a plain token -> actorId map. Tests mint whatever
// identities they need without any token infrastructure. Emails are kept
// alongside rather than in the same map so existing callers that pass a
// bare token -> actorId record keep working; grant() takes one when a test
// needs an identity that founder-only actions will accept.
export class MockAuthProvider implements AuthProvider {
  constructor(
    private readonly tokens: Record<string, string> = {},
    private readonly emails: Record<string, string> = {}
  ) {}

  grant(token: string, actorId: string, email?: string): void {
    this.tokens[token] = actorId;
    if (email !== undefined) this.emails[token] = email;
  }

  async verifyIdToken(idToken: string): Promise<VerifiedActor | null> {
    const actorId = this.tokens[idToken];
    return actorId === undefined ? null : { actorId, email: this.emails[idToken] ?? null };
  }
}
