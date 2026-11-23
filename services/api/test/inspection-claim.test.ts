import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSPECTION_POINT, INSPECTION_POINTS } from '../src/inspection-claim.js';

// Every screen, email and seed that says "N-point inspection" must say the same N. The number lives in three small files (one per app); this
// test checks they agree and that no source file spells out a different count by hand.

const REPO = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', 'build', '.expo', 'android', 'ios', 'coverage'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

describe('the inspection point count', () => {
  it('is the same in the app, the website and the API', () => {
    const mobile = /INSPECTION_POINTS\s*=\s*(\d+)/.exec(read('apps/customer-mobile/src/constants/inspection.ts'));
    const web = /INSPECTION_POINTS\s*=\s*(\d+)/.exec(read('apps/customer-web/src/inspection.ts'));
    expect(Number(mobile?.[1])).toBe(INSPECTION_POINTS);
    expect(Number(web?.[1])).toBe(INSPECTION_POINTS);
    expect(INSPECTION_POINT).toBe(`${INSPECTION_POINTS}-point`);
  });

  it('is not spelled out differently anywhere in the code, emails or seed data', () => {
    // "180-point", "150-Pt", "200 point" ... Service checklists (the workshop's own "40-Point" health check) are a different thing and are skipped.
    const claim = /\b(\d{2,3})[- ]?(point|pt)\b/gi;
    const roots = ['apps/customer-mobile/src', 'apps/customer-web/src', 'services/api/src', 'services/api/prisma/seed.ts'].map(p => join(REPO, p));
    const files = roots.flatMap(p => (statSync(p).isDirectory() ? sourceFiles(p) : [p]));
    const skip = (file: string) => /service-store\.ts$|ServiceOperationsPanel\.tsx$/.test(file);

    const wrong: string[] = [];
    for (const file of files) {
      if (skip(file)) continue;
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
        for (const match of line.matchAll(claim)) {
          if (Number(match[1]) !== INSPECTION_POINTS) wrong.push(`${relative(REPO, file)}:${index + 1}  ${match[0]}`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });

  it('is used by the places that show it, rather than a typed-in number', () => {
    for (const [file, name] of [
      ['apps/customer-mobile/src/components/VehicleCard.tsx', 'INSPECTION_POINTS'],
      ['apps/customer-mobile/src/components/AppSidebar.tsx', 'INSPECTION_POINT'],
      ['apps/customer-mobile/src/screens/InspectionHighlightsScreen.tsx', 'INSPECTION_POINTS'],
      ['apps/customer-web/src/components/Hero.tsx', 'INSPECTION_POINTS'],
      ['services/api/src/email-templates.ts', 'INSPECTION_POINT'],
      ['services/api/src/customer-store.ts', 'INSPECTION_POINTS'],
    ] as const) {
      expect(read(file), file).toContain(name);
    }
  });
});
