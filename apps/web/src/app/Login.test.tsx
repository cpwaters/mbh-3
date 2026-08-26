import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { mockAuth } from './stories/mock';

function renderLogin(over: Partial<typeof mockAuth> = {}) {
  const auth = { ...mockAuth, session: null, ...over };
  render(
    <MemoryRouter>
      <Login auth={auth} />
    </MemoryRouter>
  );
  return auth;
}

describe('Login — forgotten password', () => {
  it('emails a reset link for the address already typed in', async () => {
    const sendPasswordReset = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin({ sendPasswordReset });

    await user.type(screen.getByLabelText(/email/i), 'driver@example.com');
    await user.click(screen.getByRole('button', { name: /forgot password/i }));

    await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith('driver@example.com'));
    expect(screen.getByText(/reset link is on its way/i)).toBeInTheDocument();
  });

  it('says the same thing whether or not the address is registered', async () => {
    // The wording must not become a way to discover who has an account, so
    // the screen cannot distinguish the two cases — the client resolves for
    // an unknown address exactly as it does for a known one.
    const sendPasswordReset = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin({ sendPasswordReset });

    await user.type(screen.getByLabelText(/email/i), 'nobody@nowhere.test');
    await user.click(screen.getByRole('button', { name: /forgot password/i }));

    await waitFor(() =>
      expect(screen.getByText(/If nobody@nowhere\.test has an account, a reset link is on its way\./i)).toBeInTheDocument()
    );
  });

  it('asks for the address first rather than sending nothing', async () => {
    const sendPasswordReset = vi.fn();
    const user = userEvent.setup();
    renderLogin({ sendPasswordReset });

    await user.click(screen.getByRole('button', { name: /forgot password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your email address/i);
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('reports a failure to send instead of claiming it worked', async () => {
    const sendPasswordReset = vi.fn().mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderLogin({ sendPasswordReset });

    await user.type(screen.getByLabelText(/email/i), 'driver@example.com');
    await user.click(screen.getByRole('button', { name: /forgot password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send a reset email/i);
    expect(screen.queryByText(/on its way/i)).not.toBeInTheDocument();
  });
});

describe('Login — the ways out', () => {
  it('offers sign-up and a way back to the marketing site', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to mybackhaul/i })).toHaveAttribute('href', '/');
  });
});
