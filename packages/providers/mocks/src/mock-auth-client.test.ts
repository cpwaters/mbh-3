import { describe, expect, it, vi } from 'vitest';
import { AuthClientError } from '@mbh/provider-interfaces';
import { MockAuthClient } from './mock-auth-client.js';

const creds = [{ actorId: 'driver-1', email: 'chris@waters.co', password: 'pw', displayName: 'Chris' }];

describe('MockAuthClient', () => {
  it('signs in with correct password and issues an actor-bound token', async () => {
    const auth = new MockAuthClient({ credentials: creds });
    const session = await auth.signInWithPassword('chris@waters.co', 'pw');
    expect(session).toEqual({ actorId: 'driver-1', email: 'chris@waters.co', displayName: 'Chris' });
    expect(await auth.getIdToken()).toBe('mock-token:driver-1');
    expect(auth.currentSession()?.actorId).toBe('driver-1');
  });

  it('rejects wrong credentials with a structured error', async () => {
    const auth = new MockAuthClient({ credentials: creds });
    await expect(auth.signInWithPassword('chris@waters.co', 'nope')).rejects.toMatchObject({
      code: 'invalid-credentials',
    });
    expect(await auth.getIdToken()).toBeNull();
  });

  it('signs in with Google when an account is scripted, else reports cancelled', async () => {
    const withGoogle = new MockAuthClient({ googleAccount: { actorId: 'g-1', email: 'g@x.com' } });
    expect((await withGoogle.signInWithGoogle()).actorId).toBe('g-1');

    const noGoogle = new MockAuthClient();
    await expect(noGoogle.signInWithGoogle()).rejects.toBeInstanceOf(AuthClientError);
  });

  it('notifies subscribers immediately and on every change', async () => {
    const auth = new MockAuthClient({ credentials: creds });
    const seen = vi.fn();
    const unsub = auth.subscribe(seen);
    expect(seen).toHaveBeenNthCalledWith(1, null); // immediate current state

    await auth.signInWithPassword('chris@waters.co', 'pw');
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: 'driver-1' }));

    await auth.signOut();
    expect(seen).toHaveBeenLastCalledWith(null);
    expect(await auth.getIdToken()).toBeNull();

    unsub();
    await auth.signInWithPassword('chris@waters.co', 'pw');
    expect(seen).toHaveBeenCalledTimes(3); // no further calls after unsubscribe
  });
});
