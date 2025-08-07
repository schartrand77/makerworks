// src/store/useEstimateStore.ts
import { create } from 'zustand'

interface EstimateForm {
  x_mm: number
  y_mm: number
  z_mm: number
  filament_type?: string
  colors?: string[]
  custom_text?: string
  print_profile?: string
}

interface EstimateResult {
  estimated_time_minutes: number
  estimated_cost_usd: number
}

interface EstimateState {
  form: EstimateForm
  estimateResult: EstimateResult | null
  activeModel: any
  setForm: (updates: Partial<EstimateForm>) => void
  setEstimateResult: (result: EstimateResult | null) => void
  setActiveModel: (model: any) => void
}

export const useEstimateStore = create<EstimateState>((set) => ({
  form: {
    x_mm: 100,
    y_mm: 100,
    z_mm: 100,
    colors: [],
    print_profile: 'standard',
  },
  estimateResult: null,
  activeModel: null,
  setForm: (updates) =>
    set((state) => ({ form: { ...state.form, ...updates } })),
  setEstimateResult: (result) => set({ estimateResult: result }),
  setActiveModel: (model) => set({ activeModel: model }),
}))
