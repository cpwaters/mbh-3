import { useMemo } from 'react';
import { adrCertificateStatus, type AdrCertificate, type AdrStatus } from '@mbh/domain';
import { useProfile } from './useProfile';

export interface AdrState {
  // null while the profile is still loading: don't block anything on a guess.
  status: AdrStatus | null;
  certificate: AdrCertificate | null;
}

// The signed-in driver's ADR certificate, as the accept buttons need it. The
// server makes the real decision when a load is accepted; this lets the
// screen say so up front instead of after a tap.
export function useAdrStatus(actorId: string | null): AdrState {
  const { loading, profile } = useProfile(actorId);
  const certificate = profile?.adrCertificate ?? null;
  return useMemo(
    () => ({
      status: loading ? null : adrCertificateStatus(certificate, new Date().toISOString()),
      certificate,
    }),
    [loading, certificate]
  );
}
