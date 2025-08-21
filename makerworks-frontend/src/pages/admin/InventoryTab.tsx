// src/pages/admin/InventoryTab.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  listLevels,
  upsertLevel,
  listMoves,
  createMove,
  type InventoryLevel,
  type StockMove,
} from '@/api/inventory'

type LevelEdit = Partial<InventoryLevel>
type MoveCreate = {
  variant_id: string
  warehouse_id: string
  qty: number
  type: string
  to_warehouse_id?: string | null
  note?: string | null
}

export default function InventoryTab() {
  // Levels
  const [levels, setLevels] = useState<InventoryLevel[]>([])
  const [lvLoading, setLvLoading] = useState(true)
  const [lvErr, setLvErr] = useState<string | null>(null)

  // Level upsert
  const [creatingLevel, setCreatingLevel] = useState(false)
  const [levelForm, setLevelForm] = useState<LevelEdit>({
    variant_id: '',
    warehouse_id: '',
    on_hand: 0,
    reserved: 0,
  })

  // Moves
  const [moves, setMoves] = useState<StockMove[]>([])
  const [mvLoading, setMvLoading] = useState(true)
  const [mvErr, setMvErr] = useState<string | null>(null)

  // Move create
  const [creatingMove, setCreatingMove] = useState(false)
  const [moveForm, setMoveForm] = useState<MoveCreate>({
    variant_id: '',
    warehouse_id: '',
    qty: 1,
    type: 'purchase',
    to_warehouse_id: '',
    note: '',
  })

  const refreshLevels = async () => {
    setLvLoading(true); setLvErr(null)
    try {
      const res = await listLevels({ page: 1, page_size: 200 })
      setLevels(res.items ?? [])
    } catch (e: any) {
      setLvErr(e?.response?.data?.detail ?? 'Failed to load inventory levels')
      setLevels([])
    } finally {
      setLvLoading(false)
    }
  }

  const refreshMoves = async () => {
    setMvLoading(true); setMvErr(null)
    try {
      const res = await listMoves({ page: 1, page_size: 200 })
      setMoves(res.items ?? [])
    } catch (e: any) {
      setMvErr(e?.response?.data?.detail ?? 'Failed to load stock moves')
      setMoves([])
    } finally {
      setMvLoading(false)
    }
  }

  useEffect(() => { void refreshLevels(); void refreshMoves() }, [])

  const sortedLevels = useMemo(
    () => levels.slice().sort((a, b) => (a.variant_id + a.warehouse_id).localeCompare(b.variant_id + b.warehouse_id)),
    [levels]
  )
  const sortedMoves = useMemo(
    () => moves.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [moves]
  )

  const doUpsertLevel = async () => {
    if (creatingLevel) return
    const variant_id = String(levelForm.variant_id || '').trim()
    const warehouse_id = String(levelForm.warehouse_id || '').trim()
    if (!variant_id || !warehouse_id) {
      setLvErr('variant_id and warehouse_id are required'); return
    }
    setCreatingLevel(true); setLvErr(null)
    try {
      await upsertLevel({
        variant_id,
        warehouse_id,
        on_hand: Number(levelForm.on_hand ?? 0),
        reserved: Number(levelForm.reserved ?? 0),
      })
      setLevelForm({ variant_id: '', warehouse_id: '', on_hand: 0, reserved: 0 })
      await refreshLevels()
    } catch (e: any) {
      setLvErr(e?.response?.data?.detail ?? e?.message ?? 'Upsert failed')
    } finally {
      setCreatingLevel(false)
    }
  }

  const doCreateMove = async () => {
    if (creatingMove) return
    const variant_id = String(moveForm.variant_id || '').trim()
    const warehouse_id = String(moveForm.warehouse_id || '').trim()
    const qty = Number(moveForm.qty || 0)
    const type = String(moveForm.type || '').trim()
    const to_warehouse_id = String(moveForm.to_warehouse_id || '').trim()
    if (!variant_id || !warehouse_id || !qty || !type) { setMvErr('variant_id, warehouse_id, type and qty required'); return }
    if (type === 'transfer' && !to_warehouse_id) { setMvErr('to_warehouse_id required for transfer'); return }
    setCreatingMove(true); setMvErr(null)
    try {
      await createMove({
        variant_id,
        warehouse_id,
        qty,
        type,
        to_warehouse_id: type === 'transfer' ? to_warehouse_id : undefined,
        note: String(moveForm.note || '').trim() || undefined,
      })
      setMoveForm({ variant_id: '', warehouse_id: '', qty: 1, type: 'purchase', to_warehouse_id: '', note: '' })
      await Promise.all([refreshLevels(), refreshMoves()])
    } catch (e: any) {
      setMvErr(e?.response?.data?.detail ?? e?.message ?? 'Create move failed')
    } finally {
      setCreatingMove(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Levels */}
      <section className="glass-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Inventory Levels</h3>
          <div className="text-sm text-zinc-500">{levels.length} rows</div>
        </div>

        {lvErr && (
          <div className="mb-3 rounded-md px-3 py-2 text-sm border bg-red-50/80 dark:bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200">
            {lvErr}
          </div>
        )}

        {/* Upsert row */}
        <div className="mb-4 rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">Upsert Level</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
            <input className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="Variant ID"
              value={levelForm.variant_id || ''} onChange={(e) => setLevelForm(v => ({ ...v, variant_id: e.target.value }))}/>
            <input className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="Warehouse ID"
              value={levelForm.warehouse_id || ''} onChange={(e) => setLevelForm(v => ({ ...v, warehouse_id: e.target.value }))}/>
            <input className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="On Hand" type="number"
              value={levelForm.on_hand ?? 0} onChange={(e) => setLevelForm(v => ({ ...v, on_hand: Number(e.target.value) }))}/>
            <input className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="Reserved" type="number"
              value={levelForm.reserved ?? 0} onChange={(e) => setLevelForm(v => ({ ...v, reserved: Number(e.target.value) }))}/>
            <div className="sm:col-span-2 flex items-center justify-end">
              <button className="rounded px-3 py-1 text-sm border shadow-sm disabled:opacity-50"
                disabled={creatingLevel} onClick={doUpsertLevel}>
                {creatingLevel ? 'Saving…' : 'Save Level'}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-400 border-b">
              <tr>
                <th className="py-2 pr-4">Variant</th>
                <th className="py-2 pr-4">Warehouse</th>
                <th className="py-2 pr-4">On Hand</th>
                <th className="py-2 pr-4">Reserved</th>
                <th className="py-2 pr-4">Updated</th>
              </tr>
            </thead>
            <tbody>
              {lvLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`lv-skel-${i}`} className="border-b last:border-0">
                  {Array.from({ length: 5 }).map((__, j) => <td key={j} className="py-2 pr-4"><div className="h-3 w-24" /></td>)}
                </tr>
              ))}
              {!lvLoading && sortedLevels.length === 0 && (
                <tr><td className="py-3 pr-4 text-zinc-500" colSpan={5}>No levels yet.</td></tr>
              )}
              {!lvLoading && sortedLevels.map((r) => (
                <tr key={`${r.variant_id}-${r.warehouse_id}`} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{r.variant_id}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.warehouse_id}</td>
                  <td className="py-2 pr-4">{r.on_hand}</td>
                  <td className="py-2 pr-4">{r.reserved}</td>
                  <td className="py-2 pr-4">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Moves */}
      <section className="glass-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Stock Moves</h3>
          <div className="text-sm text-zinc-500">{moves.length} rows</div>
        </div>

        {mvErr && (
          <div className="mb-3 rounded-md px-3 py-2 text-sm border bg-red-50/80 dark:bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200">
            {mvErr}
          </div>
        )}

        {/* Create move */}
        <div className="mb-4 rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">Create Move</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
            <input className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="Variant ID"
              value={moveForm.variant_id} onChange={(e) => setMoveForm(v => ({ ...v, variant_id: e.target.value }))}/>
            <input className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="Warehouse ID"
              value={moveForm.warehouse_id} onChange={(e) => setMoveForm(v => ({ ...v, warehouse_id: e.target.value }))}/>
            <select className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
              value={moveForm.type} onChange={(e) => setMoveForm(v => ({ ...v, type: e.target.value }))}>
              <option value="purchase">purchase</option>
              <option value="sale">sale</option>
              <option value="adjust">adjust</option>
              <option value="transfer">transfer</option>
            </select>
            {moveForm.type === 'transfer' && (
              <input className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="To Warehouse"
                value={moveForm.to_warehouse_id || ''} onChange={(e) => setMoveForm(v => ({ ...v, to_warehouse_id: e.target.value }))}/>
            )}
            <input className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="Qty" type="number"
              value={moveForm.qty} onChange={(e) => setMoveForm(v => ({ ...v, qty: Number(e.target.value) }))}/>
            <input className="sm:col-span-2 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60" placeholder="Note (opt)"
              value={moveForm.note || ''} onChange={(e) => setMoveForm(v => ({ ...v, note: e.target.value }))}/>
            <div className="sm:col-span-6 flex items-center justify-end">
              <button className="rounded px-3 py-1 text-sm border shadow-sm disabled:opacity-50"
                disabled={creatingMove || !moveForm.variant_id || !moveForm.warehouse_id || !moveForm.qty || (moveForm.type === 'transfer' && !moveForm.to_warehouse_id)}
                onClick={doCreateMove}>
                {creatingMove ? 'Creating…' : 'Create Move'}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-400 border-b">
              <tr>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Variant</th>
                <th className="py-2 pr-4">Warehouse</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Note</th>
              </tr>
            </thead>
            <tbody>
              {mvLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`mv-skel-${i}`} className="border-b last:border-0">
                  {Array.from({ length: 6 }).map((__, j) => <td key={j} className="py-2 pr-4"><div className="h-3 w-24" /></td>)}
                </tr>
              ))}
              {!mvLoading && sortedMoves.length === 0 && (
                <tr><td className="py-3 pr-4 text-zinc-500" colSpan={6}>No moves yet.</td></tr>
              )}
              {!mvLoading && sortedMoves.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.variant_id}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.warehouse_id}</td>
                  <td className="py-2 pr-4">{r.type}</td>
                  <td className="py-2 pr-4">{r.qty}</td>
                  <td className="py-2 pr-4">{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
