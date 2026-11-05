// One-off clean-up: rewrite existing make / model values to the master-data spelling ("maruti" -> "Maruti Suzuki"), so old
// stock, leads, fleet and customer vehicles filter and search together with new entries.
//
//   npm run db:normalize-names            dry run (default): lists what WOULD change, writes nothing
//   npm run db:normalize-names -- --apply  performs the updates
//
// Only values that match the catalogue are rewritten. Anything not in the catalogue (a typed-in brand) is left untouched.
// Each update targets one exact (make, model) pair, so it is safe to re-run; a second run finds nothing to do.
import { PrismaClient } from '@prisma/client';
import { canonicalizeMakeModel, type MasterNameItem } from '../src/vehicle-names.js';

const apply = process.argv.includes('--apply');
const db = new PrismaClient();

const TABLES = ['acquisitionLead', 'customerVehicle', 'rentalFleetVehicle', 'vehicle', 'vehicleStockUnit', 'vehicleMarketObservation'] as const;

async function main() {
  const items = (await db.masterDataItem.findMany({
    where: { active: true, category: { in: ['MAKE', 'MODEL'] } },
    select: { category: true, code: true, name: true, parentCode: true, metadata: true },
  })) as MasterNameItem[];
  if (!items.some(item => item.category === 'MAKE')) {
    console.log('No MAKE rows in master data; nothing to normalise against. Aborting.');
    return;
  }
  console.log(apply ? 'APPLYING changes' : 'DRY RUN (add --apply to write)');
  let totalRows = 0;
  for (const table of TABLES) {
    const delegate = (db as any)[table];
    const pairs: Array<{ make: string; model: string; _count: { _all: number } }> = await delegate.groupBy({ by: ['make', 'model'], _count: { _all: true } });
    for (const pair of pairs) {
      const next = canonicalizeMakeModel(items, pair.make ?? '', pair.model ?? '');
      if (next.make === pair.make && next.model === pair.model) continue;
      totalRows += pair._count._all;
      console.log(`${table}: "${pair.make}" / "${pair.model}"  ->  "${next.make}" / "${next.model}"  (${pair._count._all} rows)`);
      if (apply) await delegate.updateMany({ where: { make: pair.make, model: pair.model }, data: { make: next.make, model: next.model } });
    }
  }
  console.log(`${apply ? 'Updated' : 'Would update'} ${totalRows} rows.`);
}

main().finally(() => db.$disconnect());
