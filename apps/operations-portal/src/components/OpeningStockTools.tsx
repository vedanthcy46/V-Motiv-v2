import React, { useMemo, useRef, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Modal } from '@vmotiv/ui';
import { api } from '../api';
import type { Branch, OpeningStockBulkResult } from '../types';
import { OPENING_STOCK_CSV_TEMPLATE, readOpeningStockCsv, rupeesToPaise, type OpeningStockRow } from '../openingStockCsv';

const FUELS = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID', 'LPG'];
const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC', 'AMT', 'CVT', 'DCT', 'IMT'];
const DOCUMENTS: Array<{ code: string; label: string }> = [
  { code: 'RC', label: 'RC' },
  { code: 'INSURANCE', label: 'Insurance' },
  { code: 'PUC', label: 'PUC' },
  { code: 'SERVICE_HISTORY', label: 'Service history' },
  { code: 'LOAN_NOC', label: 'Loan NOC' },
  { code: 'FORM_29_30', label: 'Form 29/30' },
  { code: 'OTHER', label: 'Other' },
];

const NOTICE = 'These cars are entered by hand. Each arrives as Received stock and must pass inspection (QC) before it can be prepared and listed.';

/**
 * Cars a hub already owned before the app existed: "Add opening stock" for one car, "Import CSV" for many.
 * Nothing here lists a car: the server puts each one in as Received stock, and it still has to pass inspection.
 */
export function OpeningStockTools({ user, branches, onAdded }: { user: User; branches: Branch[]; onAdded: (message: string) => void }) {
  const [mode, setMode] = useState<'none' | 'one' | 'import'>('none');
  const close = () => setMode('none');
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setMode('import')} title="Add many cars from a spreadsheet">Import CSV</button>
      <button type="button" className="btn-primary" onClick={() => setMode('one')} title="Add a car the hub already owned before the app">+ Add opening stock</button>
      {mode === 'one' ? <AddOneModal user={user} branches={branches} onClose={close} onAdded={message => { close(); onAdded(message); }} /> : null}
      {mode === 'import' ? <ImportModal user={user} branches={branches} onClose={close} onAdded={message => { close(); onAdded(message); }} /> : null}
    </>
  );
}

function HubSelect({ branches, value, onChange }: { branches: Branch[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="form-group">
      <label htmlFor="opening-hub">Hub where the car is</label>
      <select id="opening-hub" className="form-select select" value={value} onChange={event => onChange(event.target.value)} required>
        {branches.length !== 1 ? <option value="">Choose a hub…</option> : null}
        {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name} ({branch.city})</option>)}
      </select>
    </div>
  );
}

