import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Home, Truck, Package, LayoutDashboard, Mail, Loader2, Check, X } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { useApp } from './context';
import { dispatchAction } from '../lib/dispatch';

type SendState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

// A slim, founder-only toolbar (shown when signed in as the founder account).
// Quick access to the public home page and the carrier/shipper sign-up pages,
// a way back into the app, and a debug tool to prove the invoice-email
// pipeline (SMTP config, HTML/PDF rendering) end to end. Visually distinct
// from the product chrome.
export function FounderBar() {
  const app = useApp();
  const [state, setState] = useState<SendState>({ kind: 'idle' });
  const link =
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium text-indigo-100 hover:bg-white/10 transition-colors whitespace-nowrap';

  async function sendTestEmail() {
    const tenantId = app.selected?.tenantId;
    if (tenantId === undefined) {
      setState({ kind: 'error', message: 'Select a company first.' });
      return;
    }
    setState({ kind: 'sending' });
    const res = await dispatchAction(app.auth.getIdToken, 'sendTestInvoiceEmail', { tenantId }, genRequestId());
    setState(res.ok ? { kind: 'sent' } : { kind: 'error', message: res.error.message });
  }

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
        <button type="button" onClick={sendTestEmail} disabled={state.kind === 'sending'} className={link}>
          {state.kind === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          Send test email
        </button>
        {state.kind === 'sent' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-300 whitespace-nowrap">
            <Check className="w-3.5 h-3.5" />
            Queued — arrives within a minute
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
