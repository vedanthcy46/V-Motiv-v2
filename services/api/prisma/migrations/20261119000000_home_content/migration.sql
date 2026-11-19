-- Home-screen content managed by the Operations team: promotional banners, and photos and videos of the hubs (additive).

-- CreateEnum
CREATE TYPE "HomeContentKind" AS ENUM ('BANNER', 'HUB_PHOTO', 'HUB_VIDEO');

-- CreateEnum
CREATE TYPE "HomeContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "HomeContent" (
    "id" UUID NOT NULL,
    "kind" "HomeContentKind" NOT NULL,
    "status" "HomeContentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "subtitle" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "actionType" TEXT NOT NULL DEFAULT 'NONE',
    "actionTarget" TEXT,
    "ctaLabel" TEXT,
    "city" TEXT,
    "hubName" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "updatedById" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeContent_status_kind_sortOrder_idx" ON "HomeContent"("status", "kind", "sortOrder");

