import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import PageLayout from '@/components/layout/PageLayout'
import PageHeader from '@/components/ui/PageHeader'
import EstimateCard from '@/components/estimate/EstimateCard'
import axios from '@/api/client'
import { toast } from 'sonner'

type NavState = {
  modelUrl?: string
  modelId?: string
  fileUrl?: string // in case the caller passes a resolved file URL
}

export default function Estimate() {
  const location = useLocation()
  const navState = (location.state || {}) as NavState
  const [searchParams] = useSearchParams()

  // Pull model hints from state first, then from query string
  const hintedModelUrl = useMemo(() => {
    return (
      navState.modelUrl ||
      navState.fileUrl ||
      searchParams.get('modelUrl') ||
      ''
    )
  }, [navState.modelUrl, navState.fileUrl, searchParams])

  const hintedModelId = useMemo(() => {
    return navState.modelId || searchParams.get('modelId') || ''
  }, [navState.modelId, searchParams])

  const [modelUrl, setModelUrl] = useState<string>(hintedModelUrl)

  // Preload filaments so the estimate form can populate its dropdown.
  useEffect(() => {
    axios
      .get('/filaments')
      .then(() => toast.success('Filaments loaded'))
      .catch(() => toast.error('Failed to load filaments'))
  }, [])

  // If we didn’t receive a direct URL but did get an ID, resolve it to a URL.
  useEffect(() => {
    let cancelled = false

    async function resolveModelUrlFromId(id: string) {
      try {
        // Adjust fields to your actual /models/{id} response shape
        const { data } = await axios.get(`/models/${encodeURIComponent(id)}`)
        const resolved =
          data?.primary_file_url ||
          data?.file_url ||
          data?.files?.[0]?.url ||
          ''
        if (!cancelled) {
          if (resolved) {
            setModelUrl(resolved)
          } else {
            toast.error('Could not resolve model URL from ID')
          }
        }
      } catch {
        if (!cancelled) toast.error('Failed to load model details')
      }
    }

    if (!modelUrl && hintedModelId) {
      resolveModelUrlFromId(hintedModelId)
    }

    return () => {
      cancelled = true
    }
  }, [hintedModelId, modelUrl])

  return (
    <PageLayout>
      <div className="space-y-6">
        <PageHeader title="Estimate Print Job" />
        {/* modelUrl may be empty if nothing was carried forward; EstimateCard should handle that */}
        <EstimateCard modelUrl={modelUrl} />
      </div>
    </PageLayout>
  )
}
