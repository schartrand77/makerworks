// src/components/ui/FilamentFanoutPicker.tsx

import { useEffect, useState } from 'react'
import { useEstimateStore } from '@/store/useEstimateStore'
import axios from '@/api/client'
import GlassCard from '@/components/ui/GlassCard'
import { X } from 'lucide-react'
import { bgClassFromHex } from '@/lib/colorMap'

interface Filament {
  id: string
  category: string
  type: string
  color: string
  hex: string
}

type Step = 'category' | 'type' | 'color'

const MAX_COLORS = 4

export default function FilamentFanoutPicker() {
  const [filaments, setFilaments] = useState<Filament[]>([])
  const [step, setStep] = useState<Step>('category')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string | null>(null)

  const colorsStore = useEstimateStore((s) => s)
  const selectedColors = Array.isArray(colorsStore?.form?.colors)
    ? colorsStore.form.colors
    : []
  const setForm = typeof colorsStore?.setForm === 'function'
    ? colorsStore.setForm
    : () => {}

  const handleAddColor = (color: Filament) => {
    const alreadySelected = selectedColors.includes(color.hex)
    if (!alreadySelected && selectedColors.length < MAX_COLORS) {
      setForm({ colors: [...selectedColors, color.hex] })
    }
  }

  const handleRemoveColor = (hex: string) => {
    setForm({ colors: selectedColors.filter((c) => c !== hex) })
  }

  useEffect(() => {
    axios.get('/filaments').then((res) => setFilaments(res.data))
  }, [])

  const categories = Array.from(new Set(filaments.map((f) => f.category)))
  const types = selectedCategory
    ? Array.from(new Set(filaments.filter((f) => f.category === selectedCategory).map((f) => f.type)))
    : []
  const colors = selectedType
    ? filaments.filter((f) => f.category === selectedCategory && f.type === selectedType)
    : []

  return (
    <GlassCard className="w-full">
      <h2 className="text-xl font-bold mb-4 text-zinc-200">🎨 Select Filament</h2>

      {/* Selected Colors */}
      {selectedColors.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {selectedColors.map((hex, idx) => {
            return (
              <div
                key={idx}
                className={`relative w-10 h-10 rounded-full border-2 border-white/20 shadow-inner ${bgClassFromHex(hex)}`}
              >
                <button
                  onClick={() => handleRemoveColor(hex)}
                  className="absolute -top-2 -right-2 bg-zinc-800 text-white rounded-full p-0.5 hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Picker logic */}
      {selectedColors.length < MAX_COLORS && (
        <>
          {step === 'category' && (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat)
                    setStep('type')
                  }}
                  className="text-sm px-4 py-1.5 rounded-full text-zinc-300 bg-blue-500/10 hover:bg-blue-500/20 transition"
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {step === 'type' && selectedCategory && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {types.map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type)
                      setStep('color')
                    }}
                    className="text-sm px-4 py-1.5 rounded-full text-zinc-300 bg-blue-500/10 hover:bg-blue-500/20 transition"
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setSelectedCategory(null)
                  setStep('category')
                }}
                className="text-xs text-zinc-400 underline mt-2"
              >
                ← Back to Category
              </button>
            </div>
          )}

          {step === 'color' && selectedType && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-4 gap-4">
                {colors.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => handleAddColor(color)}
                    className="flex flex-col items-center p-2 rounded-lg hover:scale-105 transition bg-white/5 hover:bg-white/10 border border-white/10"
                  >
                    <div
                      className={`w-8 h-8 rounded-full border-2 shadow-inner ${bgClassFromHex(color.hex)}`}
                    />
                    <span className="text-xs mt-1 text-zinc-300">{color.color}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-between mt-4">
                <button
                  onClick={() => setStep('type')}
                  className="text-xs text-zinc-400 underline"
                >
                  ← Back to Type
                </button>
                <button
                  onClick={() => {
                    setSelectedCategory(null)
                    setSelectedType(null)
                    setStep('category')
                  }}
                  className="text-xs text-zinc-400 underline"
                >
                  ⟳ Start Over
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}
