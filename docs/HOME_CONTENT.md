# App Home content (banners and hub photos and videos)

The customer app's Home screen shows promotional banners and photos and videos of the hubs. The Operations team manages them; nothing about them is
hard-coded in the app.

## For Operations

Operations portal, **App home content**. Three tabs: **Banners**, **Hub photos**, **Hub videos**.

- **Add**: choose the image or video (it uploads straight to our media account), fill in the optional text, choose what a tap does, optionally
  set a city, a start and an end, then **Save as draft** or **Save and publish**.
- **Nothing shows to customers until it is published**, and then only between its start and end dates (if set) and in its city (if set; no city
  means everywhere). A section with nothing live is hidden from Home.
- **Order**: the up and down arrows change the order customers see. **Unpublish** takes an item off Home; **Delete** removes a draft for good.
- **What a tap does**: nothing, open an app screen (Service, Buy, Sell, Rent, Scrap, My Garage, Support), open a particular car (its listing id),
  or open a web link (https only).
- **Sizes**: banners 1200 x 600 (2:1), up to 8 MB (JPG, PNG, WebP). Videos up to 20 MB (MP4, MOV, WebM), 10 to 20 seconds is best: they play by themselves on customers' phones, muted, so they must be small and make sense without sound. Home shows at
  most 8 banners, 12 hub photos and 6 hub videos. Banners run the full width of the screen (2:1). Hub videos and photos are centred cards (16:9) with a margin at each side. All three swipe by
  hand with position dots, and banners and photos also slide by themselves.
- **Who**: Operations managers, administrators and super administrators, or any employee given the permission `content.home.manage` by name.

## How it works

| Piece | Where |
|---|---|
| Table `HomeContent` (kind, status DRAFT/PUBLISHED/ARCHIVED, media, text, button, city, dates, order) | `services/api/prisma/schema.prisma`, migration `20261119000000_home_content` |
| Public read: `GET /api/v2/home/content?city=` (cached 60 s, ETag, rate limited, empty before the migration is applied) | `services/api/src/home-content.ts` |
| Management: `/api/v2/operations/home-content` (list, create, edit, publish, unpublish, archive, move, delete, upload signature) | same file, mounted in `app.ts` ahead of the generic operations router |
| Direct upload: the server hands the portal a one-time Cloudinary signature (the secret never leaves the server) so videos do not pass through the API | `signDirectUpload` in `cloudinary.ts` |
| Safety checks: media must be https from our own Cloudinary account; buttons must name a real screen, a listing id or an https link; a published video needs a title; every change is written to the audit log | `home-content.ts` |
| Operations page | `apps/operations-portal/src/components/HomeContentManager.tsx`, rules in `homeContent.ts` |
| App | `HomeScreen.tsx` (quick-action row, banners, hub media, recent cars), `HomeBanners.tsx`, `HubMedia.tsx`, rules in `services/home-content.ts`, saved copy in `services/home-content-api.ts` |

In the app the saved copy appears immediately and is replaced by the live content. Offline, the last copy is shown for up to three days, and items
whose dates have passed are dropped. Everything received is re-checked before it is shown: a bad or unsafe item is dropped, and a button that could
not work is turned off.

## Removed from Home

The repeated blocks: the "What would you like to do?" heading, the large Service, Buy and Sell cards and the "More services" tiles (replaced by one
row of five quick actions), "My Requests" (it is the Activity tab), "Selling, one step at a time" and "Get help with your request" (in the menu).

## Needs doing once

1. Apply the migration (`npm run db:deploy` in `services/api`). Until then Home simply has no banners or hub media.
2. Cloudinary must be configured on the API (it already is for photo uploads). In the Cloudinary console, allow browser uploads: the portal
   uploads with a signed request, so no upload preset is needed. If the portal's address is blocked by the Cloudinary account's allowed-origins
   setting, add it.
3. Redeploy the API and the operations portal; rebuild the app.

## Not done, and not verified

- **Inline video needs one install.** Hub videos play inside their card (muted, looping, no controls of any kind: no play mark, no pause, nothing
  to tap, and only the one in view plays) when the app is built with `expo-video`: run `npx expo install expo-video` in `apps/customer-mobile`,
  commit the changed `package.json` and lockfile, and make a new app build. In a build without it a video card just shows its cover image.
- Not run on a phone, and not tested against a real Cloudinary account: uploads, the generated video cover and the signature were checked by tests
  and a stand-in only. The Operations page was exercised in a browser against an in-memory stand-in for the API.
- No view or tap counts yet, and no two-person approval before publishing.
