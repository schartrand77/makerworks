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
// Old filament API (fallback)
import { fetchAvailableFilaments } from '@/api/filaments'
import { toast } from 'sonner'

/** =========================
 *  Generic Product Catalog
 *  =========================
 * A product we might track in inventory.
 * Works for: filament/resin/powder, nozzles, hotends, IPA, boxes, tools, finished parts, etc.
 */
type ProductKind =
  | 'material'     // Filament, resin, powder
  | 'spare'        // Nozzles, belts, bearings, PEI plates...
  | 'consumable'   // IPA, glue, tape, wipes...
  | 'packaging'    // Boxes, bubble wrap, labels...
  | 'tool'         // Scrapers, calipers, cutters...
  | 'finished'     // Ready-to-sell printed items
  | 'misc'         // One-off items you still want to track

type ProductVariant = {
  id: string
  kind: ProductKind
  name: string                        // Human name: "Silk PLA – Emerald Green", "0.4mm Brass Nozzle", "IPA 99% (1L)"
  material?: string | null            // PLA, PETG, Resin, PA12 powder...
  category?: string | null            // "Silk", "Matte", "Nozzles", "Boxes", etc.
  subcategory?: string | null         // Extra grouping if useful
  color_name?: string | null
  color_hex?: string | null
  brand?: string | null
  unit?: string | null                // "roll", "kg", "liter", "piece", "box"
  is_active?: boolean | null
  // local-only flag when we create a temp variant without a real catalog API
  __temp?: boolean
}

type LevelEdit = Partial<InventoryLevel>
type MoveCreate = {
  variant_id: string
  warehouse_id: string
  qty: number
  type: 'purchase' | 'sale' | 'adjust' | 'transfer'
  to_warehouse_id?: string | null
  note?: string | null
}

