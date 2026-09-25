import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompletedSale } from '../domain/types'

/**
 * A tablet signed out of one business and into another must never send the
 * first business's unsent sales under the second's session. Each test gets a
 * fresh copy of the module (its "current business" is module state) and a
 * fresh database.
 */

type Queue = typeof import('./offline-queue')

async function freshQueue(): Promise<Queue> {
  vi.resetModules()
  return import('./offline-queue')
}

function sale(clientTxnId: string, extra: Partial<CompletedSale> = {}): CompletedSale {
  return {
    clientTxnId,
    orderId: null,
    queueLabel: '#OFF-01',
    offlineLabel: '#OFF-01',
    totalSen: 500,
    menuPriceSen: 500,
    itemCount: 1,
    businessDate: '2026-09-25',
    completedAt: new Date().toISOString(),
    syncStatus: 'PENDING',
    request: { shift_id: 'shift-1' },
    ...extra,
  } as CompletedSale
}

beforeEach(() => {
  localStorage.clear()
  // A brand-new, empty IndexedDB per test. Deleting the database instead would
  // wait forever on the connection the previous module copy still holds open.
  globalThis.indexedDB = new IDBFactory()
})

describe('offline queue across businesses', () => {
  it('sends only the signed-in business’s sales', async () => {
    const queue = await freshQueue()
    await queue.setDeviceBusiness('business-a')
    await queue.saveSale(sale('a-1'))

    await queue.setDeviceBusiness('business-b')
    await queue.saveSale(sale('b-1'))

    expect((await queue.listPendingSales()).map((row) => row.clientTxnId)).toEqual(['b-1'])
    expect(await queue.countPendingRecords()).toBe(1)
    expect(await queue.countOtherBusinessRecords()).toBe(1)

    // Signed back in to A: A's sale is there to send, B's waits.
    await queue.setDeviceBusiness('business-a')
    expect((await queue.listPendingSales()).map((row) => row.clientTxnId)).toEqual(['a-1'])
  })

  it('files sales queued before the tablet knew its business under the first one it learns', async () => {
    const queue = await freshQueue()
    // Saved with no business known yet: what a tablet updated mid-queue holds.
    await queue.saveSale(sale('legacy-1'))
    expect(await queue.listPendingSales()).toEqual([])

    await queue.setDeviceBusiness('business-a')
    expect((await queue.listPendingSales()).map((row) => row.clientTxnId)).toEqual(['legacy-1'])

    // A later, different business does not inherit them.
    await queue.setDeviceBusiness('business-b')
    expect(await queue.listPendingSales()).toEqual([])
  })

  it('keeps a sale’s business when it is updated after a switch', async () => {
    const queue = await freshQueue()
    await queue.setDeviceBusiness('business-a')
    await queue.saveSale(sale('a-1'))
    const [stored] = await queue.listPendingSales()

    await queue.setDeviceBusiness('business-b')
    // e.g. the sync worker marking it synced must not re-stamp it as B's.
    if (stored) await queue.saveSale({ ...stored, syncStatus: 'SYNCED' })

    await queue.setDeviceBusiness('business-a')
    expect(await queue.countOtherBusinessRecords()).toBe(0)
  })

  it('remembers its business across a reload', async () => {
    const first = await freshQueue()
    await first.setDeviceBusiness('business-a')
    await first.saveSale(sale('a-1'))

    const afterReload = await freshQueue()
    expect((await afterReload.listPendingSales()).map((row) => row.clientTxnId)).toEqual(['a-1'])
  })
})
