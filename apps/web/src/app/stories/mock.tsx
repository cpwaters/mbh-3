import React from 'react';
import type { AuthView } from '../../components/useAuth';
import { AppProvider, type AppData } from '../context';

// Minimal no-op fakes so context-driven components render in Storybook.

export const mockAuth: AuthView = {
  ready: true,
  session: { actorId: 'sb-driver', email: 'driver@example.com', displayName: 'Chris Waters' },
  signInWithPassword: async () => {},
  signUpWithPassword: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  getIdToken: async () => 'sb-token',
};

const carrierTenant = { tenantId: 'carrier-sb', name: 'Waters Haulage', role: 'driver' as const, capabilities: ['carrier'] as const };

export function makeMockApp(over: Partial<AppData> = {}): AppData {
  return {
    auth: mockAuth,
    queue: {
      items: [],
      pending: 0,
      online: true,
      enqueue: async () => {},
      drainNow: async () => ({ delivered: 0, retrying: 0, failedPermanent: 0 }),
      retry: async () => {},
      remove: async () => {},
    },
    tenants: [{ ...carrierTenant, capabilities: ['carrier'] }],
    selected: { ...carrierTenant, capabilities: ['carrier'] },
    selectTenant: () => {},
    reloadTenants: () => {},
    isShipper: false,
    isCarrier: true,
    job: null,
    reloadJob: () => {},
    listings: [],
    reloadListings: () => {},
    commit: async () => {},
    onAccepted: () => {},
    location: null,
    tracking: false,
    watchingLocation: false,
    locationError: null,
    requestLocation: () => {},
    progress: null,
    distanceRemainingMeters: null,
    drivingTimers: {
      timers: [],
      dailyRestHours: 9,
      toggleTimer: () => {},
      resetTimer: () => {},
      updateDailyRestHours: () => {},
    },
    ...over,
  };
}

// A decorator that provides a mock app context to a story.
export function withApp(over: Partial<AppData> = {}) {
  return function AppDecorator(Story: React.ComponentType) {
    return (
      <AppProvider value={makeMockApp(over)}>
        <Story />
      </AppProvider>
    );
  };
}