/** Helpers */
function hex6(h?: string | null) {
  const core = (h || '').trim().replace(/^#+/, '')
  return /^[0-9a-fA-F]{6}$/.test(core) ? `#${core.toUpperCase()}` : ''
}
function productLabel(p?: ProductVariant) {
  if (!p) return ''
  const parts = [p.name?.trim(), p.category?.trim(), p.color_name?.trim()].filter(Boolean)
  return parts.join(' · ') || String(p.id)
}

/**
 * Optional module loader: only load if /src/api/catalog.* actually exists.
 */
async function loadOptionalCatalogModule(): Promise<any | null> {
  const mods = import.meta.glob([
    '/src/api/catalog.ts',
    '/src/api/catalog.tsx',
    '/src/api/catalog.js',
    '/src/api/catalog.mjs',
    '/src/api/catalog.cjs',
    '/src/api/catalog/index.ts',
    '/src/api/catalog/index.tsx',
    '/src/api/catalog/index.js',
    '/src/api/catalog/index.mjs',
    '/src/api/catalog/index.cjs',
  ])
  const loaders = Object.values(mods)
  if (!loaders.length) return null
  const mod = await (loaders[0] as () => Promise<any>)()
  return mod ?? null
}

/**
 * Try to use a real catalog module if present (listVariants, createVariant).
 * Falls back to the old filaments endpoint and maps them into ProductVariant.
 */
async function loadCatalog(): Promise<ProductVariant[]> {
  {
    const mod = await loadOptionalCatalogModule()
    if (mod) {
      const listVariants = (mod.listVariants ?? mod.fetchCatalog ?? null) as null | ((...a: any[]) => Promise<any>)
      if (listVariants) {
        const res = await listVariants()
        const items: any[] = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : []
        return items.map((x) => normalizeToProductVariant(x))
      }
    }
  }

  // Fallback: legacy filaments → ProductVariant
  try {
    const res = await fetchAvailableFilaments()
    const items = Array.isArray(res) ? res : Array.isArray((res as any)?.items) ? (res as any).items : []
    return (items as any[]).map((f) => ({
      id: String(f.id),
      kind: 'material',
      name: [
        (f.material || f.type || '').trim(),
        (f.category || '').trim(),
        (f.color_name || f.color || '').trim(),
      ].filter(Boolean).join(' – ') || String(f.id),
      material: (f.material || f.type || '')?.trim(),
      category: (f.category || '')?.trim(),
      color_name: (f.color_name || f.color || '')?.trim(),
      color_hex: hex6((f.color_hex || f.hex) ?? ''),
      brand: (f.brand || '')?.trim(),
      unit: 'roll',
      is_active: f.is_active === false ? false : true,
    } satisfies ProductVariant))
  } catch (e: any) {
    throw new Error(e?.message ?? 'Failed to load catalog (filaments fallback)')
  }
}

/** Normalize any backend catalog object into ProductVariant shape */
function normalizeToProductVariant(x: any): ProductVariant {
  const color = hex6(x?.color_hex || x?.hex)
  const inferredName = [
    (x.material || x.type || '').trim(),
    (x.category || '').trim(),
    (x.color_name || x.color || '').trim(),
  ].filter(Boolean).join(' – ')
  const safeName = x.name ?? (inferredName || x.id)
  return {
    id: String(x.id),
    kind: (x.kind ?? guessKind(x)) as ProductKind,
    name: String(safeName),
    material: (x.material || x.type || '')?.trim() || null,
    category: (x.category || '')?.trim() || null,
    subcategory: (x.subcategory || '')?.trim() || null,
    color_name: (x.color_name || x.color || '')?.trim() || null,
    color_hex: color,
    brand: (x.brand || '')?.trim() || null,
    unit: (x.unit || '')?.trim() || null,
    is_active: x.is_active === false ? false : true,
  }
}

function guessKind(x: any): ProductKind {
  const cat = String(x?.category ?? '').toLowerCase()
  const name = String(x?.name ?? '').toLowerCase()
  const mat = String(x?.material ?? x?.type ?? '').toLowerCase()
  if (/pla|petg|abs|resin|powder|pa12|nylon/.test(mat)) return 'material'
  if (/nozzle|hotend|belt|bearing|pei|plate|extruder/.test(cat + name)) return 'spare'
  if (/ipa|alcohol|glue|tape|wipe|adhesive|grease|lubricant|clean/.test(cat + name)) return 'consumable'
  if (/box|mailer|label|bubble|pack/.test(cat + name)) return 'packaging'
  if (/tool|scraper|caliper|cutter|plier|hex/.test(cat + name)) return 'tool'
  if (/finished|product|sku|part/.test(cat + name)) return 'finished'
  return 'misc'
}

/** Optional catalog creator if backend exists; otherwise returns a temp local item. */
async function safeCreateVariant(input: {
  name: string
  unit?: string | null
  kind?: ProductKind
}): Promise<ProductVariant> {
  {
    const mod = await loadOptionalCatalogModule()
    const createVariant = mod ? ((mod.createVariant ?? null) as null | ((body: any) => Promise<any>)) : null
    if (createVariant) {
      const created = await createVariant({
        name: input.name,
        unit: input.unit ?? 'piece',
        kind: input.kind ?? 'misc',
        is_active: true,
      })
      const normalized = normalizeToProductVariant(created)
      toast.success(`Created product: ${normalized.name}`)
      return normalized
    }
  }
  const temp: ProductVariant = {
    id: `temp:${Date.now()}`,
    kind: input.kind ?? 'misc',
    name: `${input.name} (TEMP – add to catalog)`,
    unit: input.unit ?? 'piece',
    is_active: true,
    __temp: true,
  }
  toast.message('Created a temporary product (not in server catalog). Add it later in your Catalog.')
  return temp
}

type ViewMode = 'list' | 'matrix' | 'cards'
const PREF_KEY = 'inventoryViewPrefs:v1'

export default function InventoryTab() {
  /** Levels */
  const [levels, setLevels] = useState<InventoryLevel[]>([])
  const [lvLoading, setLvLoading] = useState(true)
  const [lvErr, setLvErr] = useState<string | null>(null)

  /** Level upsert (reserved for future inline edits) */
  const [creatingLevel, setCreatingLevel] = useState(false)
  const [levelForm, setLevelForm] = useState<LevelEdit>({
    variant_id: '',
    warehouse_id: '',
    on_hand: 0,
    reserved: 0,
  })

  /** Moves */
  const [moves, setMoves] = useState<StockMove[]>([])
  const [mvLoading, setMvLoading] = useState(true)
  const [mvErr, setMvErr] = useState<string | null>(null)

  /** Move create */
  const [creatingMove, setCreatingMove] = useState(false)
  const [moveForm, setMoveForm] = useState<MoveCreate>({
    variant_id: '',
    warehouse_id: '',
    qty: 1,
    type: 'purchase',
    to_warehouse_id: '',
    note: '',
  })

  /** Catalog (generic products) */
  const [catalog, setCatalog] = useState<ProductVariant[]>([])
  const [catLoading, setCatLoading] = useState(true)
  const [catErr, setCatErr] = useState<string | null>(null)

  /** Inventory ↔ Catalog sync helpers */
  const [syncWh, setSyncWh] = useState<string>('') // which warehouse to seed
  const [hideUnknown, setHideUnknown] = useState<boolean>(true) // hide levels not in catalog
  const [kindFilter, setKindFilter] = useState<ProductKind | 'all'>('all') // optional filter for seeding/view

  /** NEW: view + filters (with saved prefs) */
  const [view, setView] = useState<ViewMode>('list')
  const [q, setQ] = useState('')
  const [whFilter, setWhFilter] = useState<string[]>([])
  const [lowOnly, setLowOnly] = useState(false)

  // Low-stock thresholds by product kind
  const LOW_THRESH: Record<ProductKind, number> = {
    material: 2, spare: 3, consumable: 1, packaging: 1, tool: 1, finished: 0, misc: 0,
  }
  const availableOf = (lv: InventoryLevel) => Number(lv.on_hand ?? 0) - Number(lv.reserved ?? 0)

  // Load prefs once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        if (p.view) setView(p.view)
        if (p.q) setQ(p.q)
        if (Array.isArray(p.whFilter)) setWhFilter(p.whFilter)
        if (typeof p.lowOnly === 'boolean') setLowOnly(p.lowOnly)
        if (typeof p.hideUnknown === 'boolean') setHideUnknown(p.hideUnknown)
        if (p.kindFilter) setKindFilter(p.kindFilter)
      }
    } catch {/* shrug */}
  }, [])

  // Persist prefs on change
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        view, q, whFilter, lowOnly, hideUnknown, kindFilter
      }))
    } catch {/* browser said no */}
  }, [view, q, whFilter, lowOnly, hideUnknown, kindFilter])

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

  const refreshCatalog = async () => {
    setCatLoading(true); setCatErr(null)
    try {
      const items = await loadCatalog()
      setCatalog(items)
    } catch (e: any) {
      setCatErr(e?.message ?? 'Failed to load catalog')
      setCatalog([])
    } finally {
      setCatLoading(false)
    }
  }

  useEffect(() => { void refreshCatalog(); void refreshLevels(); void refreshMoves() }, [])

  /** Map for quick lookups */
  const byId = useMemo(() => {
    const m = new Map<string, ProductVariant>()
    for (const p of catalog) if (p?.id) m.set(String(p.id), p)
    return m
  }, [catalog])

  /** Distinct warehouse list (from levels) */
  const warehouses = useMemo(() => {
    const s = new Set(levels.map(l => l.warehouse_id).filter(Boolean))
    return Array.from(s).sort()
  }, [levels])

  /** Sorted / filtered base */
  const sortedLevels = useMemo(() => {
    const base = hideUnknown ? levels.filter((lv) => byId.has(String(lv.variant_id))) : levels
    const filtered = kindFilter === 'all'
      ? base
      : base.filter((lv) => (byId.get(String(lv.variant_id))?.kind ?? 'misc') === kindFilter)
    return filtered
      .slice()
      .sort((a, b) => (a.variant_id + a.warehouse_id).localeCompare(b.variant_id + b.warehouse_id))
  }, [levels, hideUnknown, byId, kindFilter])

  /** Apply search & warehouse & low-only filters */
  const visibleLevels = useMemo(() => {
    let rows = sortedLevels
    if (whFilter.length) rows = rows.filter(r => whFilter.includes(r.warehouse_id))
    if (q.trim()) {
      const qq = q.trim().toLowerCase()
      rows = rows.filter(r => {
        const p = byId.get(String(r.variant_id))
        const hay = [
          r.variant_id,
          p?.name, p?.brand, p?.material, p?.category, p?.subcategory, p?.color_name
        ].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(qq)
      })
    }
    if (lowOnly) {
      rows = rows.filter(r => {
        const p = byId.get(String(r.variant_id))
        const k = p?.kind ?? 'misc'
        return availableOf(r) <= (LOW_THRESH[k] ?? 0)
      })
    }
    return rows
  }, [sortedLevels, whFilter, q, lowOnly, byId])

  /** Group by product for matrix & cards */
  type Agg = { [wh: string]: { on: number; res: number; avail: number } }
  const groupedByProduct = useMemo(() => {
    const map = new Map<string, { product?: ProductVariant; agg: Agg; total: { on: number; res: number; avail: number } }>()
    for (const r of visibleLevels) {
      const id = String(r.variant_id)
      if (!map.has(id)) map.set(id, { product: byId.get(id), agg: {}, total: { on: 0, res: 0, avail: 0 } })
      const row = map.get(id)!
      const wh = r.warehouse_id
      const on = Number(r.on_hand ?? 0), res = Number(r.reserved ?? 0), av = on - res
      if (!row.agg[wh]) row.agg[wh] = { on: 0, res: 0, avail: 0 }
      row.agg[wh].on += on; row.agg[wh].res += res; row.agg[wh].avail += av
      row.total.on += on; row.total.res += res; row.total.avail += av
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[1].product?.name || a[0]).localeCompare(b[1].product?.name || b[0]))
  }, [visibleLevels, byId])

  /** SYNC: create missing inventory levels for active catalog items */
  const [syncing, setSyncing] = useState(false)

  const missingForWarehouse = useMemo(() => {
    if (!syncWh) return []
    const have = new Set(
      levels
        .filter((l) => l.warehouse_id === syncWh)
        .map((l) => String(l.variant_id))
    )
    const source =
      kindFilter === 'all'
        ? catalog
        : catalog.filter((p) => (p.kind ?? 'misc') === kindFilter)

    return source.filter(
      (p) => p.is_active !== false && !have.has(String(p.id))
    )
  }, [levels, catalog, syncWh, kindFilter])

  async function doSyncMissing() {
    if (!syncWh) {
      setLvErr('Choose a warehouse ID for sync.')
      return
    }
    if (syncing) return
    setSyncing(true)
    setLvErr(null)
    try {
      for (const p of missingForWarehouse) {
        await upsertLevel({
          variant_id: String(p.id),
          warehouse_id: syncWh,
          on_hand: 0,
          reserved: 0,
        })
      }
      await refreshLevels()
      toast.success(
        `Added ${missingForWarehouse.length} missing level${missingForWarehouse.length === 1 ? '' : 's'} to ${syncWh}`
      )
    } catch (e: any) {
      setLvErr(e?.response?.data?.detail ?? e?.message ?? 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  /** CREATE MOVE: handle purchase/sale/adjust/transfer */
  async function doCreateMove() {
    // Basic client-side validations
    if (!moveForm.variant_id?.trim()) return toast.error('Variant (Product) ID required')
    if (!moveForm.warehouse_id?.trim()) return toast.error('Warehouse ID required')
    if (!Number.isFinite(moveForm.qty) || moveForm.qty === 0) return toast.error('Qty must be non-zero')
    if (moveForm.type === 'transfer' && !moveForm.to_warehouse_id?.trim()) {
      return toast.error('To Warehouse required for transfer')
    }

    if (creatingMove) return
    setCreatingMove(true)
    setMvErr(null)
    try {
      await createMove({
        variant_id: String(moveForm.variant_id),
        warehouse_id: String(moveForm.warehouse_id),
        qty: Number(moveForm.qty),
        type: moveForm.type,
        to_warehouse_id: moveForm.type === 'transfer' ? String(moveForm.to_warehouse_id) : undefined,
        note: moveForm.note || undefined,
      })
      // Refresh data
      await Promise.all([refreshMoves(), refreshLevels()])
      toast.success('Move created')

      // Reset qty & note, keep last IDs as convenience
      setMoveForm((v) => ({
        ...v,
        qty: 1,
        note: '',
      }))
    } catch (e: any) {
      setMvErr(e?.response?.data?.detail ?? e?.message ?? 'Failed to create move')
    } finally {
      setCreatingMove(false)
    }
  }

  /** EXPORT: multi-sheet Excel workbook */
  async function exportExcel() {
    const stamp = new Date()
    const yyyy = stamp.getFullYear()
    const mm = String(stamp.getMonth() + 1).padStart(2, '0')
    const dd = String(stamp.getDate()).padStart(2, '0')
    const hh = String(stamp.getHours()).padStart(2, '0')
    const mi = String(stamp.getMinutes()).padStart(2, '0')
    const ss = String(stamp.getSeconds()).padStart(2, '0')
    const filename = `inventory_${yyyy}-${mm}-${dd}_${hh}${mi}${ss}.xlsx`

    // Levels sheet (honor current filters)
    const baseLevels = visibleLevels.slice().sort((a, b) =>
      (a.variant_id + a.warehouse_id).localeCompare(b.variant_id + b.warehouse_id)
    )
    const levelsRows = baseLevels.map((r) => {
      const p = byId.get(String(r.variant_id))
      return {
        'Variant ID': String(r.variant_id),
        'Product Name': productLabel(p) || '(unknown product)',
        'Kind': p?.kind ?? '—',
        'Material': (p?.material || '')?.trim(),
        'Category': (p?.category || '')?.trim(),
        'Color Name': (p?.color_name || '')?.trim(),
        'Color Hex': hex6(p?.color_hex),
        'Brand': (p?.brand || '')?.trim(),
        'Unit': (p?.unit || '')?.trim(),
        'Active (catalog)': p?.is_active === false ? 'No' : (p ? 'Yes' : '—'),
        'Warehouse ID': String(r.warehouse_id),
        'On Hand': Number(r.on_hand ?? 0),
        'Reserved': Number(r.reserved ?? 0),
        'Available': Number(r.on_hand ?? 0) - Number(r.reserved ?? 0),
        'Updated At': r.updated_at ? new Date(r.updated_at).toISOString() : '',
      }
    })

    // Moves sheet
    const movesRows = moves
      .slice()
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map((m) => {
        const p = byId.get(String(m.variant_id))
        return {
          'Created At': m.created_at ? new Date(m.created_at).toISOString() : '',
          'Variant ID': String(m.variant_id),
          'Product Name': productLabel(p) || '(unknown product)',
          'Warehouse ID': String(m.warehouse_id),
          'Type': m.type,
          'Qty': Number(m.qty ?? 0),
          'To Warehouse ID': (m as any).to_warehouse_id ? String((m as any).to_warehouse_id) : '',
          'Note': m.note || '',
        }
      })

    // Catalog sheet
    const catRows = catalog
      .slice()
      .sort((a, b) => (a.kind + (a.material ?? '') + (a.category ?? '') + a.name)
        .localeCompare(b.kind + (b.material ?? '') + (b.category ?? '') + b.name))
      .map((p) => ({
        'ID': String(p.id),
        'Name': p.name,
        'Kind': p.kind,
        'Material': (p.material || '')?.trim(),
        'Category': (p.category || '')?.trim(),
        'Subcategory': (p.subcategory || '')?.trim(),
        'Color Name': (p.color_name || '')?.trim(),
        'Color Hex': hex6(p.color_hex),
        'Brand': (p.brand || '')?.trim(),
        'Unit': (p.unit || '')?.trim(),
        'Active': p.is_active === false ? 'No' : 'Yes',
        'Temp': p.__temp ? 'Yes' : 'No',
      }))

    try {
      const XLSXmod = await import('xlsx')
      const XLSX: any = (XLSXmod as any).default ?? XLSXmod

      const wb = XLSX.utils.book_new()
      const wsLevels = XLSX.utils.json_to_sheet(levelsRows)
      const wsMoves = XLSX.utils.json_to_sheet(movesRows)
      const wsCatalog = XLSX.utils.json_to_sheet(catRows)

      autoSize(wsLevels, levelsRows)
      autoSize(wsMoves, movesRows)
      autoSize(wsCatalog, catRows)

      XLSX.utils.book_append_sheet(wb, wsLevels, 'Levels')
      XLSX.utils.book_append_sheet(wb, wsMoves, 'Moves')
      XLSX.utils.book_append_sheet(wb, wsCatalog, 'Catalog')

      if (XLSX.writeFile) {
        XLSX.writeFile(wb, filename)
      } else if (XLSX.writeFileXLSX) {
        XLSX.writeFileXLSX(wb, filename)
      } else {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
      }

      toast.success('Excel exported')
    } catch (err) {
      console.error('[InventoryTab] xlsx export failed, falling back to CSV', err)
      toast.warning('xlsx not available — exporting Levels as CSV instead')
      const csv = toCSV(levelsRows)
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename.replace(/\.xlsx$/, '.csv'))
    }
  }

  /** NEW: Export current MATRIX (pivot) as CSV */
  function exportMatrixCSV() {
    const header = ['Product', ...warehouses, 'Total']
    const lines = [header.join(',')]
    for (const [variantId, row] of groupedByProduct) {
      const name = productLabel(row.product) || variantId
      const cells = warehouses.map(wh => String(row.agg[wh]?.avail ?? ''))
      lines.push([escCSV(name), ...cells.map(escCSV), escCSV(String(row.total.avail))].join(','))
    }
    // Column totals
    const colTotals = warehouses.map(wh => {
      let sum = 0
      for (const [, row] of groupedByProduct) sum += row.agg[wh]?.avail ?? 0
      return sum
    })
    const grand = groupedByProduct.reduce((acc, [,row]) => acc + row.total.avail, 0)
    lines.push(['Totals', ...colTotals, grand].map(escCSV).join(','))

    const stamp = new Date().toISOString().replace(/[:.]/g, '')
    const filename = `inventory_matrix_${stamp}.csv`
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, filename)
    toast.success('Matrix CSV exported')
  }

  /** Export helpers */
  function autoSize(ws: any, rows: any[]) {
    if (!rows || !rows.length) return
    const headers = Object.keys(rows[0])
    const colWidths = headers.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length)))
    ws['!cols'] = colWidths.map((wch) => ({ wch: Math.min(Math.max(wch + 2, 8), 60) }))
  }
  function toCSV(rows: Record<string, any>[]) {
    if (!rows.length) return ''
    const headers = Object.keys(rows[0])
    const esc = (v: any) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
  }
  function escCSV(v: any) {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  /** Quick “Misc” creator */
  const [quickName, setQuickName] = useState('')
  const [quickUnit, setQuickUnit] = useState('piece')
  const [creatingQuick, setCreatingQuick] = useState(false)

  const doQuickCreate = async () => {
    const name = quickName.trim()
    if (!name) return toast.error('Enter a name for the misc item')
    setCreatingQuick(true)
    try {
      const pv = await safeCreateVariant({ name, unit: quickUnit, kind: 'misc' })
      setCatalog((prev) => [pv, ...prev])
      setLevelForm((v) => ({ ...v, variant_id: pv.id }))
      setMoveForm((v) => ({ ...v, variant_id: pv.id }))
      setQuickName('')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create misc item')
    } finally {
      setCreatingQuick(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Catalog ↔ Inventory */}
      <section className="glass-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Catalog ↔ Inventory</h3>
          <div className="flex items-center gap-2">
            <button
              className="rounded px-3 py-1 text-sm border shadow-sm"
              onClick={exportExcel}
              title="Export Levels, Moves, and Catalog to Excel"
            >
              Export Excel
            </button>
            <button
              className="rounded px-3 py-1 text-sm border shadow-sm"
              onClick={exportMatrixCSV}
              title="Export current Matrix view as CSV"
            >
              Export Matrix CSV
            </button>
            <div className="text-sm text-zinc-500">
              {catLoading ? 'Loading catalog…' : `${catalog.length} products`}
            </div>
          </div>
        </div>

        {(catErr) && (
          <div className="mb-3 rounded-md px-3 py-2 text-sm border bg-red-50/80 dark:bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200">
            {catErr}
          </div>
        )}

        {/* NEW: quick filters row */}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <input
              className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
              placeholder="Search products…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lowOnly} onChange={(e)=>setLowOnly(e.target.checked)} />
              Low stock only
            </label>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="text-xs opacity-70">Warehouses:</div>
            <div className="flex flex-wrap gap-1">
              {warehouses.map(wh => {
                const on = whFilter.includes(wh)
                return (
                  <button
                    key={wh}
                    className={`rounded border px-2 py-0.5 text-xs ${on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white/70 dark:bg-zinc-900/60'}`}
                    onClick={() => setWhFilter(prev => on ? prev.filter(x=>x!==wh) : [...prev, wh])}
                    title={on ? 'Click to remove filter' : 'Click to filter by warehouse'}
                  >
                    {wh}
                  </button>
                )
              })}
              {warehouses.length > 0 && (
                <button className="rounded px-2 py-0.5 text-xs border" onClick={()=>setWhFilter([])}>Clear</button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 mt-3">
          <div className="sm:col-span-1">
            <label className="block text-xs mb-1 opacity-70">Warehouse ID for seeding</label>
            <input
              className="w-full rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
              placeholder="e.g. MAIN"
              value={syncWh}
              onChange={(e) => setSyncWh(e.target.value)}
            />
            <div className="mt-1 text-[11px] opacity-70">
              Creates <span className="font-medium">missing</span> product rows at 0 qty in this warehouse.
            </div>
          </div>

          <div className="sm:col-span-2 flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <select
                className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as any)}
                title="Filter by product kind for viewing + seeding"
              >
                <option value="all">All kinds</option>
                <option value="material">Materials (filament/resin/powder)</option>
                <option value="spare">Spare parts</option>
                <option value="consumable">Consumables</option>
                <option value="packaging">Packaging</option>
                <option value="tool">Tools</option>
                <option value="finished">Finished goods</option>
                <option value="misc">Misc</option>
              </select>

              <button
                className="rounded px-3 py-1 text-sm border shadow-sm disabled:opacity-50"
                onClick={doSyncMissing}
                disabled={!syncWh || catLoading || syncing || missingForWarehouse.length === 0}
                title={
                  !syncWh
                    ? 'Enter a warehouse ID'
                    : missingForWarehouse.length
                    ? `${missingForWarehouse.length} missing`
                    : 'Up to date'
                }
              >
                {syncing
                  ? 'Syncing…'
                  : `Add missing levels (${missingForWarehouse.length})`}
              </button>

              <button
                className="rounded px-3 py-1 text-sm border shadow-sm"
                onClick={() => { void refreshCatalog(); void refreshLevels() }}
              >
                Refresh
              </button>

              <label className="ml-auto inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hideUnknown}
                  onChange={(e) => setHideUnknown(e.target.checked)}
                />
                Hide deleted/unknown products
              </label>
            </div>

            {/* Quick Misc creator */}
            <div className="rounded border p-2">
              <div className="text-sm font-medium mb-1">Quick add “Misc” product</div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <input
                  className="sm:col-span-3 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                  placeholder='e.g. "M3x10 Screws (bag of 100)"'
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                />
                <input
                  className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                  placeholder="Unit (e.g. piece, box, bag)"
                  value={quickUnit}
                  onChange={(e) => setQuickUnit(e.target.value)}
                />
                <button
                  className="rounded px-3 py-1 text-sm border shadow-sm disabled:opacity-50"
                  disabled={creatingQuick || !quickName.trim()}
                  onClick={doQuickCreate}
                >
                  {creatingQuick ? 'Adding…' : 'Add Misc'}
                </button>
              </div>
              <div className="mt-1 text-[11px] opacity-70">
                If a real catalog API exists, this will be saved server-side. Otherwise it’s a temporary product so you can move on.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Inventory */}
      <section className="glass-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Inventory</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500 hidden sm:inline">{visibleLevels.length} rows</span>
            <div className="ml-2 rounded border overflow-hidden">
              {(['list','matrix','cards'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  className={`px-2 py-0.5 ${view===v ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-white/70 dark:bg-zinc-900/60'}`}
                  onClick={()=>setView(v)}
                  title={v==='list' ? 'Table list' : v==='matrix' ? 'Pivot by warehouse' : 'Cards'}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {lvErr && (
          <div className="mb-3 rounded-md px-3 py-2 text-sm border bg-red-50/80 dark:bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200">
            {lvErr}
          </div>
        )}

        {/* List View */}
        <div className={`${view==='list' ? '' : 'hidden'}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-zinc-400 border-b">
                <tr>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Warehouse</th>
                  <th className="py-2 pr-4">On Hand</th>
                  <th className="py-2 pr-4">Reserved</th>
                  <th className="py-2 pr-4">Available</th>
                  <th className="py-2 pr-4">Updated</th>
                </tr>
              </thead>
              <tbody>
                {lvLoading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`lv-skel-${i}`} className="border-b last:border-0">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="py-2 pr-4"><div className="h-3 w-24" /></td>
                    ))}
                  </tr>
                ))}

                {!lvLoading && visibleLevels.length === 0 && (
                  <tr>
                    <td className="py-3 pr-4 text-zinc-500" colSpan={6}>No levels yet.</td>
                  </tr>
                )}

                {!lvLoading && visibleLevels.map((r) => {
                  const p = byId.get(String(r.variant_id))
                  const label = productLabel(p) || String(r.variant_id)
                  const sw = hex6(p?.color_hex)
                  const avail = availableOf(r)
                  const low = p ? avail <= (LOW_THRESH[p.kind] ?? 0) : false
                  return (
                    <tr key={`${r.variant_id}-${r.warehouse_id}`} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          {sw && (
                            <span
                              aria-hidden
                              className="inline-block h-3 w-3 rounded-full border border-black/10"
                              style={{ background: sw }}
                            />
                          )}
                          <span title={String(r.variant_id)}>{label}</span>
                          {!p && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">unknown</span>}
                          {p?.__temp && <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-900">temp</span>}
                        </div>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{r.warehouse_id}</td>
                      <td className="py-2 pr-4">{r.on_hand}</td>
                      <td className="py-2 pr-4">{r.reserved}</td>
                      <td className={`py-2 pr-4 ${low ? 'text-red-600 font-medium' : ''}`}>{avail}</td>
                      <td className="py-2 pr-4">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* MATRIX VIEW */}
        {!lvLoading && view==='matrix' && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-zinc-400 border-b">
                <tr>
                  <th className="py-2 pr-4">Product</th>
                  {warehouses.map(wh => (
                    <th key={wh} className="py-2 pr-4 text-right" title={`${wh}: available (on−res)`}>{wh}</th>
                  ))}
                  <th className="py-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {groupedByProduct.length === 0 && (
                  <tr><td className="py-3 pr-4 text-zinc-500" colSpan={2+warehouses.length}>No inventory.</td></tr>
                )}
                {groupedByProduct.map(([variantId, row]) => {
                  const p = row.product
                  const name = productLabel(p) || variantId
                  const sw = hex6(p?.color_hex)
                  return (
                    <tr key={variantId} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          {sw && <span aria-hidden className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ background: sw }} />}
                          <span title={variantId}>{name}</span>
                          {(!p) && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">unknown</span>}
                          {p?.__temp && <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-900">temp</span>}
                        </div>
                      </td>
                      {warehouses.map(wh => {
                        const cell = row.agg[wh]
                        const avail = cell?.avail ?? 0
                        const low = p ? avail <= (LOW_THRESH[p.kind] ?? 0) : false
                        return (
                          <td key={wh} className={`py-2 pr-4 text-right ${low ? 'text-red-600 font-medium' : ''}`}>
                            {cell ? `${avail}` : '—'}
                          </td>
                        )
                      })}
                      <td className="py-2 pr-4 text-right font-medium">{row.total.avail}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <th className="py-2 pr-4 text-right">Totals</th>
                  {warehouses.map(wh => {
                    let sum = 0
                    for (const [, row] of groupedByProduct) sum += row.agg[wh]?.avail ?? 0
                    return <th key={wh} className="py-2 pr-4 text-right">{sum}</th>
                  })}
                  <th className="py-2 pr-4 text-right">
                    {groupedByProduct.reduce((acc, [,row]) => acc + row.total.avail, 0)}
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* CARDS VIEW */}
        {!lvLoading && view==='cards' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupedByProduct.length === 0 && (
              <div className="text-zinc-500">No inventory.</div>
            )}
            {groupedByProduct.map(([variantId, row]) => {
              const p = row.product
              const name = productLabel(p) || variantId
              const sw = hex6(p?.color_hex)
              const low = p ? row.total.avail <= (LOW_THRESH[p.kind] ?? 0) : false
              return (
                <div key={variantId} className="rounded border p-3">
                  <div className="flex items-center gap-2">
                    {sw && <span aria-hidden className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ background: sw }} />}
                    <div className="font-medium">{name}</div>
                    {low && <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-800">low</span>}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div><div className="text-xs opacity-60">Available</div><div className="font-medium">{row.total.avail}</div></div>
                    <div><div className="text-xs opacity-60">On hand</div><div>{row.total.on}</div></div>
                    <div><div className="text-xs opacity-60">Reserved</div><div>{row.total.res}</div></div>
                  </div>
                  <div className="mt-2">
                    <div className="text-xs opacity-60 mb-1">By warehouse</div>
                    <div className="grid grid-cols-2 gap-1">
                      {warehouses.map(wh => {
                        const c = row.agg[wh]
                        return (
                          <div key={wh} className="rounded border px-2 py-1 text-xs flex justify-between">
                            <span className="font-mono">{wh}</span>
                            <span>{c ? `${c.avail}` : '—'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
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
            <div className="sm:col-span-2">
              <input
                className="w-full rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                placeholder="Variant (Product) ID"
                value={moveForm.variant_id}
                onChange={(e) => setMoveForm(v => ({ ...v, variant_id: e.target.value }))}
                list="variant-options"
              />
            </div>
            <input
              className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
              placeholder="Warehouse ID"
              value={moveForm.warehouse_id}
              onChange={(e) => setMoveForm(v => ({ ...v, warehouse_id: e.target.value }))}
            />
            <select
              className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
              value={moveForm.type}
              onChange={(e) => setMoveForm(v => ({ ...v, type: e.target.value as MoveCreate['type'] }))}
            >
              <option value="purchase">purchase</option>
              <option value="sale">sale</option>
              <option value="adjust">adjust</option>
              <option value="transfer">transfer</option>
            </select>
            {moveForm.type === 'transfer' && (
              <input
                className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                placeholder="To Warehouse"
                value={moveForm.to_warehouse_id || ''}
                onChange={(e) => setMoveForm(v => ({ ...v, to_warehouse_id: e.target.value }))}
              />
            )}
            <input
              className="rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
              placeholder="Qty"
              type="number"
              value={moveForm.qty}
              onChange={(e) => setMoveForm(v => ({ ...v, qty: Number(e.target.value) }))}
            />
            <input
              className="sm:col-span-2 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
              placeholder="Note (opt)"
              value={moveForm.note || ''}
              onChange={(e) => setMoveForm(v => ({ ...v, note: e.target.value }))}
            />
            <div className="sm:col-span-6 flex items-center justify-end">
              <button
                className="rounded px-3 py-1 text-sm border shadow-sm disabled:opacity-50"
                disabled={creatingMove || !moveForm.variant_id || !moveForm.warehouse_id || !moveForm.qty || (moveForm.type === 'transfer' && !moveForm.to_warehouse_id)}
                onClick={doCreateMove}
              >
                {creatingMove ? 'Creating…' : 'Create Move'}
              </button>
            </div>
          </div>
        </div>

        <datalist id="variant-options">
          {catalog.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {productLabel(p)}
            </option>
          ))}
        </datalist>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-400 border-b">
              <tr>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Warehouse</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Note</th>
              </tr>
            </thead>
            <tbody>
              {mvLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`mv-skel-${i}`} className="border-b last:border-0">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="py-2 pr-4"><div className="h-3 w-24" /></td>
                  ))}
                </tr>
              ))}

              {!mvLoading && moves.length === 0 && (
                <tr>
                  <td className="py-3 pr-4 text-zinc-500" colSpan={6}>No moves yet.</td>
                </tr>
              )}

              {!mvLoading && moves.map((r) => {
                const p = byId.get(String(r.variant_id))
                const label = productLabel(p) || String(r.variant_id)
                const sw = hex6(p?.color_hex)
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        {sw && (
                          <span
                            aria-hidden
                            className="inline-block h-3 w-3 rounded-full border border-black/10"
                            style={{ background: sw }}
                          />
                        )}
                        <span title={String(r.variant_id)}>{label}</span>
                        {!p && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">unknown</span>}
                        {p?.__temp && <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-900">temp</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.warehouse_id}</td>
                    <td className="py-2 pr-4">{r.type}</td>
                    <td className="py-2 pr-4">{r.qty}</td>
                    <td className="py-2 pr-4">{r.note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
