import type { UserProfile } from '@mbh/domain';
import type { ProfileReader } from '@mbh/provider-interfaces';

// Scriptable in-memory ProfileReader — the CI default.
export class MockProfileReader implements ProfileReader {
  constructor(private readonly profiles: UserProfile[] = []) {}

  async profileForActor(actorId: string): Promise<UserProfile | null> {
    return this.profiles.find((p) => p.actorId === actorId) ?? null;
  }
}