function AddOneModal({ user, branches, onClose, onAdded }: { user: User; branches: Branch[]; onClose: () => void; onAdded: (message: string) => void }) {
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0]!.id : '');
  const [form, setForm] = useState({ registrationNumber: '', make: '', model: '', variant: '', manufacturingYear: '', fuelType: 'PETROL', transmission: 'MANUAL', odometerKm: '', cost: '', physicalLocation: '', notes: '' });
  const [documents, setDocuments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(current => ({ ...current, [field]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const paise = rupeesToPaise(form.cost);
    if (!paise) { setError('Enter what the hub paid for the car as an amount, for example 850000.'); return; }
    if (!branchId) { setError('Choose the hub where the car is.'); return; }
    setBusy(true);
    try {
      const unit = await api.addOpeningStock(user, {
        branchId,
        registrationNumber: form.registrationNumber,
        make: form.make,
        model: form.model,
        ...(form.variant.trim() ? { variant: form.variant } : {}),
        manufacturingYear: Number(form.manufacturingYear),
        fuelType: form.fuelType,
        transmission: form.transmission,
        odometerKm: Number(form.odometerKm),
        acquisitionCostPaise: paise,
        ...(form.physicalLocation.trim() ? { physicalLocation: form.physicalLocation } : {}),
        ...(form.notes.trim() ? { notes: form.notes } : {}),
        ...(documents.length ? { documentsOnFile: documents } : {}),
      });
      onAdded(`${unit.stockCode} added as opening stock. It needs inspection before it can be listed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The car could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add opening stock"
      description="A car the hub already owned before the app existed."
      size="lg"
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn-ghost button secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary button primary" disabled={busy}>{busy ? 'Adding…' : 'Add to stock'}</button>
        </>
      }
    >
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{NOTICE}</p>
      {error ? <div className="alert-error" role="alert" style={{ marginBottom: '0.75rem' }}>{error}</div> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
        <HubSelect branches={branches} value={branchId} onChange={setBranchId} />
        <div className="form-group"><label>Registration number</label><input className="form-input input" required value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="KA01AB1234" /></div>
        <div className="form-group"><label>Make</label><input className="form-input input" required value={form.make} onChange={set('make')} placeholder="Hyundai" /></div>
        <div className="form-group"><label>Model</label><input className="form-input input" required value={form.model} onChange={set('model')} placeholder="Creta" /></div>
        <div className="form-group"><label>Variant (optional)</label><input className="form-input input" value={form.variant} onChange={set('variant')} placeholder="SX" /></div>
        <div className="form-group"><label>Manufacturing year</label><input className="form-input input" required inputMode="numeric" value={form.manufacturingYear} onChange={set('manufacturingYear')} placeholder="2020" /></div>
        <div className="form-group"><label>Fuel</label><select className="form-select select" value={form.fuelType} onChange={set('fuelType')}>{FUELS.map(item => <option key={item}>{item}</option>)}</select></div>
        <div className="form-group"><label>Transmission</label><select className="form-select select" value={form.transmission} onChange={set('transmission')}>{TRANSMISSIONS.map(item => <option key={item}>{item}</option>)}</select></div>
        <div className="form-group"><label>Odometer (km)</label><input className="form-input input" required inputMode="numeric" value={form.odometerKm} onChange={set('odometerKm')} placeholder="42000" /></div>
        <div className="form-group"><label>Cost paid by the hub (₹)</label><input className="form-input input" required inputMode="decimal" value={form.cost} onChange={set('cost')} placeholder="850000" /></div>
        <div className="form-group"><label>Where in the hub (optional)</label><input className="form-input input" value={form.physicalLocation} onChange={set('physicalLocation')} placeholder="Yard bay 3" /></div>
      </div>
      <div className="form-group" style={{ marginTop: '0.75rem' }}>
        <label>Documents the hub holds (the originals stay with the hub)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {DOCUMENTS.map(document => (
            <label key={document.code} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}>
              <input type="checkbox" checked={documents.includes(document.code)} onChange={event => setDocuments(current => (event.target.checked ? [...current, document.code] : current.filter(code => code !== document.code)))} />
              {document.label}
            </label>
          ))}
        </div>
      </div>
      <div className="form-group" style={{ marginTop: '0.75rem' }}>
        <label>Notes (optional)</label>
        <textarea className="form-textarea input" rows={2} value={form.notes} onChange={set('notes')} />
      </div>
    </Modal>
  );
}

function ImportModal({ user, branches, onClose, onAdded }: { user: User; branches: Branch[]; onClose: () => void; onAdded: (message: string) => void }) {
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0]!.id : '');
  const [fileName, setFileName] = useState('');
  const [fileProblems, setFileProblems] = useState<string[]>([]);
  const [rows, setRows] = useState<ReturnType<typeof readOpeningStockCsv>['rows']>([]);
  const [check, setCheck] = useState<OpeningStockBulkResult | null>(null);
  const [done, setDone] = useState<OpeningStockBulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const readable = useMemo(() => rows.filter((row): row is { line: number; item: OpeningStockRow } => row.item !== null), [rows]);
  const unreadable = rows.filter(row => row.item === null);

  async function chooseFile(file: File | undefined) {
    setCheck(null); setDone(null); setError('');
    if (!file) return;
    setFileName(file.name);
    const result = readOpeningStockCsv(await file.text());
    setFileProblems(result.fileProblems);
    setRows(result.rows);
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([OPENING_STOCK_CSV_TEMPLATE], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'opening-stock-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function run(dryRun: boolean) {
    if (!branchId) { setError('Choose the hub where these cars are.'); return; }
    setBusy(true); setError('');
    try {
      const result = await api.addOpeningStockBulk(user, { branchId, dryRun, items: readable.map(row => row.item) });
      if (dryRun) setCheck(result); else setDone(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The file could not be processed.');
    } finally {
      setBusy(false);
    }
  }

  // The server numbers its rows 1..n among the readable ones; show the line from the spreadsheet instead.
  const lineOf = (serverRow: number) => readable[serverRow - 1]?.line ?? serverRow + 1;
  const result = done ?? check;

  return (
    <Modal
      title="Import opening stock from a spreadsheet"
      description="Add many cars the hub already owned before the app existed."
      size="xl"
      busy={busy}
      onClose={onClose}
      footer={
        done ? (
          <button type="button" className="btn btn-primary button primary" onClick={() => onAdded(`${done.created} car${done.created === 1 ? '' : 's'} added as opening stock${done.failed ? `; ${done.failed} could not be added` : ''}. They need inspection before they can be listed.`)}>Done</button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost button secondary" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-secondary button secondary" disabled={busy || readable.length === 0} onClick={() => void run(true)}>{busy ? 'Checking…' : 'Check the file'}</button>
            <button type="button" className="btn btn-primary button primary" disabled={busy || !check || check.wouldCreate === 0} onClick={() => void run(false)}>
              {check ? `Add ${check.wouldCreate} car${check.wouldCreate === 1 ? '' : 's'}` : 'Add cars'}
            </button>
          </>
        )
      }
    >
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{NOTICE}</p>
      {error ? <div className="alert-error" role="alert" style={{ marginBottom: '0.75rem' }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
        <HubSelect branches={branches} value={branchId} onChange={setBranchId} />
        <div className="form-group">
          <label htmlFor="opening-file">CSV file</label>
          <input id="opening-file" ref={fileInput} type="file" accept=".csv,text/csv" className="form-input input" onChange={event => void chooseFile(event.target.files?.[0])} />
        </div>
        <div className="form-group">
          <button type="button" className="btn-secondary button secondary" onClick={downloadTemplate}>Download a template</button>
        </div>
      </div>

      {fileProblems.map(problem => <div key={problem} className="alert-error" role="alert" style={{ marginTop: '0.75rem' }}>{problem}</div>)}

      {fileName && !fileProblems.length ? (
        <p style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
          <strong>{fileName}</strong>: {readable.length} car{readable.length === 1 ? '' : 's'} read{unreadable.length ? `, ${unreadable.length} line${unreadable.length === 1 ? '' : 's'} could not be read` : ''}.
          {!result ? ' Press “Check the file” to see what would be added before anything is saved.' : ''}
        </p>
      ) : null}

      {unreadable.length ? (
        <ul style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--danger, #f87171)' }}>
          {unreadable.map(row => <li key={row.line}>Line {row.line}: {row.problem}</li>)}
        </ul>
      ) : null}

      {result ? (
        <div style={{ marginTop: '0.9rem' }}>
          <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
            {done
              ? `${result.created} added, ${result.failed} not added.`
              : `${result.wouldCreate} can be added, ${result.failed} cannot.`}
          </p>
          <div className="table-responsive" style={{ maxHeight: '45vh', overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Line</th><th>Registration</th><th>Result</th></tr></thead>
              <tbody>
                {result.items.map(item => (
                  <tr key={item.row}>
                    <td>{lineOf(item.row)}</td>
                    <td>{item.registrationNumber || '—'}</td>
                    <td>
                      {item.status === 'FAILED'
                        ? <span className="badge badge-danger">{item.message}</span>
                        : <span className="badge badge-success">{item.status === 'CREATED' ? `Added ${item.stockCode}` : 'Ready to add'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
