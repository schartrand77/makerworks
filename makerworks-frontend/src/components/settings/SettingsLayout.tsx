// src/components/settings/SettingsLayout.tsx

import { ReactNode } from 'react'

const tabs = ['Profile', 'Account', 'Theme', 'Avatar'] as const
type Tab = (typeof tabs)[number]

interface SettingsLayoutProps {
  children: ReactNode
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

export default function SettingsLayout({
  children,
  activeTab,
  onTabChange,
}: SettingsLayoutProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-center gap-2 rounded-xl backdrop-blur-md bg-white/5 p-3 border border-white/10 shadow-inner">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`text-sm px-3 py-1 rounded-full transition-all duration-200
              ${
                activeTab === tab
                  ? 'bg-sky-500/80 text-white border border-sky-200/30 shadow'
                  : 'bg-sky-500/10 text-gray-300 hover:bg-sky-500/20'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-xl">
        {children}
      </div>
    </div>
  )
}
