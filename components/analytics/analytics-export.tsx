// components/analytics/analytics-export.tsx
"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { captureById, buildPdfSinglePageFromImages, niceNow } from "@/lib/export-utils"

export function AnalyticsExport() {
  const { user } = useAuth()

  // Temporarily hide anything marked as export-hide (e.g., Efficiency Tips)
  const hideExportOnly = () => {
    const elems = Array.from(document.querySelectorAll<HTMLElement>("[data-export-hide]"))
    const states = elems.map(el => ({ el, prev: el.style.display }))
    elems.forEach(el => { el.style.display = "none" })
    return () => { states.forEach(s => { s.el.style.display = s.prev }) }
  }

  // Clone hidden export blocks into the wrapper (❗️summary first, then feeding history)
  const injectTempBlocks = () => {
    const wrapper = document.getElementById("export-analytics-section")
    if (!wrapper) return null

    // ⬇️ Get export-only blocks in the order we want in the PDF
    const summaries = Array.from(
      document.querySelectorAll<HTMLElement>('[data-export="analytics-summary"]')
    )
    const feedTables = Array.from(
      document.querySelectorAll<HTMLElement>('[data-export="feeding-history"]')
    )

    const sources = [...summaries, ...feedTables] // ✅ summary on top, then feeding

    if (!sources.length) return null

    const container = document.createElement("div")
    container.id = "temp-export-injected-blocks"
    container.style.marginTop = "16px"

    for (const src of sources) {
      const clone = src.cloneNode(true) as HTMLElement
      clone.className = clone.className.replace(/\bhidden\b/g, "")
      clone.style.display = "block"
      clone.style.opacity = "1"
      clone.style.position = "static"
      clone.style.margin = "0 0 16px 0"
      if (!clone.style.width) clone.style.width = "720px"
      container.appendChild(clone)
    }

    wrapper.appendChild(container)
    return container
  }

  const handleExport = async () => {
    // 1) Hide UI-only elements for export (e.g., Efficiency Tips)
    const restoreHidden = hideExportOnly()

    // 2) Inject visible clones of hidden export blocks in our preferred order
    const injected = injectTempBlocks()
    await new Promise((r) => setTimeout(r, 40)) // allow layout/paint

    // 3) Capture
    const dataUrl = await captureById("export-analytics-section")

    // 4) Cleanup
    if (injected?.parentElement) injected.parentElement.removeChild(injected)
    restoreHidden()

    if (!dataUrl) {
      alert("Nothing to export.")
      return
    }

    // 5) Build PDF
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
