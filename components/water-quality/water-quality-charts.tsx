"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const temperatureData = [
  { time: '00:00', value: 23.5 },
  { time: '04:00', value: 23.2 },
  { time: '08:00', value: 24.1 },
  { time: '12:00', value: 25.8 },
  { time: '16:00', value: 26.2 },
  { time: '20:00', value: 25.1 },
  { time: '24:00', value: 24.5 }
]

const phData = [
  { time: '00:00', value: 7.1 },
  { time: '04:00', value: 7.0 },
  { time: '08:00', value: 7.2 },
  { time: '12:00', value: 7.3 },
  { time: '16:00', value: 7.2 },
  { time: '20:00', value: 7.1 },
  { time: '24:00', value: 7.2 }
]

const oxygenData = [
  { time: '00:00', value: 8.5 },
  { time: '04:00', value: 8.8 },
  { time: '08:00', value: 8.2 },
  { time: '12:00', value: 7.9 },
  { time: '16:00', value: 8.1 },
  { time: '20:00', value: 8.4 },
  { time: '24:00', value: 8.2 }
]

const tdsData = [
  { time: '00:00', value: 445 },
  { time: '04:00', value: 448 },
  { time: '08:00', value: 452 },
  { time: '12:00', value: 455 },
  { time: '16:00', value: 460 },
  { time: '20:00', value: 458 },
  { time: '24:00', value: 450 }
]

export function WaterQualityCharts() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Temperature (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={temperatureData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#0891b2" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>pH Level (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={phData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={[6.5, 8.5]} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dissolved Oxygen (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={oxygenData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TDS (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={tdsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#dc2626" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
