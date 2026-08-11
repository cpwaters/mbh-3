// The founder toolbar's read of its own send-test-invoice-email task — the
// ONLY outbox task type ever exposed to a client at all (rules-gated to the
// requesting actor's own task; see firebase/firestore.rules). Without this,
// the debug button's "Queued" message is permanent regardless of whether the
// drain's later SMTP attempt actually succeeded.

export type TestEmailTaskStatus = 'pending' | 'claimed' | 'done' | 'failed';

export interface TestEmailTaskView {
  status: TestEmailTaskStatus;
  lastError?: string;
}

export interface OutboxTaskReader {
  testEmailTaskStatus(taskId: string): Promise<TestEmailTaskView | null>;
}
