"use client"

import { useState } from 'react'
import { Fish, Menu, Bell } from 'lucide-react'
import { NotificationPanel } from '../notifications/notification-panel'
import { usePonds } from '@/lib/pond-context'

interface MobileHeaderProps {
  onMenuClick: () => void
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false)
  const { ponds } = usePonds()
  
  // Calculate notification count based on pond conditions
  const getNotificationCount = () => {
    if (ponds.length === 0) return 0
    
    let count = 0
    ponds.forEach((pond) => {
      const stockingDensity = pond.fishCount / pond.area
      if (stockingDensity > 5) count++
      if (pond.feedingFrequency < 2) count++
    })
    return Math.min(count, 9) // Cap at 9 for display
  }

  const notificationCount = getNotificationCount()

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm border-b">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center">
            <button 
              onClick={onMenuClick}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg mr-2"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Fish className="h-6 w-6 text-cyan-600" />
            <span className="ml-2 text-lg font-bold text-gray-900">AQUAFORECAST</span>
          </div>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-gray-600 hover:text-gray-900 relative"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {showNotifications && (
        <NotificationPanel onClose={() => setShowNotifications(false)} />
      )}
    </>
  )
}
