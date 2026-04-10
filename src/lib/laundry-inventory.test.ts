import { describe, it, expect } from 'vitest'

/**
 * Tests for laundry ↔ inventory sync logic.
 * Validates that batch create/edit/return correctly adjust inventory counts.
 */

interface InventoryItem {
  item_name: string
  quantity_in_closet: number
  quantity_at_laundry: number
  quantity_damaged: number
}

interface BatchItem {
  item_name: string
  quantity: number
}

function applyBatchCreate(inventory: InventoryItem[], batchItems: BatchItem[]): InventoryItem[] {
  return inventory.map(inv => {
    const batch = batchItems.find(b => b.item_name.toLowerCase() === inv.item_name.toLowerCase())
    if (!batch) return inv
    return {
      ...inv,
      quantity_in_closet: Math.max(0, inv.quantity_in_closet - batch.quantity),
      quantity_at_laundry: inv.quantity_at_laundry + batch.quantity,
    }
  })
}

function applyBatchReturn(inventory: InventoryItem[], batchItems: BatchItem[]): InventoryItem[] {
  return inventory.map(inv => {
    const batch = batchItems.find(b => b.item_name.toLowerCase() === inv.item_name.toLowerCase())
    if (!batch) return inv
    return {
      ...inv,
      quantity_in_closet: inv.quantity_in_closet + batch.quantity,
      quantity_at_laundry: Math.max(0, inv.quantity_at_laundry - batch.quantity),
    }
  })
}

function applyBatchEdit(
  inventory: InventoryItem[],
  oldItems: BatchItem[],
  newItems: BatchItem[]
): InventoryItem[] {
  return inventory.map(inv => {
    const oldBatch = oldItems.find(b => b.item_name.toLowerCase() === inv.item_name.toLowerCase())
    const newBatch = newItems.find(b => b.item_name.toLowerCase() === inv.item_name.toLowerCase())
    const oldQty = oldBatch?.quantity || 0
    const newQty = newBatch?.quantity || 0
    const diff = newQty - oldQty
    if (diff === 0) return inv
    return {
      ...inv,
      quantity_in_closet: Math.max(0, inv.quantity_in_closet - diff),
      quantity_at_laundry: Math.max(0, inv.quantity_at_laundry + diff),
    }
  })
}

function applyDamage(inv: InventoryItem, count: number): InventoryItem {
  return {
    ...inv,
    quantity_in_closet: Math.max(0, inv.quantity_in_closet - count),
    quantity_damaged: inv.quantity_damaged + count,
  }
}

const baseInventory: InventoryItem[] = [
  { item_name: 'Bath Towels', quantity_in_closet: 10, quantity_at_laundry: 0, quantity_damaged: 0 },
  { item_name: 'Bed Sheets', quantity_in_closet: 6, quantity_at_laundry: 0, quantity_damaged: 0 },
]

describe('Laundry Batch Create', () => {
  it('moves items from closet to laundry', () => {
    const result = applyBatchCreate(baseInventory, [
      { item_name: 'Bath Towels', quantity: 4 },
      { item_name: 'Bed Sheets', quantity: 2 },
    ])
    expect(result[0].quantity_in_closet).toBe(6)
    expect(result[0].quantity_at_laundry).toBe(4)
    expect(result[1].quantity_in_closet).toBe(4)
    expect(result[1].quantity_at_laundry).toBe(2)
  })

  it('does not go below zero', () => {
    const result = applyBatchCreate(baseInventory, [
      { item_name: 'Bath Towels', quantity: 15 },
    ])
    expect(result[0].quantity_in_closet).toBe(0)
    expect(result[0].quantity_at_laundry).toBe(15)
  })

  it('ignores items not in inventory', () => {
    const result = applyBatchCreate(baseInventory, [
      { item_name: 'Pillow Cases', quantity: 4 },
    ])
    expect(result).toEqual(baseInventory)
  })
})

describe('Laundry Batch Return', () => {
  it('moves items from laundry back to closet', () => {
    const atLaundry = [
      { item_name: 'Bath Towels', quantity_in_closet: 6, quantity_at_laundry: 4, quantity_damaged: 0 },
    ]
    const result = applyBatchReturn(atLaundry, [{ item_name: 'Bath Towels', quantity: 4 }])
    expect(result[0].quantity_in_closet).toBe(10)
    expect(result[0].quantity_at_laundry).toBe(0)
  })
})

describe('Laundry Batch Edit', () => {
  it('adjusts inventory when batch quantities change', () => {
    const current = [
      { item_name: 'Bath Towels', quantity_in_closet: 6, quantity_at_laundry: 4, quantity_damaged: 0 },
    ]
    // Edit: towels changed from 4 to 6 (2 more to laundry)
    const result = applyBatchEdit(
      current,
      [{ item_name: 'Bath Towels', quantity: 4 }],
      [{ item_name: 'Bath Towels', quantity: 6 }]
    )
    expect(result[0].quantity_in_closet).toBe(4)
    expect(result[0].quantity_at_laundry).toBe(6)
  })

  it('returns items when batch quantity decreases', () => {
    const current = [
      { item_name: 'Bath Towels', quantity_in_closet: 6, quantity_at_laundry: 4, quantity_damaged: 0 },
    ]
    // Edit: towels changed from 4 to 2 (2 returned to closet)
    const result = applyBatchEdit(
      current,
      [{ item_name: 'Bath Towels', quantity: 4 }],
      [{ item_name: 'Bath Towels', quantity: 2 }]
    )
    expect(result[0].quantity_in_closet).toBe(8)
    expect(result[0].quantity_at_laundry).toBe(2)
  })

  it('handles no change', () => {
    const result = applyBatchEdit(
      baseInventory,
      [{ item_name: 'Bath Towels', quantity: 4 }],
      [{ item_name: 'Bath Towels', quantity: 4 }]
    )
    expect(result).toEqual(baseInventory)
  })
})

describe('Damage Tracking', () => {
  it('deducts damaged items from closet', () => {
    const result = applyDamage(baseInventory[0], 2)
    expect(result.quantity_in_closet).toBe(8)
    expect(result.quantity_damaged).toBe(2)
  })

  it('does not go below zero on closet', () => {
    const result = applyDamage(baseInventory[0], 15)
    expect(result.quantity_in_closet).toBe(0)
    expect(result.quantity_damaged).toBe(15)
  })
})
