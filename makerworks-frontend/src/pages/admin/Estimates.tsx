import React, { useEffect, useMemo, useState } from 'react'
// LED theme
import '@/styles/mw-led.css'

// ---- VisionOS-y pill for normal buttons (green) -----------------------------
function LedButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="mw-btn mw-btn-sm">
      {children}
    </button>
  )
}

function DangerButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  // keep a red variant for destructive actions
  return (
    <button onClick={onClick} className="mw-btn mw-btn-sm">
      <span className="text-red-400">⨯</span>&nbsp;{children}
    </button>
  )
}

// ---- tiny http helper -------------------------------------------------------
async function j<T>(p: Promise<Response>) {
  const r = await p
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  const ct = r.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await r.json()) as T
  return (await r.json()) as T
}
const get = <T,>(url: string) => j<T>(fetch(url, { credentials: 'include' }))
const post = <T,>(url: string, body: any) =>
  j<T>(
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  )
const patch = <T,>(url: string, body: any) =>
  j<T>(
    fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
const del = <T,>(url: string) => j<T>(fetch(url, { method: 'DELETE', credentials: 'include' }))

// Try multiple endpoints in order; return first success, else fallback/default.
async function getFirst<T>(urls: string[], fallback?: T): Promise<T> {
  for (const u of urls) {
    try {
      return await get<T>(u)
    } catch {
      /* try next */
    }
  }
  if (fallback !== undefined) return fallback
  throw new Error(`All endpoints failed: ${urls.join(', ')}`)
}

// ---- types ------------------------------------------------------------------
type UUID = string

type PricingSettings = {
  id: UUID
  effective_from: string
  currency: string
  electricity_cost_per_kwh: number
  shop_overhead_per_day: number
  productive_hours_per_day?: number
  admin_note?: string
}

type Material = {
  id: UUID
  name: string
  type: 'FDM' | 'SLA'
  cost_per_kg?: number
  cost_per_l?: number
  density_g_cm3?: number
  abrasive: boolean
  waste_allowance_pct: number
  enabled: boolean
}

type Printer = {
  id: UUID
  name: string
  tech: 'FDM' | 'SLA'
  nozzle_diameter_mm?: number
  chamber?: boolean
  enclosed?: boolean
  watts_idle: number
  watts_printing: number
  hourly_base_rate: number
  maintenance_rate_per_hour: number
  depreciation_per_hour: number
  enabled: boolean
}

type LaborRole = {
  id: UUID
  name: string
  hourly_rate: number
  min_bill_minutes: number
}

type ProcessStep = {
  id: UUID
  name: string
  default_minutes: number
  labor_role_id: UUID
  material_type_filter?: 'FDM' | 'SLA' | null
  multiplier_per_cm3?: number
  enabled: boolean
}

type QualityTier = {
  id: UUID
  name: string
  layer_height_mm?: number
  infill_pct?: number
  support_density_pct?: number
  qc_time_minutes: number
  price_multiplier: number
  notes?: string
}

type Consumable = {
  id: UUID
  name: string
  unit: string
  cost_per_unit: number
  usage_per_print: number
}

type Rule = {
  id: UUID
  if_expression: string
  then_modifiers: Record<string, any>
}

type VersionRow = {
  id: UUID
  effective_from: string
  note?: string
}

// ---- Bambu bridge types -----------------------------------------------------
type BridgePrinter = { name: string; host: string; serial?: string; connected: boolean; last_error?: string | null }
type BridgeStatus = { name: string; host?: string; serial?: string; connected?: boolean; [k: string]: any }

// ---- shared widgets ---------------------------------------------------------
function Card({
  title,
  actions,
  children,
  id,
}: {
  id?: string
  title: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  // mw-card = glass surface + border; mw-btn--amber = amber ring (like Cart sections)
  return (
    <section id={id} className="mw-card mw-btn--amber p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white/90">{title}</h2>
        <div className="mw-led">{actions}</div>
      </div>
      {/* Controls live inside mw-led so focus/hover use the LED glow */}
      <div className="mw-led">{children}</div>
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-white/80">{label}</span>
      {children}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'h-9 rounded-xl px-3 text-sm',
        'bg-white/80 dark:bg-white/10 backdrop-blur border',
        'border-white/20',
        'focus:outline-none focus:ring-2',
      ].join(' ')}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-9 rounded-xl px-3 text-sm bg-white/80 dark:bg-white/10 backdrop-blur border border-white/20 focus:outline-none focus:ring-2"
    />
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        'w-12 h-7 rounded-full border transition relative',
        checked ? 'bg-white/30 border-white/30' : 'bg-white/20 border-white/20',
      ].join(' ')}
      aria-pressed={checked}
    >
      <span className={['absolute top-0.5 h-6 w-6 rounded-full shadow transition', checked ? 'translate-x-6 bg-white/90' : 'translate-x-0.5 bg-white/70'].join(' ')} />
    </button>
  )
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

