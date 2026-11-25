import { useState } from 'react';
import { Check, Copy, Link2, Mail, MoreHorizontal, Share2, X } from 'lucide-react';
import { shareMessage, sharePath, socialShareLinks, type ShareSummary, type SocialNetwork } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';

const NETWORKS: { key: SocialNetwork; label: string }[] = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X' },
  { key: 'reddit', label: 'Reddit' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'email', label: 'Email' },
];

type State =
  | { kind: 'closed' }
  | { kind: 'making' }
  | { kind: 'open'; url: string; message: string }
  | { kind: 'error'; message: string };

// "Share" on a load: makes (or fetches) its short link, then offers it to
// copy, to post on Facebook, X, Reddit, WhatsApp, LinkedIn or by email, and,
// on a phone, through the phone's own share sheet, which is the way into
// Instagram (it takes no links from the web).
export function ShareLoad({
  tenantId,
  loadId,
  summary,
  getIdToken,
}: {
  // The company the sharer is acting as.
  tenantId: string | null;
  loadId: string;
  summary: ShareSummary;
  getIdToken: () => Promise<string | null>;
}) {
  const [state, setState] = useState<State>({ kind: 'closed' });
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function open(): Promise<void> {
    if (tenantId === null) {
      setState({ kind: 'error', message: 'Your account is still loading — try again in a moment.' });
      return;
    }
    setState({ kind: 'making' });
    const res = await dispatchAction(getIdToken, 'shareLoad', { tenantId, loadId }, genRequestId());
    if (!res.ok) {
      setState({ kind: 'error', message: res.error.message });
      return;
    }
    const url = `${window.location.origin}${sharePath(res.result.code as string)}`;
    setState({ kind: 'open', url, message: shareMessage(summary) });
  }

  async function copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is on screen to copy by hand */
    }
  }

  if (state.kind !== 'open') {
    return (
      <div className="w-full sm:w-auto">
        <button
          type="button"
          onClick={() => void open()}
          disabled={state.kind === 'making'}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          <Share2 className="w-4 h-4" aria-hidden="true" />
          {state.kind === 'making' ? 'Making link…' : 'Share'}
        </button>
        {state.kind === 'error' && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {state.message}
          </p>
        )}
      </div>
    );
  }

  const links = socialShareLinks(state.url, state.message);
  return (
    <div className="w-full rounded-lg border border-blue-200 bg-blue-50 p-4" aria-label="Share this load" role="region">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-900 inline-flex items-center gap-2">
          <Share2 className="w-4 h-4 text-blue-600" aria-hidden="true" />
          Share this load
        </h3>
        <button
          type="button"
          onClick={() => setState({ kind: 'closed' })}
          className="p-1 rounded text-gray-500 hover:text-gray-800"
          aria-label="Close sharing"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 min-w-0 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
          <Link2 className="w-4 h-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="truncate text-sm text-gray-800" data-testid="share-url">
            {state.url}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copy(state.url)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {NETWORKS.map(({ key, label }) => (
          <a
            key={key}
            href={links[key]}
            target={key === 'email' ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {key === 'email' && <Mail className="w-4 h-4" aria-hidden="true" />}
            {label}
          </a>
        ))}
        {canNativeShare && (
          <button
            type="button"
            onClick={() => void navigator.share({ title: 'Backhaul on MyBackHaul', text: state.message, url: state.url }).catch(() => undefined)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            More…
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-600">
        {canNativeShare
          ? 'For Instagram, Messenger and the rest, use More… to share straight from your phone.'
          : 'Instagram takes no links from websites: copy the link to paste into your story or bio.'}{' '}
        Anyone with the link sees the route, dates, price and vehicle, never addresses or contacts.
      </p>
    </div>
  );
}
