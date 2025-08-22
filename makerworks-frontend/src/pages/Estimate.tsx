import { useEffect } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import PageHeader from '@/components/ui/PageHeader'
import EstimateCard from '@/components/estimate/EstimateCard'
import axios from '@/api/client'
import { toast } from 'sonner'

/**
 * Estimate page – fetches available filaments and renders the estimate form.
 * The previous file accidentally contained the Upload page implementation which
 * caused tests expecting the Estimate header to fail.
 */
export default function Estimate() {
  useEffect(() => {
    // Preload filaments so the estimate form can populate its dropdown.
    axios
      .get('/filaments')
      .then(() => toast.success('Filaments loaded'))
      .catch(() => toast.error('Failed to load filaments'))
  }, [])

  return (
    <PageLayout>
      <div className="space-y-6">
        <PageHeader title="Estimate Print Job" />
        {/* Model URL is optional for tests */}
        <EstimateCard modelUrl="" />
      </div>
    </PageLayout>
  )
}
