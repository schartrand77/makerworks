import React from 'react'

interface GlassInputProps {
  id: string
  type?: string
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  required?: boolean
}

const GlassInput: React.FC<GlassInputProps> = ({
  id,
  type = 'text',
  label,
  value,
  onChange,
  placeholder,
  required = true,
}) => (
  <div className="space-y-1">
    <label
      htmlFor={id}
      className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
    >
      {label}
    </label>
    <input
      id={id}
      type={type}
      aria-label={label}
      placeholder={placeholder || label}
      required={required}
      value={value}
      onChange={onChange}
      className="w-full px-4 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white text-black dark:bg-zinc-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange"
    />
  </div>
)

export default GlassInput
