import { seedDeliverableJob } from './admin.js';

// Runs once before the suite (inside `firebase emulators:exec`, so the
// emulator env vars are set): seed the auth user + the in-transit job.
export default async function globalSetup(): Promise<void> {
  await seedDeliverableJob();
}
