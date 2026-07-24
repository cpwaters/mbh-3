import { useState } from 'react';
import type { AuthView } from './useAuth';

// The sign-in screen: email/password + Continue with Google. Errors are the
// structured messages from the AuthClient (wrong password, cancelled popup…).
export function SignIn({ auth }: { auth: AuthView }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Sign in</h2>
      <p className="muted">Sign in to see your current delivery.</p>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@haulier.co.uk"
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {error !== null && <p style={{ color: '#dc2626' }}>{error}</p>}

      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => void run(() => auth.signInWithPassword(email, password))}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => auth.signInWithGoogle())}
        style={{ marginTop: 8 }}
      >
        Continue with Google
      </button>
    </div>
  );
}
