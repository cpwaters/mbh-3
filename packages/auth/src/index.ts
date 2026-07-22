import { AppError } from '@mbh/domain';
import type { AuthProvider } from '@mbh/provider-interfaces';

// The actor is resolved ONCE, here, from a verified token — never from a
// client-supplied actor id in a payload. The dispatch function calls this
// at the boundary and passes the resolved actorId into every action.
export async function authenticateActor(auth: AuthProvider, idToken: string | undefined): Promise<string> {
  if (idToken === undefined || idToken.length === 0) {
    throw new AppError('unauthenticated', 'Missing authentication token.');
  }
  const verified = await auth.verifyIdToken(idToken);
  if (verified === null) {
    throw new AppError('unauthenticated', 'Invalid or expired authentication token.');
  }
  return verified.actorId;
}
