import type { CompletedSale, SaleCorrection } from '../domain/types'

/**
 * Local durable store for sales, so the counter keeps selling when the network
 * drops. Every sale lands here first; the sync worker promotes PENDING rows to
 * SYNCED once the server has accepted them.
 *
 * IndexedDB rather than localStorage: these are financial records that must
 * survive a reload, and localStorage is synchronous, string-only, and small.
 */

const DB_NAME = 'vista-pos'
// v2 added the corrections store. A counter correction is a financial record in
// its own right, so it is durable on the device before the cashier is told it
// worked, exactly like a sale.
const DB_VERSION = 2
const STORE = 'sales'
const CORRECTIONS = 'corrections'

let dbPromise: Promise<IDBDatabase> | null = null

/** Opened lazily so that merely importing this module does not touch IndexedDB. */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientTxnId' })
        store.createIndex('businessDate', 'businessDate')
        store.createIndex('syncStatus', 'syncStatus')
      }
      if (!db.objectStoreNames.contains(CORRECTIONS)) {
        const store = db.createObjectStore(CORRECTIONS, { keyPath: 'clientTxnId' })
        store.createIndex('originalClientTxnId', 'originalClientTxnId')
        store.createIndex('syncStatus', 'syncStatus')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
  })

  return dbPromise
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const request = operation(transaction.objectStore(storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
      }),
  )
}

export function saveSale(sale: CompletedSale): Promise<IDBValidKey> {
  return runTransaction('readwrite', (store) => store.put(sale))
}

async function allSales(): Promise<CompletedSale[]> {
  const rows = await runTransaction<CompletedSale[]>('readonly', (store) => store.getAll())
  return rows
}

/**
 * Sales belonging to one shift, newest first.
 *
 * Scoped to the shift rather than the business date on purpose: two shifts can
 * share a business date, and closing the second one must not re-count the
 * first one's takings.
 */
export async function listSalesForShift(shiftId: string): Promise<CompletedSale[]> {
  const rows = await allSales()
  return rows
    .filter((sale) => sale.request.shift_id === shiftId)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}

/** Unsynced sales in the order they were rung up. Replay must be chronological. */
export async function listPendingSales(): Promise<CompletedSale[]> {
  const rows = await allSales()
  return rows
    .filter((sale) => sale.syncStatus === 'PENDING')
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
}

export async function countPendingSales(): Promise<number> {
  const pending = await listPendingSales()
  return pending.length
}

/**
 * Next `#OFF-NN` label for the day. Derived from the highest offline label ever
 * issued on this business date rather than from the pending count, so a label is
 * never reused after earlier offline sales have synced.
 */
export async function nextOfflineLabel(businessDate: string): Promise<string> {
  const rows = await allSales()
  let highest = 0

  for (const sale of rows) {
    if (sale.businessDate !== businessDate || !sale.offlineLabel) continue
    const parsed = Number(sale.offlineLabel.replace(/^#OFF-/, ''))
    if (Number.isSafeInteger(parsed) && parsed > highest) highest = parsed
  }

  return `#OFF-${(highest + 1).toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

export function saveCorrection(correction: SaleCorrection): Promise<IDBValidKey> {
  return runTransaction('readwrite', (store) => store.put(correction), CORRECTIONS)
}

async function allCorrections(): Promise<SaleCorrection[]> {
  return runTransaction<SaleCorrection[]>('readonly', (store) => store.getAll(), CORRECTIONS)
}

/** Corrections against one shift's sales, oldest first — the order they happened. */
export async function listCorrectionsForShift(shiftId: string): Promise<SaleCorrection[]> {
  const rows = await allCorrections()
  return rows
    .filter((correction) => correction.shiftId === shiftId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Unsynced corrections in the order they were made. Replay must be chronological. */
export async function listPendingCorrections(): Promise<SaleCorrection[]> {
  const rows = await allCorrections()
  return rows
    .filter((correction) => correction.syncStatus === 'PENDING')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Everything the device is still holding: sales and corrections alike.
 *
 * A shift close is refused while this is non-zero, so a correction cannot be
 * stranded on the tablet any more easily than a sale can.
 */
export async function countPendingRecords(): Promise<number> {
  const [sales, corrections] = await Promise.all([listPendingSales(), listPendingCorrections()])
  return sales.length + corrections.length
}

/** Test and demo affordance: wipe the local store. */
export async function clearAllSales(): Promise<void> {
  await runTransaction('readwrite', (store) => store.clear())
  await runTransaction('readwrite', (store) => store.clear(), CORRECTIONS)
}
