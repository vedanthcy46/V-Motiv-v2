import { describe, expect, it } from 'vitest';
import { OPENING_STOCK_CSV_TEMPLATE, parseCsv, readOpeningStockCsv, rupeesToPaise } from './openingStockCsv';

describe('parseCsv', () => {
  it('reads plain rows, quoted cells with commas and quotes, CRLF line endings and a byte-order mark', () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([['a', 'b', 'c'], ['1', 'x, y', 'say "hi"']]);
  });

  it('keeps a line break inside quotes and skips blank lines', () => {
    expect(parseCsv('a,b\n"line one\nline two",2\n\n,\n')).toEqual([['a', 'b'], ['line one\nline two', '2']]);
  });
});

describe('rupeesToPaise', () => {
  it('turns amounts people actually type into paise', () => {
    expect(rupeesToPaise('850000')).toBe('85000000');
    expect(rupeesToPaise('₹8,50,000')).toBe('85000000');
    expect(rupeesToPaise('Rs. 1,200.5')).toBe('120050');
    expect(rupeesToPaise('99.99')).toBe('9999');
  });

  it('refuses anything that is not an amount', () => {
    for (const bad of ['', 'abc', '12.345', '-5', '1e6', '8 lakh']) expect(rupeesToPaise(bad)).toBeNull();
  });
});

describe('readOpeningStockCsv', () => {
  it('reads the template exactly as given', () => {
    const result = readOpeningStockCsv(OPENING_STOCK_CSV_TEMPLATE);
    expect(result.fileProblems).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      line: 2,
      item: {
        registrationNumber: 'KA01AB1234', make: 'Hyundai', model: 'Creta', variant: 'SX', manufacturingYear: 2020, fuelType: 'PETROL',
        transmission: 'MANUAL', odometerKm: 42000, acquisitionCostPaise: '85000000', physicalLocation: 'Yard bay 3', notes: 'Single owner', documentsOnFile: ['RC', 'INSURANCE'],
      },
    });
    expect(result.rows[1]!.item).not.toHaveProperty('notes'); // empty optional cells are left out, not sent as blanks
  });

  it("understands a hub's own column names, in any order and case", () => {
    const text = 'Plate Number,Brand,Model,Year,Fuel,Gearbox,Kms Driven,Purchase Price,Remarks\nka 01 ab 1234,Tata,Nexon,2021,Diesel,Manual,"31,500","₹7,25,000",ok';
    const [row] = readOpeningStockCsv(text).rows;
    expect(row!.item).toMatchObject({ registrationNumber: 'ka 01 ab 1234', make: 'Tata', manufacturingYear: 2021, odometerKm: 31500, acquisitionCostPaise: '72500000', notes: 'ok' });
  });

  it('names the columns that are missing instead of guessing', () => {
    const result = readOpeningStockCsv('registrationNumber,make\nKA01AB1234,Tata');
    expect(result.rows).toEqual([]);
    expect(result.fileProblems[0]).toMatch(/model.*manufacturingYear.*fuelType.*transmission.*odometerKm.*acquisitionCostRupees/);
  });

  it('reports a row it cannot read against its own line and keeps the rest', () => {
    const text = [
      'registrationNumber,make,model,manufacturingYear,fuelType,transmission,odometerKm,acquisitionCostRupees',
      'KA01AB1111,Tata,Nexon,2021,PETROL,MANUAL,30000,700000',
      'KA01AB2222,Tata,Nexon,2021,PETROL,MANUAL,30000,eight lakh',
      'KA01AB3333,Tata,Nexon,twenty,PETROL,MANUAL,30000,700000',
    ].join('\n');
    const { rows } = readOpeningStockCsv(text);
    expect(rows.map(row => [row.line, row.item ? 'ok' : row.problem])).toEqual([
      [2, 'ok'],
      [3, 'The cost is not an amount (for example 850000).'],
      [4, 'The year is not a number.'],
    ]);
  });

  it('says so when the file is empty or has no cars', () => {
    expect(readOpeningStockCsv('').fileProblems).toEqual(['The file is empty.']);
    expect(readOpeningStockCsv('registrationNumber,make,model,manufacturingYear,fuelType,transmission,odometerKm,acquisitionCostRupees').fileProblems).toEqual(['The file has a header line but no cars.']);
  });
});
