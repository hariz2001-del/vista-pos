# Vista Cashier POS

Touch-first React + Vite PWA for Vista's cashless Food + Drinks counter. Interface language is
English throughout.

**Status: UI round.** The app still runs against an in-browser fake account and simulated server
so it can be reviewed without infrastructure. The production money-path backend now exists in
`api-vista/`; its checkout and correction payload adapters are covered here, but authentication,
bootstrap, and live HTTP transport are not wired into this demo yet.

## Screens

1. **Sign in** — one account, shared with the future Owner RMS
2. **Shift open** — 4-digit PIN, resolves the business date
3. **Register** — image-card catalogue, brand and category filters, search, sold-out states
4. **Modifier** — a popup confined to the catalogue column, enforcing required groups and min/max
5. **Discount** — item and order level, no PIN
6. **This shift's sales** — cancel or edit/exchange through linked contra-entries
7. **Shift close** — QR reconciliation, blocked while offline sales or corrections are unsynced

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

## Deliberately not built

Cash payments, DuitNow QR rendering of any kind, ESC/POS printing, a customer-facing display,
a second terminal, recipes/COGS/inventory, live API transport, and an idle lock.

## Demo credentials

| Field | Value |
|---|---|
| Email | `demo@vistahub.my` |
| Password | `vista` |
| Counter PIN | `1234` |

The seeded account lives in [`src/data/fake-account/`](src/data/fake-account/) — two brands, seven
categories, fourteen products, two sold out, roughly half carrying modifier groups. It is shaped
like the bootstrap payload the real API will return, so swapping it for `fetch` later is
mechanical. Malay dish names are kept because that is what the stall actually calls them;
everything around them is English.

## Simulating a network drop

In development the top bar carries a **plug icon** that forces offline mode, so the whole queue
and sync path can be driven without unplugging anything.

## Commands

```bash
npm install
npm run dev
npm run check   # oxlint + vitest + tsc -b + vite build
```

TypeScript runs in `strict` mode. `npm run check` must be clean before anything ships.