// ---- data hooks -------------------------------------------------------------
function useBoot() {
  const [settings, setSettings] = useState<PricingSettings | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [roles, setRoles] = useState<LaborRole[]>([])
  const [steps, setSteps] = useState<ProcessStep[]>([])
  const [tiers, setTiers] = useState<QualityTier[]>([])
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const [s, m, p, r, ps, qt, c, rl, vers] = await Promise.all([
          getFirst<PricingSettings>(['/api/v1/pricing/settings/latest', '/api/v1/admin/pricing/settings/latest'], {
            id: 'draft' as UUID,
            effective_from: new Date().toISOString(),
            currency: 'USD',
            electricity_cost_per_kwh: 0.15,
            shop_overhead_per_day: 5,
            productive_hours_per_day: 6,
            admin_note: 'autogenerated defaults (frontend fallback)',
          }),
          getFirst<Material[]>(['/api/v1/materials', '/api/v1/pricing/materials', '/api/v1/admin/materials'], []),
          getFirst<Printer[]>(['/api/v1/printers', '/api/v1/pricing/printers', '/api/v1/admin/printers'], []),
          getFirst<LaborRole[]>(['/api/v1/labor-roles', '/api/v1/pricing/labor-roles', '/api/v1/admin/labor-roles'], []),
          getFirst<ProcessStep[]>(['/api/v1/process-steps', '/api/v1/pricing/process-steps', '/api/v1/admin/process-steps'], []),
          getFirst<QualityTier[]>(['/api/v1/tiers', '/api/v1/pricing/tiers', '/api/v1/admin/tiers'], []),
          getFirst<Consumable[]>(['/api/v1/consumables', '/api/v1/pricing/consumables', '/api/v1/admin/consumables'], []),
          getFirst<Rule[]>(['/api/v1/rules', '/api/v1/pricing/rules', '/api/v1/admin/rules'], []),
          getFirst<VersionRow[]>(['/api/v1/system/snapshot'], []),
        ])
        setSettings(s)
        setMaterials(m)
        setPrinters(p)
        setRoles(r)
        setSteps(ps)
        setTiers(qt)
        setConsumables(c)
        setRules(rl)
        setVersions(vers)
      } catch (e: any) {
        setErr(e.message ?? 'Failed to load')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return {
    settings,
    setSettings,
    materials,
    setMaterials,
    printers,
    setPrinters,
    roles,
    setRoles,
    steps,
    setSteps,
    tiers,
    setTiers,
    consumables,
    setConsumables,
    rules,
    setRules,
    versions,
    loading,
    err,
  }
}

// ---- editor helpers ----------------------------------------------------------
function number(v: any, def = 0) {
  if (v === '' || v === null || v === undefined) return def
  const n = +v
  return Number.isFinite(n) ? n : def
}

// ---- example estimate calculation -------------------------------------------
type ExampleInputs = {
  volume_cm3: number
  hours: number
  materialId?: UUID
  printerId?: UUID
  tierId?: UUID
  include: {
    filament: boolean
    electricity: boolean
    machine_rates: boolean
    overhead: boolean
    labor: boolean
    consumables: boolean
    rules: boolean
  }
}

type LineItem = { label: string; amount: number }
type Breakdown = {
  currency: string
  items: LineItem[]
  subtotal: number
  appliedRule?: string
  tierMultiplier?: number
  total: number
}

function safeEvalBoolean(expr: string, input: any): boolean {
  try {
    // extremely small sandbox: only "input" in scope
    // eslint-disable-next-line no-new-func
    const fn = new Function('input', `with(input){ return !!(${expr}) }`)
    return !!fn(input)
  } catch {
    return false
  }
}

