import axios from './client'

export interface EstimatePayload {
  modelId: string
  volume: number
  filamentType: string
  filamentColor: string
  dimensions: { x: number; y: number; z: number }
  customText?: string
  printProfile?: 'standard' | 'quality' | 'elite'
}

export interface EstimateResult {
  cost: number
  time: string
  materialWeight: number
  materialCost: number
  printDurationSeconds: number
}

/**
 * Request an estimate for a given model & settings.
 */
export async function getEstimate(
  payload: EstimatePayload
): Promise<EstimateResult> {
  const res = await axios.post<EstimateResult>('/estimate/estimates/', payload)
  return res.data
}
