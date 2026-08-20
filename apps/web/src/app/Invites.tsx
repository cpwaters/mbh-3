import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Plus, Copy, Check, Ban } from 'lucide-react';
import { inviteState, inviteStateMessage, type Invite, type InviteState } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { useApp } from './context';
import { getReader } from '../lib/reader';
import { dispatchAction } from '../lib/dispatch';

// The founder's invitations. Joining MyBackHaul is by invitation, so this is
// the door: mint a link, send it, and see what has been used. Founder-only —
// enforced server-side by requireFounder, and by the `list` rule on /invites;
// this screen is the convenience on top.
function inviteLink(inviteId: string): string {
  return `${window.location.origin}/app/invite/${inviteId}`;
}

const STATE_STYLES: Record<InviteState, string> = {
  valid: 'bg-green-100 text-green-800',
  redeemed: 'bg-gray-100 text-gray-700',
  revoked: 'bg-amber-100 text-amber-800',
  expired: 'bg-amber-100 text-amber-800',
};

const STATE_LABELS: Record<InviteState, string> = {
  valid: 'Unused',
  redeemed: 'Used',
  revoked: 'Withdrawn',
  expired: 'Expired',
};

export default function Invites() {
  const app = useApp();
  const reader = useMemo(getReader, []);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const now = new Date().toISOString();

  const load = useCallback(() => {
    setLoading(true);
    reader
      .invitesForFounder()
      .then((rows) => {
        setInvites(rows);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not read the invitations.');
        setLoading(false);
      });
  }, [reader]);

  useEffect(load, [load]);

  async function mint(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await dispatchAction(app.auth.getIdToken, 'createInvite', { note }, genRequestId());
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setNote('');
    // Straight onto the clipboard: minting one is only ever a prelude to
    // sending it.
    await copy(res.result.inviteId as string);
    load();
  }

  async function copy(inviteId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteLink(inviteId));
      setCopied(inviteId);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked — the link is on screen to copy by hand */
    }
  }

  async function revoke(inviteId: string): Promise<void> {
    setError(null);
    const res = await dispatchAction(app.auth.getIdToken, 'revokeInvite', { inviteId }, genRequestId());
    if (res.ok) load();
    else setError(res.error.message);
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Invitations</h1>
          <p className="text-gray-600">
            Joining MyBackHaul is by invitation. Each link sets up one company, once, and expires after seven days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Who is this for?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Who is it for? (your note)"
            className="px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 min-w-0 flex-1 sm:flex-none sm:w-72"
          />
          <button
            onClick={() => void mint()}
            disabled={busy}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {busy ? 'Creating…' : 'New invitation'}
          </button>
        </div>
      </div>

      {error !== null && (
        <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-600">Loading invitations…</div>
      ) : invites.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No invitations yet</h3>
          <p className="text-gray-600">Create one and send the link to the company you want on the marketplace.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {invites.map((invite) => {
            const state = inviteState(invite, now);
            return (
              <div key={invite.inviteId} className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATE_STYLES[state]}`}>{STATE_LABELS[state]}</span>
                      <span className="font-medium text-gray-900">{invite.note || 'No note'}</span>
                    </div>
                    {state === 'valid' ? (
                      <code className="block mt-2 text-xs text-gray-600 break-all">{inviteLink(invite.inviteId)}</code>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">{inviteStateMessage(state)}</p>
                    )}
                  </div>
                  {state === 'valid' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => void copy(invite.inviteId)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5"
                      >
                        {copied === invite.inviteId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied === invite.inviteId ? 'Copied' : 'Copy link'}
                      </button>
                      <button
                        onClick={() => void revoke(invite.inviteId)}
                        className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-1.5"
                      >
                        <Ban className="w-4 h-4" />
                        Withdraw
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