function computeExample(
  settings: PricingSettings,
  materials: Material[],
  printers: Printer[],
  roles: LaborRole[],
  steps: ProcessStep[],
  tiers: QualityTier[],
  consumables: Consumable[],
  rules: Rule[],
  example: ExampleInputs,
): Breakdown {
  const currency = settings.currency || 'USD'
  const items: LineItem[] = []
  const material =
    materials.find((m) => m.id === example.materialId && m.enabled) ||
    materials.find((m) => m.enabled) ||
    materials[0]
  const printer =
    printers.find((p) => p.id === example.printerId && p.enabled) ||
    printers.find((p) => p.enabled) ||
    printers[0]
  const tier = tiers.find((t) => t.id === example.tierId) || tiers[0]
  const hours = Math.max(0, example.hours || 0)
  const vol = Math.max(0, example.volume_cm3 || 0)

  // Filament / resin
  if (example.include.filament && material) {
    if (material.type === 'FDM') {
      const density = material.density_g_cm3 || 1.24 // PLA-ish default
      const grams = vol * density * (1 + (material.waste_allowance_pct || 0))
      const kg = grams / 1000
      const costPerKg = material.cost_per_kg || 0
      items.push({ label: `Material (${material.name})`, amount: kg * costPerKg })
    } else {
      const liters = vol / 1000
      const costPerL = material.cost_per_l || 0
      items.push({
        label: `Resin (${material.name})`,
        amount: liters * costPerL * (1 + (material.waste_allowance_pct || 0)),
      })
    }
  }

  // Electricity
  if (example.include.electricity && printer) {
    const effectiveWatts = printer.watts_idle * 0.1 + printer.watts_printing * 0.9
    const kwh = (effectiveWatts / 1000) * hours
    items.push({ label: 'Electricity', amount: kwh * (settings.electricity_cost_per_kwh || 0) })
  }

  // Machine rates
  if (example.include.machine_rates && printer) {
    const machine =
      (printer.hourly_base_rate || 0) +
      (printer.maintenance_rate_per_hour || 0) +
      (printer.depreciation_per_hour || 0)
    items.push({ label: `Machine (${printer.name})`, amount: machine * hours })
  }

  // Overhead allocation
  if (example.include.overhead && settings.productive_hours_per_day && settings.productive_hours_per_day > 0) {
    const overheadPerHour = (settings.shop_overhead_per_day || 0) / (settings.productive_hours_per_day || 1)
    items.push({ label: 'Shop overhead', amount: overheadPerHour * hours })
  }

  // Labor (steps)
  if (example.include.labor && steps.length && roles.length) {
    let laborTotal = 0
    const activeSteps = steps.filter(
      (s) => s.enabled && (!s.material_type_filter || s.material_type_filter === material?.type),
    )
    for (const s of activeSteps) {
      const role = roles.find((r) => r.id === s.labor_role_id)
      if (!role) continue
      const mins = (s.default_minutes || 0) + (s.multiplier_per_cm3 || 0) * vol
      const billMin = Math.max(mins, role.min_bill_minutes || 0)
      laborTotal += (billMin / 60) * (role.hourly_rate || 0)
    }
    if (tier) {
      // QC minutes from tier
      const qcRole = roles[0]
      if (qcRole && tier.qc_time_minutes) {
        const billMin = Math.max(tier.qc_time_minutes, qcRole.min_bill_minutes || 0)
        laborTotal += (billMin / 60) * (qcRole.hourly_rate || 0)
      }
    }
    items.push({ label: 'Labor', amount: laborTotal })
  }

  // Consumables
  if (example.include.consumables && consumables.length) {
    let cons = 0
    for (const c of consumables) {
      const unitCost = (c.cost_per_unit || 0) * (c.usage_per_print || 0)
      cons += unitCost
    }
    items.push({ label: 'Consumables', amount: cons })
  }

  let subtotal = items.reduce((a, i) => a + (isFinite(i.amount) ? i.amount : 0), 0)

  // Tier multiplier last
  let tierMultiplier: number | undefined
  if (tier && tier.price_multiplier && tier.price_multiplier !== 1) {
    tierMultiplier = tier.price_multiplier
    subtotal = subtotal * tier.price_multiplier
  }

  // Rules
  let appliedRule: string | undefined
  if (example.include.rules && rules.length) {
    const input = {
      volume_cm3: vol,
      hours,
      material: material || {},
      printer: printer || {},
      tier: tier || {},
      stepsCount: steps.length,
      consumablesCount: consumables.length,
    }
    for (const r of rules) {
      const ok = safeEvalBoolean(r.if_expression || 'false', input)
      if (!ok) continue
      const mods = r.then_modifiers || {}
      if (typeof mods.price_multiplier === 'number' && isFinite(mods.price_multiplier)) {
        subtotal *= mods.price_multiplier
        appliedRule = r.if_expression
      }
      if (typeof mods.add === 'number' && isFinite(mods.add)) {
        subtotal += mods.add
        appliedRule = r.if_expression
      }
      if (appliedRule) break
    }
  }

  const total = Math.max(0, subtotal)
  return { currency, items, subtotal: total, appliedRule, tierMultiplier, total }
}

