// Reading a hub's spreadsheet of cars it already owned (opening stock). Pure functions, no screen code, so they can be tested alone.
// The server checks everything again; this only turns a file into rows and catches what cannot even be read (a cost that is not a number).

export interface OpeningStockRow {
  registrationNumber: string;
  make: string;
  model: string;
  variant?: string;
  manufacturingYear: number;
  fuelType: string;
  transmission: string;
  odometerKm: number;
  /** Paise, as a string: JSON cannot carry a BigInt. */
  acquisitionCostPaise: string;
  physicalLocation?: string;
  notes?: string;
  documentsOnFile?: string[];
}

export interface CsvReadResult {
  /** One entry per data row, in file order. `row` is the line number a person would see in the spreadsheet (the header is line 1). */
  rows: Array<{ line: number; item: OpeningStockRow | null; problem?: string }>;
  /** Problems with the file as a whole (empty, a required column missing). */
  fileProblems: string[];
}

/** Splits CSV text into rows of cells: quoted cells, commas and line breaks inside quotes, "" for a quote, a leading BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(cells => cells.some(value => value.trim() !== ''));
}

/** "₹8,50,000" or "850000.50" -> "85000050" (paise). Returns null when it is not an amount. */
export function rupeesToPaise(text: string): string | null {
  const cleaned = text.replace(/[₹\s,]/g, '').replace(/^rs\.?/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0') || '0')).toString();
}

const key = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

// What each column may be called in a hub's own spreadsheet.
const ALIASES: Record<string, keyof OpeningStockRow | 'costRupees'> = {
  registrationnumber: 'registrationNumber', registration: 'registrationNumber', regno: 'registrationNumber', regnumber: 'registrationNumber', plate: 'registrationNumber', platenumber: 'registrationNumber', vehicleno: 'registrationNumber',
  make: 'make', brand: 'make',
  model: 'model',
  variant: 'variant', trim: 'variant',
  manufacturingyear: 'manufacturingYear', year: 'manufacturingYear', mfgyear: 'manufacturingYear', modelyear: 'manufacturingYear',
  fueltype: 'fuelType', fuel: 'fuelType',
  transmission: 'transmission', gearbox: 'transmission',
  odometerkm: 'odometerKm', odometer: 'odometerKm', km: 'odometerKm', kms: 'odometerKm', kmsdriven: 'odometerKm', kmdriven: 'odometerKm',
  acquisitioncostrupees: 'costRupees', acquisitioncost: 'costRupees', cost: 'costRupees', costrupees: 'costRupees', purchaseprice: 'costRupees', purchasecost: 'costRupees', price: 'costRupees', costpaid: 'costRupees',
  physicallocation: 'physicalLocation', location: 'physicalLocation', yardlocation: 'physicalLocation',
  notes: 'notes', remarks: 'notes', comments: 'notes',
  documentsonfile: 'documentsOnFile', documents: 'documentsOnFile',
};

const REQUIRED: Array<{ field: keyof OpeningStockRow | 'costRupees'; label: string }> = [
  { field: 'registrationNumber', label: 'registrationNumber' },
  { field: 'make', label: 'make' },
  { field: 'model', label: 'model' },
  { field: 'manufacturingYear', label: 'manufacturingYear' },
  { field: 'fuelType', label: 'fuelType' },
  { field: 'transmission', label: 'transmission' },
  { field: 'odometerKm', label: 'odometerKm' },
  { field: 'costRupees', label: 'acquisitionCostRupees' },
];

/** Turns CSV text into rows ready to send. Anything it cannot read is reported against its line, not silently dropped. */
export function readOpeningStockCsv(text: string): CsvReadResult {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], fileProblems: ['The file is empty.'] };

  const headerCells = table[0]!;
  const columns = new Map<keyof OpeningStockRow | 'costRupees', number>();
  headerCells.forEach((header, index) => {
    const field = ALIASES[key(header)];
    if (field && !columns.has(field)) columns.set(field, index);
  });
  const missing = REQUIRED.filter(item => !columns.has(item.field)).map(item => item.label);
  if (missing.length) return { rows: [], fileProblems: [`The first line must name these columns: ${missing.join(', ')}.`] };
  if (table.length === 1) return { rows: [], fileProblems: ['The file has a header line but no cars.'] };

  const cell = (cells: string[], field: keyof OpeningStockRow | 'costRupees') => {
    const index = columns.get(field);
    return index === undefined ? '' : (cells[index] ?? '').trim();
  };

  const rows = table.slice(1).map((cells, offset) => {
    const line = offset + 2;
    const year = Number(cell(cells, 'manufacturingYear'));
    const km = Number(cell(cells, 'odometerKm').replace(/[,\s]/g, ''));
    const cost = rupeesToPaise(cell(cells, 'costRupees'));
    if (!cost) return { line, item: null, problem: 'The cost is not an amount (for example 850000).' };
    if (!Number.isFinite(year) || cell(cells, 'manufacturingYear') === '') return { line, item: null, problem: 'The year is not a number.' };
    if (!Number.isFinite(km) || cell(cells, 'odometerKm') === '') return { line, item: null, problem: 'The odometer reading is not a number.' };
    const documents = cell(cells, 'documentsOnFile').split(/[;|]/).map(value => value.trim().toUpperCase().replace(/\s+/g, '_')).filter(Boolean);
    const item: OpeningStockRow = {
      registrationNumber: cell(cells, 'registrationNumber'),
      make: cell(cells, 'make'),
      model: cell(cells, 'model'),
      manufacturingYear: year,
      fuelType: cell(cells, 'fuelType'),
      transmission: cell(cells, 'transmission'),
      odometerKm: km,
      acquisitionCostPaise: cost,
      ...(cell(cells, 'variant') ? { variant: cell(cells, 'variant') } : {}),
      ...(cell(cells, 'physicalLocation') ? { physicalLocation: cell(cells, 'physicalLocation') } : {}),
      ...(cell(cells, 'notes') ? { notes: cell(cells, 'notes') } : {}),
      ...(documents.length ? { documentsOnFile: documents } : {}),
    };
    return { line, item };
  });
  return { rows, fileProblems: [] };
}

export const OPENING_STOCK_CSV_TEMPLATE = [
  'registrationNumber,make,model,variant,manufacturingYear,fuelType,transmission,odometerKm,acquisitionCostRupees,physicalLocation,notes,documentsOnFile',
  'KA01AB1234,Hyundai,Creta,SX,2020,PETROL,MANUAL,42000,850000,Yard bay 3,Single owner,RC;INSURANCE',
  'KA05MN4321,Maruti Suzuki,Swift,VXI,2019,PETROL,AUTOMATIC,38000,520000,,,RC',
].join('\n');
