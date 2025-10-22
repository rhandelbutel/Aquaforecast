// components/analytics/analytics-export.tsx
"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { captureById, buildPdfSinglePageFromImages, niceNow } from "@/lib/export-utils"

export function AnalyticsExport() {
  const { user } = useAuth()

  // Helper to hide UI-only elements during export
  const hideExportOnly = () => {
    const elems = Array.from(document.querySelectorAll<HTMLElement>("[data-export-hide]"))
    const states = elems.map(el => ({ el, prev: el.style.display }))
    elems.forEach(el => { el.style.display = "none" })
    return () => { states.forEach(s => { s.el.style.display = s.prev }) }
  }

  // Helper to inject hidden export blocks (like tables)
  const injectTempBlocks = (wrapper: HTMLElement) => {
    const summaries = Array.from(document.querySelectorAll<HTMLElement>('[data-export="analytics-summary"]'))
    const feedTables = Array.from(document.querySelectorAll<HTMLElement>('[data-export="feeding-history"]'))
    const sources = [...summaries, ...feedTables]
    if (!sources.length) return null

    const container = document.createElement("div")
    container.id = "temp-export-injected-blocks"
    container.style.marginTop = "16px"
    for (const src of sources) {
      const clone = src.cloneNode(true) as HTMLElement
      clone.className = clone.className.replace(/\bhidden\b/g, "")
      clone.style.display = "block"
      container.appendChild(clone)
    }
    wrapper.appendChild(container)
    return container
  }

  const handleExport = async () => {
    const exportElementId = "export-analytics-section"
    const exportElement = document.getElementById(exportElementId)
    if (!exportElement) {
      alert("Export container not found. Cannot export.")
      return
    }

    const styleTag = document.createElement("style")
    styleTag.id = "temp-print-styles"
    styleTag.innerHTML = `
      body > * { visibility: hidden !important; }
      #${exportElementId}, #${exportElementId} * { visibility: visible !important; }
      #${exportElementId} {
        position: absolute !important;
        left: 0 !important; top: 0 !important;
        width: 900px !important;
        background: white !important;
        padding: 24px !important; margin: 0 !important;
        border-radius: 0 !important; box-shadow: none !important;
      }
    `

    let dataUrl: string | null = null
    let injectedBlocks: HTMLElement | null = null
    let restoreHiddenElements: () => void = () => {}

    try {
      document.head.appendChild(styleTag)
      restoreHiddenElements = hideExportOnly()
      injectedBlocks = injectTempBlocks(exportElement)

      // --- KEY CHANGE: Increased delay for all components to render ---
      await new Promise(resolve => setTimeout(resolve, 1300))

      dataUrl = await captureById(exportElementId, { width: 1024 })

    } catch (error) {
      console.error("Error during PDF export:", error)
      alert("An error occurred while exporting.")
    } finally {
      if (injectedBlocks) exportElement.removeChild(injectedBlocks)
      restoreHiddenElements()
      document.head.removeChild(styleTag)
    }

    if (!dataUrl) {
      alert("Failed to capture content for export.")
      return
    }

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