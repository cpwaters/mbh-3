import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { shareMessage, sharePath, type ShareSummary } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';

// A load's short link, once made, for the rest of this visit: one link per
// load, and having it to hand means the next tap can open the share sheet at
// once (a phone only allows that straight after a tap, not after a wait on
// the network).
const madeLinks = new Map<string, string>();

type State =
  | { kind: 'idle' }
  | { kind: 'making' }
  // The link is made but the phone would not open its share sheet after the
  // wait; one more tap does it.
  | { kind: 'tap'; url: string }
  | { kind: 'copied'; url: string }
  // No share sheet and no clipboard: the link, to copy by hand.
  | { kind: 'shown'; url: string }
  | { kind: 'error'; message: string };

// "Share" on a load: makes (or reuses) its short link and opens the phone's
// own share sheet, which reaches Instagram, WhatsApp, Facebook, X and the
// rest. Where there is no share sheet (most computers) the link is copied.
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
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function deliver(url: string): Promise<void> {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Backhaul on MyBackHaul', text: shareMessage(summary), url });
        setState({ kind: 'idle' });
      } catch (err) {
        // Cancelled from the sheet: nothing to say. Refused because the tap
        // was too long ago: offer one more.
        const name = (err as { name?: string } | null)?.name;
        setState(name === 'AbortError' ? { kind: 'idle' } : { kind: 'tap', url });
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setState({ kind: 'copied', url });
    } catch {
      setState({ kind: 'shown', url });
    }
  }

  async function share(): Promise<void> {
    const made = madeLinks.get(loadId);
    if (made !== undefined) {
      await deliver(made);
      return;
    }
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
    madeLinks.set(loadId, url);
    await deliver(url);
  }

  return (
    <div className="w-full sm:w-auto min-w-0">
      <button
        type="button"
        onClick={() => void share()}
        disabled={state.kind === 'making'}
        className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-60 ${
          state.kind === 'tap'
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
      >
        <Share2 className="w-4 h-4" aria-hidden="true" />
        {state.kind === 'making' ? 'Making link…' : state.kind === 'tap' ? 'Share link' : 'Share'}
      </button>
      {state.kind === 'copied' && (
        <p className="mt-2 text-sm text-emerald-700 flex items-center gap-1.5 min-w-0">
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="shrink-0">Link copied:</span>
          <span className="truncate text-gray-700" data-testid="share-url">
            {state.url}
          </span>
        </p>
      )}
      {(state.kind === 'shown' || state.kind === 'tap') && (
        <p className="mt-2 text-sm text-gray-700 break-all" data-testid="share-url">
          {state.url}
        </p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.message}
        </p>
      )}
    </div>
  );
}

// For tests: forget the links made so far.
export function forgetMadeLinks(): void {
  madeLinks.clear();
}
