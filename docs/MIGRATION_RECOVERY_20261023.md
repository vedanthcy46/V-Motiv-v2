# Neon migration recovery, 23 October 2026

The initial deployment failed in `20261022140457_acquisition_offers_and_inspection` because it attempted to remove a default from `TestDriveRequest.serviceCity` before `20261022150000_test_drive_location` creates that column.

Removed that premature column alteration. Existing completed migrations must not be reset. On the configured Neon database, inspection confirmed the failed migration left no inspection columns or offer enum/table. It was marked rolled back with Prisma, then `prisma migrate deploy` successfully applied all remaining migrations. No application records were removed.

The historical migration has a corrected checksum in this repository. Previously initialized local databases may retain the original checksum; do not use `migrate reset` to address that history difference. New deployments now apply the migrations in their actual dependency order.
