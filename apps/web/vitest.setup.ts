import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// RTL's automatic afterEach cleanup only self-registers when it detects a
// global `afterEach` — this config doesn't turn on vitest's globals (matches
// the repo's explicit-import convention elsewhere), so register it by hand.
afterEach(cleanup);
