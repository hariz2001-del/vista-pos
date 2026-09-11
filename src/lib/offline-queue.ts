import type { CompletedSale } from '../domain/types'

/**
 * Local durable store for sales, so the counter keeps selling when the network
 * drops. Every sale lands here first; the sync worker promotes PENDING rows to
 * SYNCED once the server has accepted them.
 *
 * IndexedDB rather than localStorage: these are financial records that must
 * survive a reload, and localStorage is synchronous, string-only, and small.
 */

const DB_NAME = 'vista-pos'
const DB_VERSION = 1
const STORE = 'sales'

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
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
  })

  return dbPromise
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = operation(transaction.objectStore(STORE))
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

/** Test and demo affordance: wipe the local store. */
export async function clearAllSales(): Promise<void> {
  await runTransaction('readwrite', (store) => store.clear())
}
