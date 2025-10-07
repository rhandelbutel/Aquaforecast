"use client"

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

export function CalculationsExport() {
  const { user } = useAuth()

  const handleExport = () => {
    // Create calculations summary CSV
    const calculationsData = [
      ['Export Date', new Date().toISOString()],
      ['Exported By', user?.email || 'Unknown User'],
      ['Pond Name', 'Pond A'],
      [''],
      ['CALCULATION RESULTS'],
      [''],
      ['Feed Calculator'],
      ['Average Fish Weight (g)', '250'],
      ['Number of Fish', '1200'],
      ['Daily Feed Requirement (kg)', '9.0'],
      [''],
      ['Stocking Density'],
      ['Pond Area (m²)', '1000'],
      ['Fish Count', '1200'],
      ['Density (fish/m²)', '1.2'],
      ['Status', 'Optimal'],
      [''],
      ['Water Volume'],
      ['Pond Shape', 'Rectangular'],
      ['Length (m)', '50'],
      ['Width (m)', '20'],
      ['Depth (m)', '1.5'],
      ['Volume (m³)', '1500'],
      [''],
      ['Growth Rate'],
      ['Initial Weight (g)', '50'],
      ['Final Weight (g)', '250'],
      ['Growth Period (days)', '90'],
      ['SGR (%)', '1.85'],
      ['ADG (g)', '2.22']
    ]

    const csvContent = calculationsData.map(row => row.join(',')).join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `aquaforecast-calculations-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export Calculations
    </Button>
  )
}
