import { useState } from 'react';
import { BookMarked, Pencil, Archive, Plus, X } from 'lucide-react';
import type { AddressBookEntry } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { useApp } from '../context';
import { useAddressBook } from '../../components/useAddressBook';
import { dispatchAction } from '../../lib/dispatch';

const empty = {
  label: '',
  companyName: '',
  line1: '',
  town: '',
  postcode: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
};
type EntryForm = typeof empty;

function formFrom(entry: AddressBookEntry): EntryForm {
  return {
    label: entry.label,
    companyName: entry.companyName,
    line1: entry.line1,
    town: entry.town,
    postcode: entry.postcode,
    contactName: entry.contactName,
    contactEmail: entry.contactEmail,
    contactPhone: entry.contactPhone,
  };
}

// The shipper's saved collection/delivery points. Curating this list is what
// makes the Create Load picker useful; entries are archived rather than
// deleted, so one disappearing never surprises a colleague mid-form.
export default function AddressBook() {
  const app = useApp();
  const shipperTenantId = app.selected?.tenantId ?? null;
  const { loading, entries, reload } = useAddressBook(shipperTenantId);

  const [editing, setEditing] = useState<string | null>(null); // entryId, or 'new'
  const [form, setForm] = useState<EntryForm>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const set = (k: keyof EntryForm) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  function startNew(): void {
    setEditing('new');
    setForm(empty);
    setError(null);
  }

  function startEdit(entry: AddressBookEntry): void {
    setEditing(entry.entryId);
    setForm(formFrom(entry));
    setError(null);
  }

  function cancel(): void {
    setEditing(null);
    setError(null);
  }

  async function save(): Promise<void> {
    if (shipperTenantId === null) {
      setError('Select a shipper company first.');
      return;
    }
    setBusy(true);
    setError(null);
    const isNew = editing === 'new';
    const res = await dispatchAction(
      app.auth.getIdToken,
      isNew ? 'saveAddressBookEntry' : 'updateAddressBookEntry',
      {
        shipperTenantId,
        ...(isNew ? {} : { entryId: editing }),
        ...form,
      },
      genRequestId()
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setEditing(null);
    reload();
  }

  async function archive(entry: AddressBookEntry): Promise<void> {
    if (shipperTenantId === null) return;
    setArchivingId(entry.entryId);
    setError(null);
    const res = await dispatchAction(
      app.auth.getIdToken,
      'archiveAddressBookEntry',
      { shipperTenantId, entryId: entry.entryId },
      genRequestId()
    );
    setArchivingId(null);
    if (res.ok) reload();
    else setError(res.error.message);
  }

  function field(k: keyof EntryForm, label: string, required = false, type = 'text', placeholder = '') {
    return (
      <div>
        <label htmlFor={`ab_${k}`} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
          id={`ab_${k}`}
          type={type}
          value={form[k]}
          onChange={set(k)}
          placeholder={placeholder}
          className="block w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-center h-64 text-gray-600">Loading address book…</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Address Book</h1>
          <p className="text-gray-600">Saved collection and delivery points, offered when you create a load</p>
        </div>
        {editing === null && (
          <button
            onClick={startNew}
            className="self-start bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add address
          </button>
        )}
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>}

      {editing !== null && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {editing === 'new' ? 'New address' : 'Edit address'}
            </h2>
            <button onClick={cancel} className="text-gray-400 hover:text-gray-600" aria-label="Cancel">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('label', 'Name in your address book', true, 'text', 'Tesco Trafford DC')}
            {field('companyName', 'Company name', false, 'text', 'Tesco Distribution')}
            {field('line1', 'Street', true, 'text', '10 Distribution Way')}
            {field('town', 'Town or city', true, 'text', 'Trafford')}
            {field('postcode', 'Postcode', true, 'text', 'M17 1WS')}
            {field('contactName', 'Contact name', false, 'text', 'John Smith')}
            {field('contactEmail', 'Contact email', false, 'email', 'john@tesco.test')}
            {field('contactPhone', 'Contact phone', false, 'tel', '0161 234 5678')}
          </div>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => void save()}
              disabled={busy}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {busy ? 'Saving…' : 'Save address'}
            </button>
            <button
              onClick={cancel}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {entries.map((entry) => (
          <div key={entry.entryId} className="bg-white rounded-lg shadow-md border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{entry.label}</div>
                {entry.companyName !== '' && <div className="text-sm text-gray-600">{entry.companyName}</div>}
                <div className="text-sm text-gray-600 mt-1">
                  {entry.line1}, {entry.town}, {entry.postcode}
                </div>
                {(entry.contactName !== '' || entry.contactEmail !== '') && (
                  <div className="text-sm text-gray-500 mt-1">
                    {[entry.contactName, entry.contactEmail, entry.contactPhone].filter((p) => p !== '').join(' · ')}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(entry)}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => void archive(entry)}
                  disabled={archivingId === entry.entryId}
                  className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  title="Stop offering this address when creating a load"
                >
                  <Archive className="w-4 h-4" />
                  {archivingId === entry.entryId ? 'Archiving…' : 'Archive'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {entries.length === 0 && editing === null && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <BookMarked className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No saved addresses yet</h3>
          <p className="text-gray-600">
            Add one here, or tick "Save to address book" while creating a load.
          </p>
        </div>
      )}
    </div>
  );
}
