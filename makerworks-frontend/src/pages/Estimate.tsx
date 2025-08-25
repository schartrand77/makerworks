import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import PageLayout from '@/components/layout/PageLayout'
import PageHeader from '@/components/ui/PageHeader'
import EstimateCard from '@/components/estimate/EstimateCard'

type NavState = {
  modelUrl?: string
  modelId?: string
  fileUrl?: string
}

export default function Estimate() {
  const location = useLocation()
  const navState = (location.state || {}) as NavState
  const [searchParams] = useSearchParams()

  const hintedModelUrl = useMemo(
    () => navState.modelUrl || navState.fileUrl || searchParams.get('modelUrl') || '',
    [navState.modelUrl, navState.fileUrl, searchParams]
  )

  const hintedModelId = useMemo(
    () => navState.modelId || searchParams.get('modelId') || '',
    [navState.modelId, searchParams]
  )

  const [modelUrl, setModelUrl] = useState<string>(hintedModelUrl)

  // Resolve model URL from id if needed
  useEffect(() => {
    let cancelled = false
    async function run(id: string) {
      try {
        const r = await fetch(`/api/v1/models/${encodeURIComponent(id)}`, { credentials: 'include' })
        const data = await r.json().catch(() => ({}))
        const resolved =
          data?.primary_file_url || data?.file_url || data?.files?.[0]?.url || ''
        if (!cancelled && resolved) setModelUrl(resolved)
      } catch {
        /* ignore */
      }
    }
    if (!modelUrl && hintedModelId) run(hintedModelId)
    return () => {
      cancelled = true
    }
  }, [hintedModelId, modelUrl])

  return (
    <PageLayout>
      <div className="space-y-6">
        <PageHeader title="Estimate Print Job" />
        <EstimateCard modelUrl={modelUrl} />
      </div>
    </PageLayout>
  )
}
