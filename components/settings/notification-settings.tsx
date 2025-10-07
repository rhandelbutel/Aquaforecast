import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Bell } from 'lucide-react'

export function NotificationSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Bell className="h-5 w-5 mr-2" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="critical-alerts">Critical Alerts</Label>
          <Switch id="critical-alerts" defaultChecked />
        </div>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="harvest-reminders">Harvest Reminders</Label>
          <Switch id="harvest-reminders" defaultChecked />
        </div>
      </CardContent>
    </Card>
  )
}
