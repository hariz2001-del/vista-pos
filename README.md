# Vista Cashier POS

Touch-first React + Vite PWA for Vista's cashless Food + Drinks counter. Interface language is
English throughout.

**Status: connected to `api-vista`.** Sign-in, the menu (`/bootstrap`), shift open and close
(PIN checked on the server), checkout, corrections and the offline flush all go over HTTP to the
real API. Set `VITE_DEMO=1` to run with no server at all against the in-browser stand-in.

## Screens

1. **Sign in** — done once by the owner with the business's one account. The counter then stays
   signed in; there is no sign-out on the tablet. Only the RMS can sign it out.
2. **Shift open** — 4-digit PIN, resolves the business date
3. **Register** — image-card catalogue, brand and category filters, search, sold-out states
4. **Modifier** — a popup confined to the catalogue column, enforcing required groups and min/max
5. **Discount** — item and order level, no PIN
6. **This shift's sales** — cancel or edit/exchange through linked contra-entries
7. **Shift close** — PIN only, no bank figure; blocked while offline sales or corrections are unsynced

The register never blacks out. Everything from keying in to payment happens in the right-hand
order panel, which moves through three states:

| State | What it shows |
|---|---|
| **Building** | Editable ticket — quantities, discounts, Confirm Order |
| **Confirmed** | Locked receipt view, amount due dominant, Mark Paid or Edit Order |
| **Paid** | The panel blurs behind a checkmark, the queue number, and New Order |

The queue number lives in that last state deliberately: nothing is printed and the kitchen is
told the number out loud, so it has to appear somewhere the cashier can read it.

**PIN is only for opening and closing a shift.** Nothing else is gated by it.

## What it does

- **Brands are data.** A `brands` table drives filters, chips and colours. Nothing is hardcoded.
- **Integer sen throughout.** No floating point touches money at any point.
- **Discounts attribute to a brand.** Line discounts belong to their line's brand; an order-wide
  discount is apportioned by each brand's remaining value using largest-remainder, so the parts
  sum to the whole exactly and no brand can be pushed negative.
- **Offline-first.** The counter keeps selling with no network. Sales are written to IndexedDB
  with a device-minted `client_txn_id`, shown as `#OFF-01`, and flushed in order when
  connectivity returns. The original offline label is retained after syncing so the number the
  kitchen was told can still be traced.
- **Immutable after payment.** The original paid sale is never edited or deleted. A cashier can
  cancel or amend it at the counter, but that writes a separate, idempotent contra-entry with a
  reason and per-brand attribution. Once payment has been attempted the live ticket also locks,
  so a retry cannot quietly become a different order.
- **A paid sale is never left unrecorded.** If the server does not answer, or answers that the
  price has moved since this tablet loaded its menu, the sale is kept on the device at the price
  charged and flushed on its original key — the replay cannot double-charge. Only a refusal that
  retrying cannot fix stops the cashier.

## Deliberately not built

Cash payments, DuitNow QR rendering of any kind, ESC/POS printing, a customer-facing display,
a second terminal, recipes/COGS/inventory, and an idle lock. Opening a shift needs the server —
it is the server that issues the shift — but selling within an open shift does not.

## Demo credentials

| Field | Value |
|---|---|
| Email | `demo@vistahub.my` |
| Password | `vista` |
| Counter PIN | `1234` |

This is the business's one account, created by `api-vista`'s seed (`npm run seed`). The same
email and password sign in to the owner RMS; the PIN is the counter PIN. Signing in here gives a
**counter session**: it never expires and can sell, correct and run shifts, but it cannot open
the owner's books. The partners (Hariz, Iman) are names in RMS Settings, not logins. The menu
comes from the database, so modifier ids are real and the server can reprice them.

[`src/data/fake-account/`](src/data/fake-account/) is used only in demo mode (`VITE_DEMO=1`).
Malay dish names are kept because that is what the stall actually calls them; everything around
them is English.

## Simulating a network drop

In development the top bar carries a **plug icon** that forces offline mode, so the whole queue
and sync path can be driven without unplugging anything.

## Commands

```bash
npm install
npm run dev     # talks to api-vista on http://127.0.0.1:3000 — start that first
npm run check   # oxlint + vitest + tsc -b + vite build
```

To point at a different API, set `VITE_API_BASE_URL` (see `.env.example`). To run with no server,
set `VITE_DEMO=1`.

TypeScript runs in `strict` mode. `npm run check` must be clean before anything ships.
