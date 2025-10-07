"use client"

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { MobileLayout } from './mobile-layout'

export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <MobileLayout>
        {children}
      </MobileLayout>
    </div>
  )
}
