import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mail, X } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { useApp } from '../context';
import { dispatchAction } from '../../lib/dispatch';
import { getReader } from '../../lib/reader';

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' } // dispatching the enqueue request
  | { kind: 'waiting' } // enqueued; polling the drain's outcome
  | { kind: 'sent' }
  | { kind: 'failed'; lastError?: string }
  | { kind: 'timeout' }
  | { kind: 'error'; message: string };

// The drain runs every ~1 minute and retries a recoverable SMTP failure up to
// 5 times before giving up — poll a bit past that worst case rather than
// leaving the founder staring at "Queued" forever with no real answer.
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 6 * 60 * 1000;

// Proving the invoice pipeline — SMTP config, HTML and PDF rendering, the
// letterhead — without waiting for a real delivery. Moved here verbatim from
// the founder bar; the polling is the point, since a send that merely
// enqueues tells you nothing about whether it arrived.
export function AdminTools() {
  const app = useApp();
  const [state, setState] = useState<SendState>({ kind: 'idle' });
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function pollTask(taskId: string, deadline: number): Promise<void> {
    if (cancelledRef.current) return;
    const task = await getReader().testEmailTaskStatus(taskId);
    if (cancelledRef.current) return;
    if (task?.status === 'done') {
      setState({ kind: 'sent' });
      return;
    }
    if (task?.status === 'failed') {
      setState({ kind: 'failed', ...(task.lastError !== undefined ? { lastError: task.lastError } : {}) });
      return;
    }
    if (Date.now() >= deadline) {
      setState({ kind: 'timeout' });
      return;
    }
    setTimeout(() => void pollTask(taskId, deadline), POLL_INTERVAL_MS);
  }

  async function sendTestEmail(): Promise<void> {
    const tenantId = app.selected?.tenantId;
    if (tenantId === undefined) {
      setState({ kind: 'error', message: 'Select a company first.' });
      return;
    }
    setState({ kind: 'sending' });
    const res = await dispatchAction(app.auth.getIdToken, 'sendTestInvoiceEmail', { tenantId }, genRequestId());
    if (!res.ok) {
      setState({ kind: 'error', message: res.error.message });
      return;
    }
    setState({ kind: 'waiting' });
    void pollTask(res.result.taskId as string, Date.now() + POLL_TIMEOUT_MS);
  }

  const busy = state.kind === 'sending' || state.kind === 'waiting';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Tools</h2>
        <p className="text-gray-600 mt-1">Things for checking the plumbing, not for running a job.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 max-w-2xl">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Test invoice email</h3>
        <p className="text-gray-600 text-sm mb-4">
          Sends a synthetic invoice to the address on your own profile — never a real customer's. It
          carries the selected company's name and logo, so it is also how you see what your letterhead
          looks like before a shipper does.
        </p>

        <button
          type="button"
          onClick={() => void sendTestEmail()}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {busy ? 'Sending…' : 'Send test invoice'}
        </button>

        <div className="mt-3 text-sm" role="status">
          {state.kind === 'waiting' && (
            <span className="text-gray-600">Queued — waiting for the drain to send it…</span>
          )}
          {state.kind === 'sent' && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <Check className="w-4 h-4" />
              Sent — check the inbox
            </span>
          )}
          {state.kind === 'failed' && (
            <span className="inline-flex items-center gap-1.5 text-red-700">
              <X className="w-4 h-4" />
              Failed{state.lastError !== undefined ? `: ${state.lastError}` : ''}
            </span>
          )}
          {state.kind === 'timeout' && (
            <span className="inline-flex items-center gap-1.5 text-amber-700">
              <X className="w-4 h-4" />
              Still not sent after 6 minutes — check the drain logs
            </span>
          )}
          {state.kind === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-red-700">
              <X className="w-4 h-4" />
              {state.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
