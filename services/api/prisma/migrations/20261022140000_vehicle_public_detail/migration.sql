ALTER TABLE "Vehicle"
  ADD COLUMN "inspectionSummary" TEXT,
  ADD COLUMN "inspectionReportUrl" TEXT,
  ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "verifiedTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
