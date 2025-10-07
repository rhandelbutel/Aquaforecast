"use client"

import { useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X, AlertTriangle, Info, CheckCircle } from 'lucide-react'
import { usePonds } from '@/lib/pond-context'

interface NotificationPanelProps {
  onClose: () => void
}

const generateNotifications = (ponds: any[]) => {
  if (ponds.length === 0) return []
  
  const notifications = []
  
  ponds.forEach((pond) => {
    const stockingDensity = pond.fishCount / pond.area
    
    if (stockingDensity > 5) {
      notifications.push({
        id: `density-${pond.id}`,
        type: 'warning',
        title: 'High Stocking Density',
        message: `${pond.name}: ${stockingDensity.toFixed(1)} fish/m² exceeds optimal range`,
        time: '15 minutes ago',
        read: false
      })
    }
    
    if (pond.feedingFrequency < 2) {
      notifications.push({
        id: `feeding-${pond.id}`,
        type: 'info',
        title: 'Feeding Optimization',
        message: `${pond.name}: Consider increasing feeding frequency for ${pond.fishSpecies}`,
        time: '1 hour ago',
        read: false
      })
    }
  })
  
  return notifications.slice(0, 3)
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'critical': return AlertTriangle
    case 'warning': return AlertTriangle
    case 'info': return Info
    default: return CheckCircle
  }
}

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'critical': return 'text-red-600'
    case 'warning': return 'text-yellow-600'
    case 'info': return 'text-blue-600'
    default: return 'text-gray-600'
  }
}

const getBadgeColor = (type: string) => {
  switch (type) {
    case 'critical': return 'bg-red-100 text-red-800'
    case 'warning': return 'bg-yellow-100 text-yellow-800'
    case 'info': return 'bg-blue-100 text-blue-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { ponds } = usePonds()
  const notifications = generateNotifications(ponds)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 pt-16">
      <div ref={panelRef} className="bg-white shadow-lg max-w-md mx-auto">
        <Card className="rounded-none border-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Notifications</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {ponds.length === 0 ? (
              <div className="text-center py-8">
                <Info className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No notifications</p>
                <p className="text-sm text-gray-400 mt-1">Add a pond to start receiving alerts</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-4" />
                <p className="text-green-600 font-medium">All clear!</p>
                <p className="text-sm text-gray-500 mt-1">No notifications at this time</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => {
                  const Icon = getNotificationIcon(notification.type)
                  return (
                    <div
                      key={notification.id}
                      className={`p-3 border rounded-lg ${!notification.read ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-start space-x-3">
                        <Icon className={`h-5 w-5 mt-0.5 ${getNotificationColor(notification.type)}`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-medium text-sm">{notification.title}</h4>
                            <Badge className={getBadgeColor(notification.type)}>
                              {notification.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">{notification.message}</p>
                          <p className="text-xs text-gray-500">{notification.time}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            
            {notifications.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <Button variant="outline" className="w-full" onClick={onClose}>
                  Mark All as Read
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
