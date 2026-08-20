import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { setInviteToken } from '../lib/inviteToken';

// What an invitation link opens. The person arriving usually has no account
// yet, and the invite cannot be read until they are signed in (its id is a
// secret, so the rules only hand it to a signed-in reader). So this does not
// try to judge the invite — it pockets the id and sends them on to make an
// account. CreateCompany checks it and explains it, once it can.
export default function InviteLanding({ signedIn }: { signedIn: boolean }) {
  const { inviteId } = useParams<{ inviteId: string }>();

  // Stored during render, NOT in an effect: this component's whole body is a
  // redirect, and <Navigate>'s effect runs before its parent's — so an effect
  // here would race the redirect and lose the id perhaps half the time.
  // A useState initialiser runs once, before the first commit. Storing the
  // same id twice is harmless.
  useState(() => {
    if (inviteId !== undefined && inviteId !== '') setInviteToken(inviteId);
  });

  if (inviteId === undefined || inviteId === '') return <Navigate to="/" replace />;
  // Signed in already: straight to onboarding, which is the dashboard when
  // you have no company yet.
  return <Navigate to={signedIn ? '/' : '/signup'} replace />;
}
