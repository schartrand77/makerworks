import React, { useEffect, useMemo, useState } from 'react'

// ---- VisionOS-y pill, emerald ring only (no glow) ----
const ledClasses = (active: boolean) =>
  [
    'relative inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium transition',
    'backdrop-blur-xl bg-white/70 dark:bg-white/10',
    'text-emerald-950 dark:text-emerald-200',
    'border border-emerald-500/40 dark:border-emerald-400/35',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
    'hover:border-emerald-500/60 dark:hover:border-emerald-400/60',
    active ? 'cursor-pointer' : 'opacity-55 cursor-not-allowed',
  ].join(' ')

// ---- tiny http helper -------------------------------------------------------
async function j<T>(p: Promise<Response>) {
  const r = await p
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return (await r.json()) as T
}
const get = <T,>(url: string) => j<T>(fetch(url, { credentials: 'include' }))
const post = <T,>(url: string, body: any) =>
  j<T>(
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
const del = <T,>(url: string) =>
  j<T>(
    fetch(url, { method: 'DELETE', credentials: 'include' }),
  )

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

// ---- shared widgets ---------------------------------------------------------
function Card({
  title,
  actions,
  children,
}: {
  title: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl p-4 sm:p-5 backdrop-blur-xl bg-white/60 dark:bg-white/10 border border-white/40 dark:border-white/10 shadow-[0_1px_0_rgba(255,255,255,0.5),0_10px_30px_rgba(0,0,0,0.08)]">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  )
}

function Row({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-emerald-900/80 dark:text-emerald-100/80">{label}</span>
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
        'border-emerald-500/30 dark:border-emerald-400/20',
        'focus:outline-none focus:ring-2 focus:ring-emerald-400/40',
      ].join(' ')}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-9 rounded-xl px-3 text-sm bg-white/80 dark:bg-white/10 backdrop-blur border border-emerald-500/30 dark:border-emerald-400/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
    />
  )
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        'w-12 h-7 rounded-full border transition relative',
        checked ? 'bg-emerald-200/70 border-emerald-500/60' : 'bg-white/50 dark:bg-white/10 border-emerald-500/30',
      ].join(' ')}
      aria-pressed={checked}
    >
      <span
        className={[
          'absolute top-0.5 h-6 w-6 rounded-full shadow transition',
          checked ? 'translate-x-6 bg-emerald-500/90' : 'translate-x-0.5 bg-white',
        ].join(' ')}
      />
    </button>
  )
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

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
    <button type={type} disabled={disabled} onClick={onClick} className={ledClasses(!disabled)}>
      {children}
    </button>
  )
}

function DangerButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'relative inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium transition',
        'backdrop-blur-xl bg-white/70 dark:bg-white/10',
        'text-red-900 dark:text-red-200',
        'border border-red-500/40 dark:border-red-400/35',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
        'hover:border-red-500/60 dark:hover:border-red-400/60',
      ].join(' ')}
    >
      {children}
    </button>
  )
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
        const [
          s,
          m,
          p,
          r,
          ps,
          qt,
          c,
          rl,
          vers,
        ] = await Promise.all([
          get<PricingSettings>('/api/v1/pricing/settings/latest'),
          get<Material[]>('/api/v1/pricing/materials'),
          get<Printer[]>('/api/v1/pricing/printers'),
          get<LaborRole[]>('/api/v1/pricing/labor-roles'),
          get<ProcessStep[]>('/api/v1/pricing/process-steps'),
          get<QualityTier[]>('/api/v1/pricing/tiers'),
          get<Consumable[]>('/api/v1/pricing/consumables').catch(() => [] as Consumable[]),
          get<Rule[]>('/api/v1/admin/rules').catch(() => [] as Rule[]),
          get<VersionRow[]>('/api/v1/system/snapshot').catch(() => [] as VersionRow[]), // placeholder if you expose versions elsewhere
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

// ---- main page ---------------------------------------------------------------
export default function AdminPricing() {
  const boot = useBoot()
  const [tab, setTab] = useState<'global' | 'materials' | 'printers' | 'labor' | 'steps' | 'tiers' | 'consumables' | 'rules' | 'versions'>('global')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  if (boot.loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse h-10 w-48 rounded-full bg-white/50 dark:bg-white/10 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-white/50 dark:bg-white/10 backdrop-blur" />
          ))}
        </div>
      </div>
    )
  }

  if (boot.err) {
    return <div className="p-6 text-red-600">Error: {boot.err}</div>
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100">Pricing Admin</h1>
        <Toolbar>
          <nav className="flex flex-wrap gap-2">
            {(
              [
                ['global', 'Global'],
                ['materials', 'Materials'],
                ['printers', 'Printers'],
                ['labor', 'Labor'],
                ['steps', 'Process Steps'],
                ['tiers', 'Quality Tiers'],
                ['consumables', 'Consumables'],
                ['rules', 'Rules'],
                ['versions', 'Versions'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={[
                  'h-9 px-4 rounded-full text-sm transition border',
                  tab === id
                    ? 'backdrop-blur bg-white/70 dark:bg-white/10 border-emerald-500/50 text-emerald-900 dark:text-emerald-100'
                    : 'backdrop-blur bg-white/40 dark:bg-white/5 border-emerald-400/25 text-emerald-900/70 dark:text-emerald-100/70 hover:border-emerald-400/40',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </nav>
        </Toolbar>
      </header>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-full px-4 py-2 text-sm backdrop-blur bg-emerald-600/90 text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {tab === 'global' && <GlobalSettingsCard boot={boot} onSaved={() => setToast('Global settings saved')} />}
      {tab === 'materials' && <MaterialsCard boot={boot} onToast={setToast} />}
      {tab === 'printers' && <PrintersCard boot={boot} onToast={setToast} />}
      {tab === 'labor' && <LaborCard boot={boot} onToast={setToast} />}
      {tab === 'steps' && <StepsCard boot={boot} onToast={setToast} />}
      {tab === 'tiers' && <TiersCard boot={boot} onToast={setToast} />}
      {tab === 'consumables' && <ConsumablesCard boot={boot} onToast={setToast} />}
      {tab === 'rules' && <RulesCard boot={boot} onToast={setToast} />}
      {tab === 'versions' && <VersionsCard boot={boot} />}
    </div>
  )
}

// ---- individual sections -----------------------------------------------------

function GlobalSettingsCard({
  boot,
  onSaved,
}: {
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
    <Card
      title="Global Settings"
      actions={<LedButton onClick={save}>Publish new version</LedButton>}
    >
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
          <Input
            value={form.admin_note ?? ''}
            onChange={(e) => setForm({ ...form, admin_note: e.target.value })}
          />
        </Field>
      </Row>
    </Card>
  )
}

function MaterialsCard({
  boot,
  onToast,
}: {
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
    <Card
      title="Materials"
      actions={<LedButton onClick={add}>+ Add</LedButton>}
    >
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="text-emerald-900/70 dark:text-emerald-100/70">
            <tr>
              {['Name', 'Type', 'Cost/kg', 'Abrasive', 'Waste %', 'Enabled', ''].map((h) => (
                <th key={h} className="py-2 px-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-emerald-500/10">
                <td className="py-2 px-2">
                  <Input value={m.name} onChange={(e) => setRows(rs => rs.map(r => r.id===m.id?{...r, name:e.target.value}:r))} />
                </td>
                <td className="py-2 px-2">
                  <Select value={m.type} onChange={(e) => setRows(rs => rs.map(r => r.id===m.id?{...r, type: e.target.value as any}:r))}>
                    <option>FDM</option>
                    <option>SLA</option>
                  </Select>
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={m.cost_per_kg ?? 0}
                    onChange={(e) => setRows(rs => rs.map(r => r.id===m.id?{...r, cost_per_kg:number(e.target.value)}:r))}
                  />
                </td>
                <td className="py-2 px-2">
                  <Switch checked={m.abrasive} onChange={(v) => setRows(rs => rs.map(r => r.id===m.id?{...r, abrasive:v}:r))} />
                </td>
                <td className="py-2 px-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={m.waste_allowance_pct}
                    onChange={(e) => setRows(rs => rs.map(r => r.id===m.id?{...r, waste_allowance_pct:number(e.target.value)}:r))}
                  />
                </td>
                <td className="py-2 px-2">
                  <Switch checked={m.enabled} onChange={(v) => setRows(rs => rs.map(r => r.id===m.id?{...r, enabled:v}:r))} />
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
  boot,
  onToast,
}: {
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

  return (
    <Card title="Printers" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="text-emerald-900/70 dark:text-emerald-100/70">
            <tr>
              {['Name','Tech','W idle','W print','$/h base','Maint/h','Dep/h','Enabled',''].map(h=>(
                <th key={h} className="py-2 px-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p)=>(
              <tr key={p.id} className="border-t border-emerald-500/10">
                <td className="py-2 px-2"><Input value={p.name} onChange={(e)=>setRows(rs=>rs.map(r=>r.id===p.id?{...r,name:e.target.value}:r))}/></td>
                <td className="py-2 px-2">
                  <Select value={p.tech} onChange={(e)=>setRows(rs=>rs.map(r=>r.id===p.id?{...r,tech:e.target.value as any}:r))}>
                    <option>FDM</option><option>SLA</option>
                  </Select>
                </td>
                <td className="py-2 px-2"><Input type="number" value={p.watts_idle} onChange={(e)=>setRows(rs=>rs.map(r=>r.id===p.id?{...r,watts_idle:number(e.target.value)}:r))}/></td>
                <td className="py-2 px-2"><Input type="number" value={p.watts_printing} onChange={(e)=>setRows(rs=>rs.map(r=>r.id===p.id?{...r,watts_printing:number(e.target.value)}:r))}/></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={p.hourly_base_rate} onChange={(e)=>setRows(rs=>rs.map(r=>r.id===p.id?{...r,hourly_base_rate:number(e.target.value)}:r))}/></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={p.maintenance_rate_per_hour} onChange={(e)=>setRows(rs=>rs.map(r=>r.id===p.id?{...r,maintenance_rate_per_hour:number(e.target.value)}:r))}/></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={p.depreciation_per_hour} onChange={(e)=>setRows(rs=>rs.map(r=>r.id===p.id?{...r,depreciation_per_hour:number(e.target.value)}:r))}/></td>
                <td className="py-2 px-2"><Switch checked={p.enabled} onChange={(v)=>setRows(rs=>rs.map(r=>r.id===p.id?{...r,enabled:v}:r))}/></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={()=>update(p)}>Save</LedButton><DangerButton onClick={()=>remove(p.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function LaborCard({
  boot,
  onToast,
}: {
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
    <Card title="Labor Roles" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="text-emerald-900/70 dark:text-emerald-100/70">
            <tr>{['Name','Rate/h','Min bill (min)',''].map(h=><th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r)=>(
              <tr key={r.id} className="border-t border-emerald-500/10">
                <td className="py-2 px-2"><Input value={r.name} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===r.id?{...x,name:e.target.value}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={r.hourly_rate} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===r.id?{...x,hourly_rate:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" value={r.min_bill_minutes} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===r.id?{...x,min_bill_minutes:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={()=>update(r)}>Save</LedButton><DangerButton onClick={()=>remove(r.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function StepsCard({
  boot,
  onToast,
}: {
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
    <Card title="Process Steps" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="text-emerald-900/70 dark:text-emerald-100/70">
            <tr>{['Name','Default min','Role','Filter','x per cm³','Enabled',''].map(h=><th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((s)=>(
              <tr key={s.id} className="border-t border-emerald-500/10">
                <td className="py-2 px-2"><Input value={s.name} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===s.id?{...x,name:e.target.value}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" value={s.default_minutes} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===s.id?{...x,default_minutes:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2">
                  <Select value={s.labor_role_id} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===s.id?{...x,labor_role_id:e.target.value}:x))}>
                    {boot.roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </td>
                <td className="py-2 px-2">
                  <Select value={s.material_type_filter ?? ''} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===s.id?{...x,material_type_filter:(e.target.value||null) as any}:x))}>
                    <option value="">(all)</option><option>FDM</option><option>SLA</option>
                  </Select>
                </td>
                <td className="py-2 px-2"><Input type="number" step="0.0001" value={s.multiplier_per_cm3 ?? 0} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===s.id?{...x,multiplier_per_cm3:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2"><Switch checked={!!s.enabled} onChange={(v)=>setRows(rs=>rs.map(x=>x.id===s.id?{...x,enabled:v}:x))}/></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={()=>update(s)}>Save</LedButton><DangerButton onClick={()=>remove(s.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function TiersCard({
  boot,
  onToast,
}: {
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
    <Card title="Quality Tiers" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="text-emerald-900/70 dark:text-emerald-100/70">
            <tr>{['Name','Layer (mm)','Infill %','Support %','QC min','Multiplier','Notes',''].map(h=><th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((t)=>(
              <tr key={t.id} className="border-t border-emerald-500/10">
                <td className="py-2 px-2"><Input value={t.name} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===t.id?{...x,name:e.target.value}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={t.layer_height_mm ?? 0} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===t.id?{...x,layer_height_mm:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" value={t.infill_pct ?? 0} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===t.id?{...x,infill_pct:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" value={t.support_density_pct ?? 0} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===t.id?{...x,support_density_pct:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" value={t.qc_time_minutes} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===t.id?{...x,qc_time_minutes:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={t.price_multiplier} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===t.id?{...x,price_multiplier:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2"><Input value={t.notes ?? ''} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===t.id?{...x,notes:e.target.value}:x))}/></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={()=>update(t)}>Save</LedButton><DangerButton onClick={()=>remove(t.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ConsumablesCard({
  boot,
  onToast,
}: {
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
    <Card title="Consumables" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="text-emerald-900/70 dark:text-emerald-100/70">
            <tr>{['Name','Unit','Cost/unit','Usage/print',''].map(h=><th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((c)=>(
              <tr key={c.id} className="border-t border-emerald-500/10">
                <td className="py-2 px-2"><Input value={c.name} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===c.id?{...x,name:e.target.value}:x))}/></td>
                <td className="py-2 px-2"><Input value={c.unit} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===c.id?{...x,unit:e.target.value}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" step="0.01" value={c.cost_per_unit} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===c.id?{...x,cost_per_unit:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2"><Input type="number" step="0.0001" value={c.usage_per_print} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===c.id?{...x,usage_per_print:number(e.target.value)}:x))}/></td>
                <td className="py-2 px-2 flex gap-2"><LedButton onClick={()=>update(c)}>Save</LedButton><DangerButton onClick={()=>remove(c.id)}>Delete</DangerButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function RulesCard({
  boot,
  onToast,
}: {
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
      JSON.stringify(r.then_modifiers) // ensure serializable
      const u = await patch<Rule>(`/api/v1/admin/rules/${r.id}`, r)
      boot.setRules(boot.rules.map((x) => (x.id === u.id ? u : x)))
      setJsonErr(null)
      onToast('Rule updated')
    } catch (e: any) {
      setJsonErr('Invalid JSON in modifiers')
    }
  }
  const remove = async (id: UUID) => {
    await del(`/api/v1/admin/rules/${id}`)
    boot.setRules(boot.rules.filter((x) => x.id !== id))
    onToast('Rule deleted')
  }

  return (
    <Card title="Rules (advanced)" actions={<LedButton onClick={add}>+ Add</LedButton>}>
      {jsonErr && <div className="mb-2 text-sm text-red-600">{jsonErr}</div>}
      <div className="space-y-3">
        {rows.map((r)=>(
          <div key={r.id} className="rounded-xl p-3 border border-emerald-500/20 bg-white/60 dark:bg-white/10 backdrop-blur">
            <Row>
              <Field label="If expression (CEL-like)"><Input value={r.if_expression} onChange={(e)=>setRows(rs=>rs.map(x=>x.id===r.id?{...x,if_expression:e.target.value}:x))}/></Field>
              <Field label="Then modifiers (JSON)">
                <input
                  value={JSON.stringify(r.then_modifiers)}
                  onChange={(e)=>{
                    try {
                      const v = JSON.parse(e.target.value)
                      setRows(rs=>rs.map(x=>x.id===r.id?{...x,then_modifiers:v}:x))
                      setJsonErr(null)
                    } catch {
                      setJsonErr('Invalid JSON')
                    }
                  }}
                  className="h-9 rounded-xl px-3 text-sm bg-white/80 dark:bg-white/10 backdrop-blur border border-emerald-500/30 dark:border-emerald-400/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 font-mono"
                />
              </Field>
            </Row>
            <div className="mt-3 flex gap-2">
              <LedButton onClick={()=>update(r)}>Save</LedButton>
              <DangerButton onClick={()=>remove(r.id)}>Delete</DangerButton>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function VersionsCard({
  boot,
}: {
  boot: ReturnType<typeof useBoot>
}) {
  const [iso, setIso] = useState<string>(new Date().toISOString().slice(0,16))
  const publishFrom = async () => {
    await post<PricingSettings>('/api/v1/admin/pricing/settings', {
      ...boot.settings!,
      effective_from: new Date(iso).toISOString(),
    })
    // optimistic toast handled by parent if desired
  }

  return (
    <Card
      title="Versions & rollout"
      actions={<LedButton onClick={publishFrom}>Schedule activation</LedButton>}
    >
      <Row>
        <Field label="Activate at">
          <Input type="datetime-local" value={iso} onChange={(e)=>setIso(e.target.value)} />
        </Field>
        <div className="opacity-70 text-sm self-end">Active ID: <span className="font-mono">{boot.settings?.id}</span></div>
      </Row>

      <div className="mt-4 overflow-x-auto -mx-2 sm:mx-0">
        <table className="min-w-full text-sm">
          <thead className="text-emerald-900/70 dark:text-emerald-100/70">
            <tr>{['Version ID','Effective From','Note'].map(h=><th key={h} className="py-2 px-2 text-left font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {boot.versions.map(v=>(
              <tr key={v.id} className="border-t border-emerald-500/10">
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
