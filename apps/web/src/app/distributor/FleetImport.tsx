import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { buildVehicleImport, vehicleImportTemplateCsv, type VehicleImportReport } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { useApp } from '../context';
import { dispatchAction } from '../../lib/dispatch';
import { readSpreadsheet } from '../../lib/spreadsheet';

interface Progress {
  done: number;
  total: number;
  failed: { rowNumber: number; message: string }[];
}

// Bulk-add a fleet from the spreadsheet it already lives in. The file is read
// on the device — nothing is uploaded — and every row is checked before
// anything is sent, so the person sees what will happen before it does.
//
// Each accepted row goes through the ordinary addVehicle action with its own
// requestId. There is no bulk write: one mutation path, and a row that fails
// leaves the rest alone rather than rolling back a partial batch.
export default function FleetImport() {
  const app = useApp();
  const navigate = useNavigate();
  const tenantId = app.selected?.tenantId ?? null;

  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<VehicleImportReport | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [importing, setImporting] = useState(false);

  async function onFile(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (file === undefined) return;
    setFileName(file.name);
    setReadError(null);
    setReport(null);
    setProgress(null);
    try {
      setReport(buildVehicleImport(await readSpreadsheet(file)));
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'That file could not be read.');
    }
  }

  function downloadTemplate(): void {
    const blob = new Blob([vehicleImportTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fleet-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runImport(): Promise<void> {
    if (tenantId === null || report === null) return;
    setImporting(true);
    const rows = report.rows.filter((row) => row.vehicle !== null);
    const failed: Progress['failed'] = [];

    for (const [i, row] of rows.entries()) {
      const res = await dispatchAction(
        app.auth.getIdToken,
        'addVehicle',
        { carrierTenantId: tenantId, ...row.vehicle },
        genRequestId()
      );
      if (!res.ok) failed.push({ rowNumber: row.rowNumber, message: res.error.message });
      setProgress({ done: i + 1, total: rows.length, failed: [...failed] });
    }

    setImporting(false);
    // Nothing landed at all: stay put with the reasons on screen.
    if (failed.length === rows.length && rows.length > 0) return;
    navigate('/vehicles', {
      state: {
        flash:
          failed.length === 0
            ? `${rows.length} vehicle${rows.length === 1 ? '' : 's'} imported.`
            : `${rows.length - failed.length} of ${rows.length} imported — ${failed.length} refused.`,
      },
    });
  }

  const readyCount = report?.ready.length ?? 0;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button
        onClick={() => navigate('/vehicles')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Fleet
      </button>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Import fleet</h1>
      <p className="text-gray-600 mb-6">
        Add your vehicles and trailers from a spreadsheet. The file is read on this device — nothing is uploaded.
      </p>

      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <label
            htmlFor="fleet_file"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Choose file
          </label>
          <input
            id="fleet_file"
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => void onFile(e.target.files)}
            className="sr-only"
          />
          <span className="text-sm text-gray-600">{fileName ?? 'CSV or Excel (.xlsx)'}</span>
          <button
            onClick={downloadTemplate}
            className="sm:ml-auto inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download template
          </button>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          The first row must be the column headings. A trailer needs its{' '}
          <span className="font-medium">trailerNumber</span> and{' '}
          <span className="font-medium">vehicleConfiguration</span>; everything else needs{' '}
          <span className="font-medium">registration</span>, <span className="font-medium">make</span>,{' '}
          <span className="font-medium">model</span> and <span className="font-medium">year</span> — and a
          configuration too, unless it is a unit.
        </p>
      </div>

      {readError !== null && (
        <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {readError}
        </div>
      )}

      {report?.fatal != null && (
        <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {report.fatal}
        </div>
      )}

      {report !== null && report.fatal === null && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-medium text-gray-900">
              {readyCount} ready to import
              {report.errorCount > 0 && `, ${report.errorCount} to fix`}
            </span>
            {report.unknownHeaders.length > 0 && (
              <span className="text-sm text-amber-700">
                Ignored column{report.unknownHeaders.length === 1 ? '' : 's'}: {report.unknownHeaders.join(', ')}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Row</th>
                  <th className="text-left font-medium px-4 py-2">Vehicle</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.rowNumber} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-500">{row.rowNumber}</td>
                    <td className="px-4 py-2 text-gray-900">
                      {row.vehicle !== null
                        ? [
                            row.vehicle.trailerNumber || row.vehicle.registration,
                            `${row.vehicle.make} ${row.vehicle.model}`.trim(),
                            row.vehicle.vehicleType,
                          ]
                            .filter((part) => part !== '')
                            .join(' · ')
                        : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {row.error === null ? (
                        <span className="inline-flex items-center gap-1.5 text-green-700">
                          <CheckCircle2 className="w-4 h-4" />
                          Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1.5 text-red-700">
                          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          {row.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-200 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void runImport()}
              disabled={importing || readyCount === 0}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {importing
                ? `Importing ${progress?.done ?? 0} of ${progress?.total ?? readyCount}…`
                : `Import ${readyCount} vehicle${readyCount === 1 ? '' : 's'}`}
            </button>
            {report.errorCount > 0 && (
              <span className="text-sm text-gray-600">
                Rows with a problem are skipped — fix them in the sheet and import it again.
              </span>
            )}
          </div>

          {progress !== null && progress.failed.length > 0 && (
            <div className="p-4 border-t border-gray-200 bg-red-50">
              <p className="text-sm font-medium text-red-800 mb-1">The server refused some rows:</p>
              <ul className="text-sm text-red-700 list-disc ml-5">
                {progress.failed.map((f) => (
                  <li key={f.rowNumber}>
                    Row {f.rowNumber}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
