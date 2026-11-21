# Scrap a car (simple version)

A customer asks, our sales team is notified and phones them, and everything after that is handled offline. Nothing is tracked, priced or
verified in the system. An earlier, much larger design (state machine, partners, quotes, offers, pickups, custody, certificates, payments, about
twenty tables) was removed because it digitised work that is done by phone.

## What exists

- **App** (`ScrapRequestScreen`): one form (registration, make, model, year, optional fuel, kilometres and notes, city, optional address, mobile
  number to call). Reached from Home, the side menu and "Scrap" on a My Garage car (which pre-fills the form). Sign-in is required. After sending
  it says the team will phone, and shows a reference number. It shows no price and promises no outcome. Rules are in `services/scrap-request.ts`.
- **API** (`services/api/src/scrap-requests.ts`): `POST /customer/scrap/requests` saves one `ScrapRequest` row and notifies staff;
  `GET /customer/scrap/requests` lists the customer's own. A retry with the same `submissionKey` returns the same request. A second open request for
  the same vehicle is refused with the existing reference. A failed notification never loses the request.
- **Notification**: every active Sales Executive and Sales Manager gets an in-app alert, a push and an email (the platform's existing notification
  service, event `SCRAP_REQUEST_SUBMITTED`) containing the customer's name, number, vehicle and city.
- **Sales portal** ("Scrap-a-car requests", with a count badge and a bell alert): the list with phone number, vehicle, condition notes and
  address; a note box; "Mark contacted", "Close" and "Reopen". API: `GET /sales/scrap-requests`, `PATCH /sales/scrap-requests/:id`. Every sales
  person sees every request; the first to change one is recorded as handling it, and changes are written to the audit log.
- **Database**: one table, `ScrapRequest` (status NEW, CONTACTED, CLOSED). Migration `20261116020000_scrap_request_simple`.

## Deliberately not here

Prices or estimates, documents or photos, inspection, facility or partner records, offers, pickup scheduling, certificates, registration
tracking, payments, a website journey (the website still only explains the platform and points to the app).

## Deploying

1. Apply the migration (`npm run db:deploy` in `services/api`). It first drops the tables and types of the removed design **if they exist**
   (`DROP ... IF EXISTS`), so if the earlier migration was ever applied to a database, any rows in those tables are deleted. They were never used by a
   released app, but check before running it on production. It then creates `ScrapRequest`.
2. Redeploy the API and the sales portal; rebuild the app.
3. Nothing to sync: no new permission keys. If `npm run sync:scrap-permissions` was ever run, harmless `scrap.*` permission rows remain and can be
   deleted from the admin permissions list.

## Not verified

Not run on a device or in a browser, not run against a real database (the migration SQL matches what Prisma generates for the model, but was not
executed), and push/email delivery to staff depends on the existing notification setup. The API logic and the form rules are unit tested.