// ---- main page (single screen) ----------------------------------------------
export default function AdminPricing() {
  const boot = useBoot()
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  if (boot.loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse h-10 w-64 rounded-full bg-white/20 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-white/10 backdrop-blur" />
          ))}
        </div>
      </div>
    )
  }
  if (boot.err) return <div className="p-6 text-red-400">Error: {boot.err}</div>

  return (
    <div className="p-4 sm:p-6">
      {/* sticky in-page nav + title */}
      <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/10 border-b border-white/10 mb-4">
        <div className="py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white/90">Pricing Admin</h1>
          <nav className="flex flex-wrap gap-2 mw-led">
            {[
              ['#global', 'Global'],
              ['#materials', 'Materials'],
              ['#printers', 'Printers'],
              ['#labor', 'Labor'],
              ['#steps', 'Steps'],
              ['#tiers', 'Tiers'],
              ['#consumables', 'Consumables'],
              ['#rules', 'Rules'],
              ['#versions', 'Versions'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="mw-tab mw-btn-sm">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-full px-4 py-2 text-sm backdrop-blur bg-emerald-600/90 text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {/* 2-column layout: left = all editors, right = live example */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
        <div className="space-y-4">
          <GlobalSettingsCard id="global" boot={boot} onSaved={() => setToast('Global settings saved')} />
          <MaterialsCard id="materials" boot={boot} onToast={setToast} />
          <PrintersCard id="printers" boot={boot} onToast={setToast} />
          <LaborCard id="labor" boot={boot} onToast={setToast} />
          <StepsCard id="steps" boot={boot} onToast={setToast} />
          <TiersCard id="tiers" boot={boot} onToast={setToast} />
          <ConsumablesCard id="consumables" boot={boot} onToast={setToast} />
          <RulesCard id="rules" boot={boot} onToast={setToast} />
          <VersionsCard id="versions" boot={boot} />
        </div>

        <ExampleEstimator boot={boot} />
      </div>
    </div>
  )
}

// ---- individual sections (behaviors unchanged) ------------------------------

function GlobalSettingsCard({
  id,
  boot,
  onSaved,
}: {
  id?: string
  boot: ReturnType<typeof useBoot>
  onSaved: () => void
}) {
  const s = boot.settings!
  const [form, setForm] = useState<PricingSettings>(s)
  useEffect(() => setForm(boot.settings!), [boot.settings])

  const save = async () => {
    await post<PricingSettings>('/api/v1/admin/pricing/settings', {
      ...form,
      effective_from: form.effective_from || new Date().toISOString(),
    })
    onSaved()
  }

  return (
    <Card id={id} title="Global Settings" actions={<LedButton onClick={save}>Publish new version</LedButton>}>
      <Row>
        <Field label="Currency">
          <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        </Field>
        <Field label="Electricity cost (per kWh)">
          <Input
            type="number"
            step="0.0001"
            value={form.electricity_cost_per_kwh}
            onChange={(e) => setForm({ ...form, electricity_cost_per_kwh: number(e.target.value) })}
          />
        </Field>
        <Field label="Shop overhead (per day)">
          <Input
            type="number"
            step="0.01"
            value={form.shop_overhead_per_day}
            onChange={(e) => setForm({ ...form, shop_overhead_per_day: number(e.target.value) })}
          />
        </Field>
        <Field label="Productive hours per day">
          <Input
            type="number"
            step="0.1"
            value={form.productive_hours_per_day ?? 6}
            onChange={(e) => setForm({ ...form, productive_hours_per_day: number(e.target.value) })}
          />
        </Field>
        <Field label="Effective from (ISO)">
          <Input
            type="datetime-local"
            value={form.effective_from?.slice(0, 16) ?? ''}
            onChange={(e) => setForm({ ...form, effective_from: new Date(e.target.value).toISOString() })}
          />
        </Field>
        <Field label="Admin note">
          <Input value={form.admin_note ?? ''} onChange={(e) => setForm({ ...form, admin_note: e.target.value })} />
        </Field>
      </Row>
    </Card>
  )
}

function MaterialsCard({
  id,
  boot,
  onToast,
}: {
  id?: string
  boot: ReturnType<typeof useBoot>
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<Material[]>(boot.materials)
  useEffect(() => setRows(boot.materials), [boot.materials])

  const add = async () => {
    const body: Partial<Material> = {
      name: 'New Material',
      type: 'FDM',
      cost_per_kg: 20,
      abrasive: false,
      waste_allowance_pct: 0.05,
      enabled: true,
    }
    const created = await post<Material>('/api/v1/admin/materials', body)
    boot.setMaterials([created, ...boot.materials])
    onToast('Material created')
  }
  const update = async (m: Material) => {
    const u = await patch<Material>(`/api/v1/admin/materials/${m.id}`, m)
    boot.setMaterials(boot.materials.map((x) => (x.id === u.id ? u : x)))
    onToast('Material updated')
  }
  const remove = async (id: UUID) => {
    await del(`/api/v1/admin/materials/${id}`)
    boot.setMaterials(boot.materials.filter((x) => x.id !== id))
    onToast('Material deleted')
  }

  return (
    <Card id={id} title="Materials" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="opacity-80">
            <tr>
              {['Name', 'Type', 'Cost/kg', 'Cost/L', 'Density g/cm³', 'Abrasive', 'Waste %', 'Enabled', ''].map((h) => (
                <th key={h} className="py-2 px-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-white/10">
                <td className="py-2 px-2">
                  <Input value={m.name} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, name: e.target.value } : r)))} />
                </td>
                <td className="py-2 px-2">
                  <Select value={m.type} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, type: e.target.value as any } : r)))}>
                    <option>FDM</option>
                    <option>SLA</option>
                  </Select>
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={m.cost_per_kg ?? 0}
                    onChange={(e) => setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, cost_per_kg: number(e.target.value) } : r)))}
                  />
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={m.cost_per_l ?? 0}
                    onChange={(e) => setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, cost_per_l: number(e.target.value) } : r)))}
                  />
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={m.density_g_cm3 ?? 0}
                    onChange={(e) => setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, density_g_cm3: number(e.target.value) } : r)))}
                  />
                </td>
                <td className="py-2 px-2">
                  <Switch checked={m.abrasive} onChange={(v) => setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, abrasive: v } : r)))} />
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number"
                    step="0.0001"
                    value={m.waste_allowance_pct}
                    onChange={(e) => setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, waste_allowance_pct: number(e.target.value) } : r)))}
                  />
                </td>
                <td className="py-2 px-2">
                  <Switch checked={m.enabled} onChange={(v) => setRows((rs) => rs.map((r) => (r.id === m.id ? { ...r, enabled: v } : r)))} />
                </td>
                <td className="py-2 px-2 flex gap-2">
                  <LedButton onClick={() => update(m)}>Save</LedButton>
                  <DangerButton onClick={() => remove(m.id)}>Delete</DangerButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function PrintersCard({
  id,
  boot,
  onToast,
}: {
  id?: string
  boot: ReturnType<typeof useBoot>
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<Printer[]>(boot.printers)
  useEffect(() => setRows(boot.printers), [boot.printers])

  const add = async () => {
    const body: Partial<Printer> = {
      name: 'New Printer',
      tech: 'FDM',
      watts_idle: 12,
      watts_printing: 120,
      hourly_base_rate: 5,
      maintenance_rate_per_hour: 0.4,
      depreciation_per_hour: 1.0,
      enabled: true,
    }
    const created = await post<Printer>('/api/v1/admin/printers', body)
    boot.setPrinters([created, ...boot.printers])
    onToast('Printer created')
  }
  const update = async (p: Printer) => {
    const u = await patch<Printer>(`/api/v1/admin/printers/${p.id}`, p)
    boot.setPrinters(boot.printers.map((x) => (x.id === u.id ? u : x)))
    onToast('Printer updated')
  }
  const remove = async (id: UUID) => {
    await del(`/api/v1/admin/printers/${id}`)
    boot.setPrinters(boot.printers.filter((x) => x.id !== id))
    onToast('Printer deleted')
  }

  // ---- Bambu Bridge integration --------------------------------------------
  const [bridge, setBridge] = useState<BridgePrinter[]>([])
  const [bridgeLoading, setBridgeLoading] = useState(false)
  const [bridgeErr, setBridgeErr] = useState<string | null>(null)
  const [statusByName, setStatusByName] = useState<Record<string, BridgeStatus>>({})
  const [fileUrlByName, setFileUrlByName] = useState<Record<string, string>>({})
  const [camOpen, setCamOpen] = useState<Record<string, boolean>>({})

  const refreshBridge = async () => {
    try {
      setBridgeLoading(true)
      setBridgeErr(null)
      const data = await get<BridgePrinter[]>('/bambu/bridge/printers')
      setBridge(data)
    } catch (e: any) {
      setBridgeErr(e.message ?? 'Failed to load Bambu bridge')
    } finally {
      setBridgeLoading(false)
    }
  }

  const refreshStatus = async (name: string) => {
    try {
      const s = await get<BridgeStatus>(`/bambu/bridge/${name}/status`)
      setStatusByName((m) => ({ ...m, [name]: s }))
    } catch {
      /* swallow */
    }
  }

  const connectNow = async (name: string) => {
    await post(`/bambu/bridge/${name}/connect`, {})
    await refreshStatus(name)
    await refreshBridge()
    onToast(`Connected ${name}`)
  }

  const startPrint = async (name: string) => {
    const url = (fileUrlByName[name] || '').trim()
    if (!url) return onToast('Provide a file URL first')
    const lower = url.toLowerCase()
    const body = lower.endsWith('.3mf') ? { '3mf_url': url } : { gcode_url: url }
    await post(`/bambu/bridge/${name}/print`, body)
    onToast(`Sent print to ${name}`)
  }

  const pause = async (name: string) => {
    await post(`/bambu/bridge/${name}/pause`, {})
    onToast(`Paused ${name}`)
  }
  const resume = async (name: string) => {
    await post(`/bambu/bridge/${name}/resume`, {})
    onToast(`Resumed ${name}`)
  }
  const stop = async (name: string) => {
    await post(`/bambu/bridge/${name}/stop`, {})
    onToast(`Stopped ${name}`)
  }

  useEffect(() => {
    refreshBridge()
  }, [])

  return (
    <Card id={id} title="Printers" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="opacity-80">
            <tr>{['Name', 'Tech', 'W idle', 'W print', '$/h base', 'Maint/h', 'Dep/h', 'Enabled', ''].map((h) => <th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-white/10">
                <td className="py-2 px-2"><Input value={p.name} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, name: e.target.value } : r)))} /></td>
                <td className="py-2 px-2">
                  <Select value={p.tech} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, tech: e.target.value as any } : r)))}>
                    <option>FDM</option>
                    <option>SLA</option>
                  </Select>
                </td>
                <td className="py-2 px-2"><Input type="number" value={p.watts_idle} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, watts_idle: number(e.target.value) } : r)))} /></td>
                <td className="py-2 px-2"><Input type="number" value={p.watts_printing} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, watts_printing: number(e.target.value) } : r)))} /></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={p.hourly_base_rate} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, hourly_base_rate: number(e.target.value) } : r)))} /></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={p.maintenance_rate_per_hour} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, maintenance_rate_per_hour: number(e.target.value) } : r)))} /></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={p.depreciation_per_hour} onChange={(e) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, depreciation_per_hour: number(e.target.value) } : r)))} /></td>
                <td className="py-2 px-2"><Switch checked={p.enabled} onChange={(v) => setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, enabled: v } : r)))} /></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={() => update(p)}>Save</LedButton><DangerButton onClick={() => remove(p.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <header className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-white/90">Bambu Connect (LAN)</div>
          <Toolbar>
            <LedButton onClick={refreshBridge}>Refresh</LedButton>
          </Toolbar>
        </header>

        {bridgeLoading && <div className="text-sm opacity-70">Loading bridge status…</div>}
        {bridgeErr && <div className="text-sm text-red-400">Bridge error: {bridgeErr}</div>}
        {!bridgeLoading && !bridgeErr && bridge.length === 0 && (
          <div className="text-sm opacity-70">
            No printers configured. Set <code className="font-mono">BAMBULAB_PRINTERS</code>, <code className="font-mono">BAMBULAB_SERIALS</code>, and{' '}
            <code className="font-mono">BAMBULAB_LAN_KEYS</code> in the environment.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {bridge.map((b) => {
            const stat = statusByName[b.name]
            const connected = b.connected || stat?.connected
            return (
              <div key={b.name} className="rounded-xl p-3 border border-white/10 bg-white/5 backdrop-blur space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-white/90">{b.name}</div>
                    {connected ? <span className="text-xs opacity-80">connected</span> : <span className="text-xs opacity-80">disconnected</span>}
                    {b.last_error ? <span className="text-xs text-red-400">err</span> : null}
                  </div>
                  <div className="flex gap-2">
                    <LedButton onClick={() => connectNow(b.name)}>Connect</LedButton>
                    <LedButton onClick={() => refreshStatus(b.name)}>Status</LedButton>
                  </div>
                </div>

                <div className="text-xs opacity-80">
                  <div className="flex flex-wrap gap-3">
                    <span>
                      <span className="opacity-60">host:</span> <span className="font-mono">{b.host}</span>
                    </span>
                    <span>
                      <span className="opacity-60">serial:</span> <span className="font-mono">{b.serial || '—'}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="http(s)://…/file.gcode or file.3mf"
                    value={fileUrlByName[b.name] || ''}
                    onChange={(e) => setFileUrlByName((m) => ({ ...m, [b.name]: e.target.value }))}
                  />
                  <LedButton onClick={() => startPrint(b.name)} disabled={!connected}>
                    Start
                  </LedButton>
                </div>

                <div className="flex flex-wrap gap-2">
                  <LedButton onClick={() => pause(b.name)} disabled={!connected}>
                    Pause
                  </LedButton>
                  <LedButton onClick={() => resume(b.name)} disabled={!connected}>
                    Resume
                  </LedButton>
                  <DangerButton onClick={() => stop(b.name)}>Stop</DangerButton>
                  <button className="mw-btn mw-btn-sm" onClick={() => setCamOpen((m) => ({ ...m, [b.name]: !m[b.name] }))}>
                    {camOpen[b.name] ? 'Hide camera' : 'Show camera'}
                  </button>
                </div>

                {camOpen[b.name] && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-white/10">
                    <img src={`/bambu/bridge/${b.name}/camera`} alt={`${b.name} camera`} className="block w-full h-48 object-cover bg-black/40" />
                  </div>
                )}

                {stat && (
                  <details className="mt-2">
                    <summary className="text-xs opacity-70 cursor-pointer">Details</summary>
                    <pre className="mt-1 max-h-40 overflow-auto text-xs bg-white/5 rounded-lg p-2 border border-white/10">
                      {JSON.stringify(stat, null, 2)}
                    </pre>
                  </details>
                )}

                {b.last_error && !stat && <div className="text-xs text-red-400">Last error: {b.last_error}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

function LaborCard({
  id,
  boot,
  onToast,
}: {
  id?: string
  boot: ReturnType<typeof useBoot>
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<LaborRole[]>(boot.roles)
  useEffect(() => setRows(boot.roles), [boot.roles])

  const add = async () => {
    const body: Partial<LaborRole> = { name: 'Operator', hourly_rate: 36, min_bill_minutes: 15 }
    const created = await post<LaborRole>('/api/v1/admin/labor-roles', body)
    boot.setRoles([created, ...boot.roles])
    onToast('Role created')
  }
  const update = async (r: LaborRole) => {
    const u = await patch<LaborRole>(`/api/v1/admin/labor-roles/${r.id}`, r)
    boot.setRoles(boot.roles.map((x) => (x.id === u.id ? u : x)))
    onToast('Role updated')
  }
  const remove = async (id: UUID) => {
    await del(`/api/v1/admin/labor-roles/${id}`)
    boot.setRoles(boot.roles.filter((x) => x.id !== id))
    onToast('Role deleted')
  }

  return (
    <Card id={id} title="Labor Roles" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="opacity-80">
            <tr>{['Name', 'Rate/h', 'Min bill (min)', ''].map((h) => <th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="py-2 px-2"><Input value={r.name} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={r.hourly_rate} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, hourly_rate: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" value={r.min_bill_minutes} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, min_bill_minutes: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={() => update(r)}>Save</LedButton><DangerButton onClick={() => remove(r.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function StepsCard({
  id,
  boot,
  onToast,
}: {
  id?: string
  boot: ReturnType<typeof useBoot>
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<ProcessStep[]>(boot.steps)
  useEffect(() => setRows(boot.steps), [boot.steps])

  const add = async () => {
    const body: Partial<ProcessStep> = {
      name: 'Support Removal',
      default_minutes: 8,
      labor_role_id: boot.roles[0]?.id,
      material_type_filter: null,
      multiplier_per_cm3: 0,
      enabled: true,
    }
    const created = await post<ProcessStep>('/api/v1/admin/process-steps', body)
    boot.setSteps([created, ...boot.steps])
    onToast('Step created')
  }
  const update = async (s: ProcessStep) => {
    const u = await patch<ProcessStep>(`/api/v1/admin/process-steps/${s.id}`, s)
    boot.setSteps(boot.steps.map((x) => (x.id === u.id ? u : x)))
    onToast('Step updated')
  }
  const remove = async (id: UUID) => {
    await del(`/api/v1/admin/process-steps/${id}`)
    boot.setSteps(boot.steps.filter((x) => x.id !== id))
    onToast('Step deleted')
  }

  return (
    <Card id={id} title="Process Steps" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="opacity-80">
            <tr>{['Name', 'Default min', 'Role', 'Filter', 'x per cm³', 'Enabled', ''].map((h) => <th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-white/10">
                <td className="py-2 px-2"><Input value={s.name} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" value={s.default_minutes} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === s.id ? { ...x, default_minutes: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2">
                  <Select value={s.labor_role_id} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === s.id ? { ...x, labor_role_id: e.target.value } : x)))}>
                    {boot.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-2 px-2">
                  <Select
                    value={s.material_type_filter ?? ''}
                    onChange={(e) =>
                      setRows((rs) => rs.map((x) => (x.id === s.id ? { ...x, material_type_filter: (e.target.value || null) as any } : x)))
                    }
                  >
                    <option value="">(all)</option>
                    <option>FDM</option>
                    <option>SLA</option>
                  </Select>
                </td>
                <td className="py-2 px-2"><Input type="number" step="0.0001" value={s.multiplier_per_cm3 ?? 0} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === s.id ? { ...x, multiplier_per_cm3: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2"><Switch checked={!!s.enabled} onChange={(v) => setRows((rs) => rs.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)))} /></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={() => update(s)}>Save</LedButton><DangerButton onClick={() => remove(s.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function TiersCard({
  id,
  boot,
  onToast,
}: {
  id?: string
  boot: ReturnType<typeof useBoot>
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<QualityTier[]>(boot.tiers)
  useEffect(() => setRows(boot.tiers), [boot.tiers])

  const add = async () => {
    const body: Partial<QualityTier> = {
      name: 'Prototype',
      layer_height_mm: 0.28,
      infill_pct: 12,
      support_density_pct: 10,
      qc_time_minutes: 2,
      price_multiplier: 0.9,
      notes: '',
    }
    const created = await post<QualityTier>('/api/v1/admin/tiers', body)
    boot.setTiers([created, ...boot.tiers])
    onToast('Tier created')
  }
  const update = async (t: QualityTier) => {
    const u = await patch<QualityTier>(`/api/v1/admin/tiers/${t.id}`, t)
    boot.setTiers(boot.tiers.map((x) => (x.id === u.id ? u : x)))
    onToast('Tier updated')
  }
  const remove = async (id: UUID) => {
    await del(`/api/v1/admin/tiers/${id}`)
    boot.setTiers(boot.tiers.filter((x) => x.id !== id))
    onToast('Tier deleted')
  }

  return (
    <Card id={id} title="Quality Tiers" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="opacity-80">
            <tr>{['Name', 'Layer (mm)', 'Infill %', 'Support %', 'QC min', 'Multiplier', 'Notes', ''].map((h) => <th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-white/10">
                <td className="py-2 px-2"><Input value={t.name} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={t.layer_height_mm ?? 0} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, layer_height_mm: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" value={t.infill_pct ?? 0} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, infill_pct: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" value={t.support_density_pct ?? 0} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, support_density_pct: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" value={t.qc_time_minutes} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, qc_time_minutes: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={t.price_multiplier} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, price_multiplier: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2"><Input value={t.notes ?? ''} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, notes: e.target.value } : x)))} /></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={() => update(t)}>Save</LedButton><DangerButton onClick={() => remove(t.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ConsumablesCard({
  id,
  boot,
  onToast,
}: {
  id?: string
  boot: ReturnType<typeof useBoot>
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<Consumable[]>(boot.consumables)
  useEffect(() => setRows(boot.consumables), [boot.consumables])

  const add = async () => {
    const body: Partial<Consumable> = { name: 'IPA', unit: 'L', cost_per_unit: 10, usage_per_print: 0.02 }
    const created = await post<Consumable>('/api/v1/admin/consumables', body)
    boot.setConsumables([created, ...boot.consumables])
    onToast('Consumable created')
  }
  const update = async (c: Consumable) => {
    const u = await patch<Consumable>(`/api/v1/admin/consumables/${c.id}`, c)
    boot.setConsumables(boot.consumables.map((x) => (x.id === u.id ? u : x)))
    onToast('Consumable updated')
  }
  const remove = async (id: UUID) => {
    await del(`/api/v1/admin/consumables/${id}`)
    boot.setConsumables(boot.consumables.filter((x) => x.id !== id))
    onToast('Consumable deleted')
  }

  return (
    <Card id={id} title="Consumables" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="opacity-80">
            <tr>{['Name', 'Unit', 'Cost/unit', 'Usage/print', ''].map((h) => <th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-white/10">
                <td className="py-2 px-2"><Input value={c.name} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} /></td>
                <td className="py-2 px-2"><Input value={c.unit} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === c.id ? { ...x, unit: e.target.value } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={c.cost_per_unit} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === c.id ? { ...x, cost_per_unit: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2"><Input type="number" step="0.0001" value={c.usage_per_print} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === c.id ? { ...x, usage_per_print: number(e.target.value) } : x)))} /></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={() => update(c)}>Save</LedButton><DangerButton onClick={() => remove(c.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function RulesCard({
  id,
  boot,
  onToast,
}: {
  id?: string
  boot: ReturnType<typeof useBoot>
  onToast: (m: string) => void
}) {
  const [rows, setRows] = useState<Rule[]>(boot.rules)
  useEffect(() => setRows(boot.rules), [boot.rules])

  const [jsonErr, setJsonErr] = useState<string | null>(null)

  const add = async () => {
    const body: Partial<Rule> = { if_expression: 'material.abrasive || volume_cm3 > 300', then_modifiers: { price_multiplier: 1.1 } }
    const created = await post<Rule>('/api/v1/admin/rules', body)
    boot.setRules([created, ...boot.rules])
    onToast('Rule created')
  }
  const update = async (r: Rule) => {
    try {
      JSON.stringify(r.then_modifiers)
      const u = await patch<Rule>(`/api/v1/admin/rules/${r.id}`, r)
      boot.setRules(boot.rules.map((x) => (x.id === u.id ? u : x)))
      setJsonErr(null)
      onToast('Rule updated')
    } catch {
      setJsonErr('Invalid JSON in modifiers')
    }
  }
  const remove = async (id: UUID) => {
    await del(`/api/v1/admin/rules/${id}`)
    boot.setRules(boot.rules.filter((x) => x.id !== id))
    onToast('Rule deleted')
  }

  return (
    <Card id={id} title="Rules (advanced)" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      {jsonErr && <div className="mb-2 text-sm text-red-400">{jsonErr}</div>}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl p-3 border border-white/10 bg-white/5 backdrop-blur">
            <Row>
              <Field label="If expression (CEL-like)">
                <Input value={r.if_expression} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, if_expression: e.target.value } : x)))} />
              </Field>
              <Field label="Then modifiers (JSON)">
                <input
                  value={JSON.stringify(r.then_modifiers)}
                  onChange={(e) => {
                    try {
                      const v = JSON.parse(e.target.value)
                      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, then_modifiers: v } : x)))
                      setJsonErr(null)
                    } catch {
                      setJsonErr('Invalid JSON')
                    }
                  }}
                  className="h-9 rounded-xl px-3 text-sm bg-white/80 dark:bg-white/10 backdrop-blur border border-white/20 focus:outline-none focus:ring-2 font-mono"
                />
              </Field>
            </Row>
            <div className="mt-3 flex gap-2">
              <LedButton onClick={() => update(r)}>Save</LedButton>
              <DangerButton onClick={() => remove(r.id)}>Delete</DangerButton>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function VersionsCard({ id, boot }: { id?: string; boot: ReturnType<typeof useBoot> }) {
  const [iso, setIso] = useState<string>(new Date().toISOString().slice(0, 16))
  const publishFrom = async () => {
    await post<PricingSettings>('/api/v1/admin/pricing/settings', {
      ...boot.settings!,
      effective_from: new Date(iso).toISOString(),
    })
  }

  return (
    <Card id={id} title="Versions & rollout" actions={<LedButton onClick={publishFrom}>Schedule activation</LedButton>}>
      <Row>
        <Field label="Activate at">
          <Input type="datetime-local" value={iso} onChange={(e) => setIso(e.target.value)} />
        </Field>
        <div className="opacity-80 text-sm self-end">
          Active ID: <span className="font-mono">{boot.settings?.id}</span>
        </div>
      </Row>

      <div className="mt-4 overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="opacity-80">
            <tr>{['Version ID', 'Effective From', 'Note'].map((h) => <th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {boot.versions.map((v) => (
              <tr key={v.id} className="border-t border-white/10">
                <td className="py-2 px-2 font-mono">{v.id}</td>
                <td className="py-2 px-2">{new Date(v.effective_from).toLocaleString()}</td>
                <td className="py-2 px-2">{v.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---- Live Example Estimator --------------------------------------------------
function ExampleEstimator({ boot }: { boot: ReturnType<typeof useBoot> }) {
  const s = boot.settings!
  const [ex, setEx] = useState<ExampleInputs>({
    volume_cm3: 80,
    hours: 3.2,
    materialId: boot.materials.find((m) => m.enabled)?.id ?? boot.materials[0]?.id,
    printerId: boot.printers.find((p) => p.enabled)?.id ?? boot.printers[0]?.id,
    tierId: boot.tiers[0]?.id,
    include: {
      filament: true,
      electricity: true,
      machine_rates: true,
      overhead: true,
      labor: true,
      consumables: true,
      rules: true,
    },
  })

  const result = useMemo(
    () => computeExample(s, boot.materials, boot.printers, boot.roles, boot.steps, boot.tiers, boot.consumables, boot.rules, ex),
    [s, boot.materials, boot.printers, boot.roles, boot.steps, boot.tiers, boot.consumables, boot.rules, ex],
  )

  return (
    <div className="xl:sticky xl:top-16 h-max">
      <Card title="Example Estimate (live)">
        <div className="space-y-3">
          <Row>
            <Field label="Volume (cm³)"><Input type="number" step="0.1" value={ex.volume_cm3} onChange={(e) => setEx({ ...ex, volume_cm3: number(e.target.value, 0) })} /></Field>
            <Field label="Print time (hours)"><Input type="number" step="0.1" value={ex.hours} onChange={(e) => setEx({ ...ex, hours: number(e.target.value, 0) })} /></Field>
            <Field label="Material">
              <Select value={ex.materialId} onChange={(e) => setEx({ ...ex, materialId: e.target.value })}>
                {boot.materials.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.enabled}>
                    {m.name} {!m.enabled ? '(disabled)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Printer">
              <Select value={ex.printerId} onChange={(e) => setEx({ ...ex, printerId: e.target.value })}>
                {boot.printers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.enabled}>
                    {p.name} {!p.enabled ? '(disabled)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quality tier">
              <Select value={ex.tierId} onChange={(e) => setEx({ ...ex, tierId: e.target.value })}>
                {boot.tiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (x{t.price_multiplier?.toFixed(2)})
                  </option>
                ))}
              </Select>
            </Field>
          </Row>

          <div className="grid grid-cols-2 gap-2">
            {([
              ['filament', 'Filament/Resin'],
              ['electricity', 'Electricity'],
              ['machine_rates', 'Machine rates'],
              ['overhead', 'Overhead'],
              ['labor', 'Labor'],
              ['consumables', 'Consumables'],
              ['rules', 'Apply rules'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 rounded-xl px-3 h-10 border border-white/10 bg-white/5">
                <span className="text-sm">{label}</span>
                <Switch checked={(ex.include as any)[key]} onChange={(v) => setEx({ ...ex, include: { ...ex.include, [key]: v } })} />
              </label>
            ))}
          </div>

          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-sm font-medium mb-2">Breakdown</div>
            <div className="space-y-1">
              {result.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="opacity-80">{it.label}</span>
                  <span className="font-medium">
                    {result.currency} {it.amount.toFixed(2)}
                  </span>
                </div>
              ))}
              {result.tierMultiplier && (
                <div className="flex items-center justify-between text-xs opacity-70">
                  <span>Tier multiplier</span>
                  <span>× {result.tierMultiplier.toFixed(2)}</span>
                </div>
              )}
              {result.appliedRule && (
                <div className="flex items-center justify-between text-xs opacity-70">
                  <span>Rule applied</span>
                  <span className="font-mono truncate max-w-[200px]">{result.appliedRule}</span>
                </div>
              )}
              <div className="border-t border-white/10 my-2" />
              <div className="flex items-center justify-between text-base">
                <span>Total</span>
                <span className="font-semibold">
                  {result.currency} {result.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
