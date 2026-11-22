-- The permission that guards platform announcements, and the roles that hold it by default (Super Admin, Administrator, Operations
-- Manager). Roles in an existing database are only changed by the seed script, so without this the new permission would not exist
-- there and every announcement request would be refused with PERMISSION_DENIED. Safe to run twice; it touches nothing else.
INSERT INTO "Permission" ("id", "key", "description")
VALUES (gen_random_uuid(), 'announcement.manage', 'Create, test, schedule, send and cancel platform announcements to customers who opted in to promotions, and switch announcements on or off.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE p."key" = 'announcement.manage' AND r."key"::text IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER')
ON CONFLICT DO NOTHING;
