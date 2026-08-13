import { BookmarkPlus, ChevronDown } from 'lucide-react';
import type { AddressBookEntry } from '@mbh/domain';
import type { Form } from './CreateLoad';

export type AddressSide = 'source' | 'destination';

// Fills a whole collection/delivery block from a saved entry. The domain
// Address has no separate "city", so town fills both form fields — city is
// the one postLoad actually reads (see CreateLoad's submit), town is the
// spare label the prototype form carries.
export function fieldsFromEntry(side: AddressSide, entry: AddressBookEntry): Partial<Form> {
  return {
    [`${side}_company_name`]: entry.companyName,
    [`${side}_street`]: entry.line1,
    [`${side}_town`]: entry.town,
    [`${side}_city`]: entry.town,
    [`${side}_postcode`]: entry.postcode,
    [`${side}_contact_name`]: entry.contactName,
    [`${side}_contact_email`]: entry.contactEmail,
    [`${side}_contact_phone`]: entry.contactPhone,
  } as Partial<Form>;
}

// What a ticked "save to address book" sends for this side. Reads city (not
// town) because that is the field that becomes the load's real address.
export function entryFromFields(side: AddressSide, f: Form): {
  label: string;
  companyName: string;
  line1: string;
  town: string;
  postcode: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
} {
  const company = f[`${side}_company_name`];
  const city = f[`${side}_city`];
  return {
    // The label is what the shipper picks by later; company + town reads
    // naturally ("Tesco Distribution — Manchester") without asking them to
    // name it while they are mid-form.
    label: [company, city].filter((part) => part.trim() !== '').join(' — '),
    companyName: company,
    line1: f[`${side}_street`],
    town: city,
    postcode: f[`${side}_postcode`],
    contactName: f[`${side}_contact_name`],
    contactEmail: f[`${side}_contact_email`],
    contactPhone: f[`${side}_contact_phone`],
  };
}

// The picker + save tick shown above each address block on Create Load.
// Renders nothing but the tick when the book is empty, so a first-time
// shipper is not shown a dropdown with no options in it.
export function AddressBookPicker({
  side,
  entries,
  onPick,
  save,
  onSaveChange,
  canSave,
}: {
  side: AddressSide;
  entries: AddressBookEntry[];
  onPick: (entry: AddressBookEntry) => void;
  save: boolean;
  onSaveChange: (next: boolean) => void;
  canSave: boolean;
}) {
  const label = side === 'source' ? 'collection' : 'delivery';

  return (
    <div className="mb-4 pb-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
      {entries.length > 0 ? (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <span className="whitespace-nowrap">Use a saved address</span>
          <span className="relative">
            <select
              aria-label={`Saved ${label} addresses`}
              value=""
              onChange={(e) => {
                const picked = entries.find((entry) => entry.entryId === e.target.value);
                if (picked !== undefined) onPick(picked);
              }}
              className="appearance-none pl-3 pr-8 py-1.5 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Choose…</option>
              {entries.map((entry) => (
                <option key={entry.entryId} value={entry.entryId}>
                  {entry.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </span>
        </label>
      ) : (
        <span className="text-sm text-gray-500">No saved addresses yet — tick below to keep this one.</span>
      )}

      <label
        className={`flex items-center gap-2 text-sm whitespace-nowrap ${canSave ? 'text-gray-700' : 'text-gray-400'}`}
        title={canSave ? undefined : 'Fill in the street, city and postcode first'}
      >
        <input
          type="checkbox"
          checked={save && canSave}
          disabled={!canSave}
          onChange={(e) => onSaveChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300"
        />
        <BookmarkPlus className="w-4 h-4" />
        Save to address book
      </label>
    </div>
  );
}
