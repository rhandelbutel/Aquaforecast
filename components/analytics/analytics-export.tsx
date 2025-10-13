"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { captureById, buildPdfSinglePageFromImages, niceNow } from "@/lib/export-utils"

export function AnalyticsExport() {
  const { user } = useAuth()

  // Clone all hidden feeding-history tables into the export wrapper for capture
  const injectTempTables = () => {
    const wrapper = document.getElementById("export-analytics-section")
    if (!wrapper) return null

    // Find all source nodes (the hidden tables living inside each FeedingHistory)
    const sources = Array.from(
      document.querySelectorAll<HTMLElement>('[data-export="feeding-history"]')
    )
    if (!sources.length) return null

    // Create a temp container inside the wrapper so clones are within capture bounds
    const container = document.createElement("div")
    container.id = "temp-export-injected-feeding"
    container.style.marginTop = "16px"

    // Add a subtle heading (optional)
    const h = document.createElement("h3")
    h.textContent = "Feeding Details"
    h.style.fontSize = "14px"
    h.style.fontWeight = "600"
    h.style.margin = "8px 0 12px 0"
    h.style.color = "#111827"
    container.appendChild(h)

    // Clone each hidden table and make it visible
    for (const src of sources) {
      const clone = src.cloneNode(true) as HTMLElement
      // remove 'hidden' and any display:none
      clone.className = clone.className.replace(/\bhidden\b/g, "")
      clone.style.display = "block"
      clone.style.opacity = "1"
      clone.style.position = "static"     // ensure it flows inside container
      clone.style.margin = "0 0 16px 0"
      // keep the width you used for crisp rendering
      if (!clone.style.width) clone.style.width = "720px"

      container.appendChild(clone)
    }

    // Append to wrapper so html-to-image captures it
    wrapper.appendChild(container)
    return container
  }

  const handleExport = async () => {
    // 1) Inject visible clones of the hidden tables
    const injected = injectTempTables()
    // Let the browser paint
    await new Promise((r) => setTimeout(r, 40))

    // 2) Capture the whole analytics section
    const dataUrl = await captureById("export-analytics-section")

    // 3) Cleanup injected nodes
    if (injected && injected.parentElement) injected.parentElement.removeChild(injected)

    if (!dataUrl) {
      alert("Nothing to export.")
      return
    }

    // 4) Build PDF
    await buildPdfSinglePageFromImages({
      images: [{ title: "Analytics Summary", dataUrl }],
      fileName: `Analytics_${niceNow()}.pdf`,
      footer: { email: user?.email ?? "" },
      headerBrand: "AQUAFORECAST",
    })
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export Analytics
    </Button>
  )
}
