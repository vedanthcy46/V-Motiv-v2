# V MOTIV V2 — Notification Database Models & REST API Specifications

## 1. Database Schema Models

```prisma
model Notification {
  id          String               @id @default(uuid()) @db.Uuid
  userId      String               @db.Uuid
  user        User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  eventType   String
  category    String               @default("GENERAL")
  priority    NotificationPriority @default(NORMAL)
  title       String
  body        String
  entityType  String?
  entityId    String?
  deepLink    String?
  targetApp   String?
  read        Boolean              @default(false)
  readAt      DateTime?
  metadata    Json?
  deliveries  NotificationDelivery[]
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
}

model NotificationPreference {
  id                     String    @id @default(uuid()) @db.Uuid
  userId                 String    @unique @db.Uuid
  user                   User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  emailEnabled           Boolean   @default(true)
  pushEnabled            Boolean   @default(true)
  inAppEnabled           Boolean   @default(true)
  inspectionAlerts       Boolean   @default(true)
  offerAlerts            Boolean   @default(true)
  orderAlerts            Boolean   @default(true)
  operationalEscalations Boolean   @default(true)
  marketingEnabled       Boolean   @default(false)
  quietHoursEnabled      Boolean   @default(false)
  quietHoursStart        String?   @default("22:00")
  quietHoursEnd          String?   @default("08:00")
  createdAt              DateTime  @default(now())
}

model PushDevice {
  id             String       @id @default(uuid()) @db.Uuid
  userId         String       @db.Uuid
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  app            String
  token          String
  platform       String
  installationId String?
  projectId      String?
  environment    String       @default("production")
  active         Boolean      @default(true)
  lastSeenAt     DateTime     @default(now())
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  tickets        PushTicket[]

  @@unique([userId, token, app])
}

model PushTicket {
  id             String            @id @default(uuid()) @db.Uuid
  deviceId       String            @db.Uuid
  device         PushDevice        @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  notificationId String?           @db.Uuid
  title          String?
  body           String?
  data           Json?
  ticketId       String?
  status         PushDeliveryState @default(QUEUED)
  receiptStatus  String?
  receiptMessage String?
  receiptDetails Json?
  attempts       Int               @default(0)
  lastAttemptAt  DateTime?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
}
```

---

## 2. REST API Endpoints

### In-App Inbox
- `GET /api/v2/notifications`: Query paginated notifications (`page`, `limit`, `unreadOnly`, `category`).
- `GET /api/v2/notifications/unread-count`: Fetch total unread notifications count for badge display.
- `PATCH /api/v2/notifications/:id/read`: Mark single notification as read.
- `POST /api/v2/notifications/read-all`: Mark all notifications as read for current user.

### Device Management
- `POST /api/v2/push-devices`: Register device token `{ token, app: 'CUSTOMER' | 'INSPECTOR', platform: 'ANDROID' | 'IOS' | 'WEB' }`.
- `DELETE /api/v2/push-devices`: Unregister device token on logout `{ token }`.

### User Preferences
- `GET /api/v2/notification-preferences`: Get current channel & quiet hours preferences.
- `PATCH /api/v2/notification-preferences`: Update preferences.

### Webhook
- `POST /api/v2/webhooks/resend`: Ingest Resend delivery status events.
