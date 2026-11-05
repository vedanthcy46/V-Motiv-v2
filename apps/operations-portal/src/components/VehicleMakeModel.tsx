import { useEffect, useState, type ReactNode } from 'react';
import { OTHER_OPTION, isManualEntry, loadMakeModelCatalog, matchName, type MakeModelCatalog, type MasterItem } from '../vehicleCatalog';

/**
 * Make + Model fields (two grid cells) fed by the master data. Pick from the list, or choose "Other" to type a brand /
 * model that is not in the catalogue yet. Works with no catalogue at all (plain text boxes).
 */
export function VehicleMakeModel({ make, model, onChange, loadItems, variant = 'ops', required = true }: {
  make: string;
  model: string;
  onChange: (make: string, model: string) => void;
  loadItems: () => Promise<MasterItem[]>;
  variant?: 'ops' | 'sales';
  required?: boolean;
}) {
  const [catalog, setCatalog] = useState<MakeModelCatalog>({ makes: [], modelsByMake: {} });
  const [makeManual, setMakeManual] = useState(false);
  const [modelManual, setModelManual] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadMakeModelCatalog(loadItems).then(next => { if (!cancelled) setCatalog(next); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canonicalMake = matchName(catalog.makes, make);
  const models = canonicalMake ? catalog.modelsByMake[canonicalMake] ?? [] : [];
  const noCatalogue = catalog.makes.length === 0;
  const showMakeText = noCatalogue || makeManual || isManualEntry(catalog.makes, make);
  const showModelText = showMakeText && !canonicalMake ? true : models.length === 0 || modelManual || isManualEntry(models, model);

  const wrap = (label: string, control: ReactNode) =>
    variant === 'sales' ? (
      <div className="form-group">
        <label className="form-label">{label}{required ? ' *' : ''}</label>
        {control}
      </div>
    ) : (
      <div>
        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>{label}{required ? ' *' : ''}</label>
        {control}
      </div>
    );
  const selectProps = variant === 'sales' ? { className: 'form-input' } : { className: 'select', style: { width: '100%', marginTop: '3px' } };
  const inputProps = variant === 'sales' ? { className: 'form-input' } : { className: 'input', style: { width: '100%', marginTop: '3px' } };

  return (
    <>
      {wrap('Make', showMakeText ? (
        <>
          <input
            type="text"
            {...inputProps}
            required={required}
            placeholder="Type the brand, e.g. Hyundai"
            value={make}
            onChange={e => onChange(e.target.value, model)}
            onBlur={() => {
              // A hand-typed brand that is really in the catalogue switches back to the list with the canonical spelling.
              const canonical = matchName(catalog.makes, make);
              if (canonical) { setMakeManual(false); onChange(canonical, model); }
            }}
          />
          {!noCatalogue && (
            <button type="button" className="btn-link" style={{ fontSize: '0.72rem', marginTop: '2px', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
              onClick={() => { setMakeManual(false); setModelManual(false); onChange('', ''); }}>
              Pick from the list instead
            </button>
          )}
        </>
      ) : (
        <select
          {...selectProps}
          required={required}
          value={canonicalMake ?? ''}
          onChange={e => {
            if (e.target.value === OTHER_OPTION) { setMakeManual(true); setModelManual(true); onChange('', ''); return; }
            setModelManual(false);
            onChange(e.target.value, '');
          }}
        >
          <option value="">-- Select make --</option>
          {catalog.makes.map(name => <option key={name} value={name}>{name}</option>)}
          <option value={OTHER_OPTION}>Other — type manually</option>
        </select>
      ))}
      {wrap('Model', showModelText ? (
        <>
          <input
            type="text"
            {...inputProps}
            required={required}
            placeholder="Type the model, e.g. Creta"
            value={model}
            onChange={e => onChange(make, e.target.value)}
            onBlur={() => {
              const canonical = matchName(models, model);
              if (canonical && canonical !== model) onChange(make, canonical);
            }}
          />
          {models.length > 0 && (
            <button type="button" className="btn-link" style={{ fontSize: '0.72rem', marginTop: '2px', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
              onClick={() => { setModelManual(false); onChange(make, ''); }}>
              Pick from the list instead
            </button>
          )}
        </>
      ) : (
        <select
          {...selectProps}
          required={required}
          value={matchName(models, model) ?? ''}
          onChange={e => {
            if (e.target.value === OTHER_OPTION) { setModelManual(true); onChange(make, ''); return; }
            onChange(make, e.target.value);
          }}
        >
          <option value="">-- Select model --</option>
          {models.map(name => <option key={name} value={name}>{name}</option>)}
          <option value={OTHER_OPTION}>Other — type manually</option>
        </select>
      ))}
    </>
  );
}
