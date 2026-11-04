# Master data: Admin portal to customer app, made dynamic

Status: implemented; API 244 tests pass, mobile 37 tests pass, API/mobile/Admin typechecks clean. Not run against a real database or device. Migration `20261105010000_master_data_alignment` must be deployed first.

## What was broken
- The Admin portal wrote `CAR_MAKE` / `CAR_BODY_TYPE` / `TRANSMISSION_TYPE`; the seed and app read `MAKE` / `BODY_TYPE` / `TRANSMISSION`. Anything an administrator added never reached customers. There was no way to create models.
- Only Explore read master data, and it merged it with inventory and a hardcoded brand list, so removing a make in Admin changed nothing. Sell, My Garage (and others) used their own hardcoded copies.

## What changed
1. **One category definition** (`services/api/src/master-data-rules.ts`): MAKE, MODEL (under a make), VARIANT (under a model), BODY_TYPE, FUEL_TYPE, TRANSMISSION, COLOR, OWNERSHIP_TYPE, DOCUMENT_TYPE. Legacy names (`CAR_MAKE`...) are mapped. Creating an item validates the category, requires a parent for models/variants (which must exist and be active) and rejects duplicates.
2. **Migration** renames existing wrongly-named rows (where no canonical row exists) and loads the standard catalogue (287 rows: 27 makes, 223 models, colours, fuel, transmission, ownership, body types, documents) with `ON CONFLICT DO NOTHING`. The seed (`master-data-seed.ts`) was generated from the app's old built-in catalogue; re-running `ensureMasterDataCatalog` no longer overwrites administrator edits.
3. **Public `GET /master-data`** returns only active items whose whole parent chain is active (deactivating a make hides its models/variants), with an ETag and a 60 s cache header.
4. **Admin portal > Master data**: canonical category list, parent picker (make for a model, model for a variant), no more free-text parent codes.
5. **Customer app**: `services/master-data.ts` loads the data once, caches it on the device (10 minute refresh, last good copy offline), and `useCatalog()` feeds the lists. The bundled `car-catalog` is now only a first-run/offline fallback; once the API returns data for a category it is the only source. Sell (makes, models, fuel, transmission), My Garage (makes, models, fuel, transmission, ownership) and Explore (brand list) use it; Sell's duplicate catalogue (about 100 lines) was removed.

## Where it still is not connected (next)
- Rental search chips (rental fuel codes use `EV`, master data uses `ELECTRIC`; needs a code mapping), Service add-vehicle, Inspector forms (document types), website filters, Sales/Operations portal dropdowns.
- Server-side validation that submitted makes/models exist in master data ("needs review" flag), a CSV bulk import, a variants seed, and a rename action in Admin.
- Cities come from the separate supported-cities table; `ServiceHomeScreen` still falls back to a literal 'Bengaluru'.
