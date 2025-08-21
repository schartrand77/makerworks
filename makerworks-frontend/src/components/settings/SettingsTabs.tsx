// src/components/settings/SettingsTabs.tsx

import { useState } from 'react'
import clsx from 'clsx'

const tabs = ['Profile', 'Avatar', 'Theme', 'Account'] as const

type Tab = (typeof tabs)[number]

interface Props {
  currentTab: Tab
  onTabChange: (tab: Tab) => void
}

export default function SettingsTabs({ currentTab, onTabChange }: Props) {
  return (
    <div className="flex justify-center gap-4 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={clsx(
            'px-4 py-2 rounded-full font-medium backdrop-blur-sm border bg-transparent',
            'transition-all duration-300 ease-in-out',
            currentTab === tab
              ? 'border-brand-orange text-black dark:text-white'
              : 'border-transparent text-gray-500 hover:text-black dark:hover:text-white'
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
