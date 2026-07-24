import { initializeApp, getApps } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  type AuthClient,
  AuthClientError,
  type AuthSession,
} from '@mbh/provider-interfaces';

// The ONLY package that imports the Firebase Auth web SDK. It adapts that SDK
// to the AuthClient interface the app depends on. Everything above is
// vendor-agnostic and tested against the in-memory MockAuthClient; this thin
// wrapper is exercised end to end by the emulator E2E.

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export interface FirebaseAuthOptions {
  config: FirebaseWebConfig;
  // e.g. 'http://localhost:9099' to point at the Auth emulator (E2E / local).
  emulatorUrl?: string;
}

function toSession(user: User): AuthSession {
  return { actorId: user.uid, email: user.email, displayName: user.displayName };
}

function mapError(error: unknown): AuthClientError {
  const code = (error as { code?: string }).code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new AuthClientError('invalid-credentials', 'Wrong email or password.');
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new AuthClientError('cancelled', 'Sign-in was cancelled.');
    case 'auth/network-request-failed':
      return new AuthClientError('network', 'Network problem — please try again.');
    default:
      return new AuthClientError('unknown', (error as Error)?.message ?? 'Sign-in failed.');
  }
}

export class FirebaseAuthClient implements AuthClient {
  private readonly auth: Auth;

  constructor(options: FirebaseAuthOptions) {
    const app = getApps()[0] ?? initializeApp(options.config);
    this.auth = getAuth(app);
    if (options.emulatorUrl !== undefined) {
      connectAuthEmulator(this.auth, options.emulatorUrl, { disableWarnings: true });
    }
  }

  async signInWithPassword(email: string, password: string): Promise<AuthSession> {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email, password);
      return toSession(cred.user);
    } catch (error) {
      throw mapError(error);
    }
  }

  async signInWithGoogle(): Promise<AuthSession> {
    try {
      const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
      return toSession(cred.user);
    } catch (error) {
      throw mapError(error);
    }
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  async getIdToken(): Promise<string | null> {
    const user = this.auth.currentUser;
    return user === null ? null : user.getIdToken();
  }

  currentSession(): AuthSession | null {
    const user = this.auth.currentUser;
    return user === null ? null : toSession(user);
  }

  subscribe(listener: (session: AuthSession | null) => void): () => void {
    return onIdTokenChanged(this.auth, (user) => listener(user === null ? null : toSession(user)));
  }
}
