import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Home, Truck, Package, LayoutDashboard, Mail, Loader2, Check, X } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { useApp } from './context';
import { dispatchAction } from '../lib/dispatch';
import { getReader } from '../lib/reader';

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

// A slim, founder-only toolbar (shown when signed in as the founder account).
// Quick access to the public home page and the carrier/shipper sign-up pages,
// a way back into the app, and a debug tool to prove the invoice-email
// pipeline (SMTP config, HTML/PDF rendering) end to end. Visually distinct
// from the product chrome.
export function FounderBar() {
  const app = useApp();
  const [state, setState] = useState<SendState>({ kind: 'idle' });
  const cancelledRef = useRef(false);
  const link =
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium text-indigo-100 hover:bg-white/10 transition-colors whitespace-nowrap';

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

  async function sendTestEmail() {
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
    const taskId = res.result.taskId as string;
    void pollTask(taskId, Date.now() + POLL_TIMEOUT_MS);
  }

  const busy = state.kind === 'sending' || state.kind === 'waiting';

  return (
    <div className="bg-indigo-950 text-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 h-10 flex items-center gap-1 overflow-x-auto">
        <span className="inline-flex items-center gap-1.5 pr-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">
          <ShieldCheck className="w-4 h-4" />
          Founder
        </span>
        {/* Public marketing site — a real navigation out of the app. */}
        <a href="/" className={link}>
          <Home className="w-4 h-4" />
          Home
        </a>
        <Link to="/signup/carrier" className={link}>
          <Truck className="w-4 h-4" />
          Carrier sign-up
        </Link>
        <Link to="/signup/shipper" className={link}>
          <Package className="w-4 h-4" />
          Shipper sign-up
        </Link>
        <button type="button" onClick={sendTestEmail} disabled={busy} className={link}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Send test email
        </button>
        {state.kind === 'waiting' && (
          <span className="inline-flex items-center gap-1 text-xs text-indigo-200 whitespace-nowrap">
            Queued — waiting for the drain to send it…
          </span>
        )}
        {state.kind === 'sent' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-300 whitespace-nowrap">
            <Check className="w-3.5 h-3.5" />
            Sent — check the inbox
          </span>
        )}
        {state.kind === 'failed' && (
          <span className="inline-flex items-center gap-1 text-xs text-rose-300 whitespace-nowrap">
            <X className="w-3.5 h-3.5" />
            Failed{state.lastError !== undefined ? `: ${state.lastError}` : ''}
          </span>
        )}
        {state.kind === 'timeout' && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-300 whitespace-nowrap">
            <X className="w-3.5 h-3.5" />
            Still not sent after 6 minutes — check the drain logs
          </span>
        )}
        {state.kind === 'error' && (
          <span className="inline-flex items-center gap-1 text-xs text-rose-300 whitespace-nowrap">
            <X className="w-3.5 h-3.5" />
            {state.message}
          </span>
        )}
        <Link to="/" className={`${link} ml-auto`}>
          <LayoutDashboard className="w-4 h-4" />
          App
        </Link>
      </div>
    </div>
  );
}
