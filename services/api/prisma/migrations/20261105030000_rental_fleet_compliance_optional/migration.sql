-- Rental fleet compliance details become optional.
-- VIN, commercial permit, insurance policy and fitness certificate (numbers and expiry dates) may be left blank when a car
-- is onboarded and added later. NULL means "not on file"; the application never invents a value for them.
-- Relaxing NOT NULL is additive and safe for existing rows. The unique index on "vin" stays: PostgreSQL allows many NULLs.
ALTER TABLE "RentalFleetVehicle" ALTER COLUMN "vin" DROP NOT NULL;
ALTER TABLE "RentalFleetVehicle" ALTER COLUMN "commercialPermitNumber" DROP NOT NULL;
ALTER TABLE "RentalFleetVehicle" ALTER COLUMN "commercialPermitExpiry" DROP NOT NULL;
ALTER TABLE "RentalFleetVehicle" ALTER COLUMN "insurancePolicyNumber" DROP NOT NULL;
ALTER TABLE "RentalFleetVehicle" ALTER COLUMN "insuranceExpiry" DROP NOT NULL;
ALTER TABLE "RentalFleetVehicle" ALTER COLUMN "fitnessCertExpiry" DROP NOT NULL;
