import { User } from 'firebase/auth'

export interface SensorReading {
  timestamp: string
  ph: number
  temperature: number
  dissolvedOxygen: number
  tds: number
  status: string
}

export interface ExportData {
  user: {
    email: string
    exportDate: string
  }
  pond: {
    name: string
    id: string
  }
  sensorReadings: SensorReading[]
  analytics?: {
    averages: {
      ph: number
      temperature: number
      dissolvedOxygen: number
      tds: number
    }
    trends: {
      ph: string
      temperature: string
      dissolvedOxygen: string
      tds: string
    }
  }
}

// Mock sensor data - in real app this would come from Firebase
const generateSensorReadings = (): SensorReading[] => {
  const readings: SensorReading[] = []
  const now = new Date()
  
  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000))
    readings.push({
      timestamp: timestamp.toISOString(),
      ph: 7.0 + Math.random() * 0.5,
      temperature: 24 + Math.random() * 2,
      dissolvedOxygen: 8.0 + Math.random() * 0.5,
      tds: 440 + Math.random() * 20,
      status: Math.random() > 0.8 ? 'warning' : 'optimal'
    })
  }
  
  return readings.reverse()
}

export const exportToCSV = (user: User | null, includeAnalytics: boolean = false) => {
  const readings = generateSensorReadings()
  const exportData: ExportData = {
    user: {
      email: user?.email || 'Unknown User',
      exportDate: new Date().toISOString()
    },
    pond: {
      name: 'Pond A',
      id: 'A1'
    },
    sensorReadings: readings
  }

  if (includeAnalytics) {
    const avgPh = readings.reduce((sum, r) => sum + r.ph, 0) / readings.length
    const avgTemp = readings.reduce((sum, r) => sum + r.temperature, 0) / readings.length
    const avgDO = readings.reduce((sum, r) => sum + r.dissolvedOxygen, 0) / readings.length
    const avgTDS = readings.reduce((sum, r) => sum + r.tds, 0) / readings.length

    exportData.analytics = {
      averages: {
        ph: Number(avgPh.toFixed(2)),
        temperature: Number(avgTemp.toFixed(2)),
        dissolvedOxygen: Number(avgDO.toFixed(2)),
        tds: Number(avgTDS.toFixed(0))
      },
      trends: {
        ph: readings[0].ph < readings[readings.length - 1].ph ? 'increasing' : 'decreasing',
        temperature: readings[0].temperature < readings[readings.length - 1].temperature ? 'increasing' : 'decreasing',
        dissolvedOxygen: readings[0].dissolvedOxygen < readings[readings.length - 1].dissolvedOxygen ? 'increasing' : 'decreasing',
        tds: readings[0].tds < readings[readings.length - 1].tds ? 'increasing' : 'decreasing'
      }
    }
  }

  // Create CSV content
  const headers = [
    'Export Date',
    'Exported By',
    'Pond Name',
    'Timestamp',
    'pH Level',
    'Temperature (°C)',
    'Dissolved Oxygen (mg/L)',
    'TDS (ppm)',
    'Status'
  ]

  let csvContent = headers.join(',') + '\n'

  // Add data rows
  readings.forEach((reading, index) => {
    const row = [
      index === 0 ? exportData.user.exportDate : '',
      index === 0 ? exportData.user.email : '',
      index === 0 ? exportData.pond.name : '',
      reading.timestamp,
      reading.ph.toFixed(2),
      reading.temperature.toFixed(1),
      reading.dissolvedOxygen.toFixed(1),
      reading.tds.toFixed(0),
      reading.status
    ]
    csvContent += row.join(',') + '\n'
  })

  // Add analytics if included
  if (includeAnalytics && exportData.analytics) {
    csvContent += '\n--- ANALYTICS SUMMARY ---\n'
    csvContent += 'Parameter,Average Value,Trend\n'
    csvContent += `pH Level,${exportData.analytics.averages.ph},${exportData.analytics.trends.ph}\n`
    csvContent += `Temperature,${exportData.analytics.averages.temperature}°C,${exportData.analytics.trends.temperature}\n`
    csvContent += `Dissolved Oxygen,${exportData.analytics.averages.dissolvedOxygen} mg/L,${exportData.analytics.trends.dissolvedOxygen}\n`
    csvContent += `TDS,${exportData.analytics.averages.tds} ppm,${exportData.analytics.trends.tds}\n`
  }

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `aquaforecast-${exportData.pond.name.toLowerCase().replace(' ', '-')}-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
