// components/water-quality/export-data.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Export picker + offline guard
 * - Blocks export if #wq-cards or #wq-charts has data-online="0"
 * - Lets user choose what to include: Cards, Temp, pH, DO (or All)
 * - One-page A4 (portrait), vertical stack aligned to TOP-LEFT
 */
export function ExportData() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [showOfflineAlert, setShowOfflineAlert] = useState(false);

  // selections (default: all checked)
  const [pickAll, setPickAll] = useState(true);
  const [pickCards, setPickCards] = useState(true);
  const [pickTemp, setPickTemp] = useState(true);
  const [pickPH, setPickPH] = useState(true);
  const [pickDO, setPickDO] = useState(true);

  const anyPicked = useMemo(
    () => pickCards || pickTemp || pickPH || pickDO,
    [pickCards, pickTemp, pickPH, pickDO]
  );

  // keep "All" in sync with individual picks
  useEffect(() => {
    setPickAll(pickCards && pickTemp && pickPH && pickDO);
  }, [pickCards, pickTemp, pickPH, pickDO]);

  const resetPicks = () => {
    // restore default = all selected
    toggleAll(true);
  };

  const toggleAll = (checked: boolean) => {
    setPickAll(checked);
    setPickCards(checked);
    setPickTemp(checked);
    setPickPH(checked);
    setPickDO(checked);
  };

  const checkOffline = () => {
    const cardsRoot = document.getElementById("wq-cards");
    const chartsRoot = document.getElementById("wq-charts");
    const cardsOnline = cardsRoot?.dataset?.online !== "0";  // default true
    const chartsOnline = chartsRoot?.dataset?.online !== "0"; // default true
    return { offline: !(cardsOnline && chartsOnline) };
  };

  const onClickExport = () => setOpen(true);

  const handleConfirm = async () => {
    const { offline } = checkOffline();
    if (offline) {
      setShowOfflineAlert(true);
      return;
    }

    try {
      setBusy(true);

      const [{ toPng }, jsPDFModule] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);
      const { jsPDF } = jsPDFModule as any;

      // build target list in fixed order so "All" is predictable
      const targets: HTMLElement[] = [];
      if (pickCards) {
        const el = document.getElementById("wq-cards");
        if (el) targets.push(el);
      }
      if (pickTemp) {
        const el = document.getElementById("chart-temp");
        if (el) targets.push(el);
      }
      if (pickPH) {
        const el = document.getElementById("chart-ph");
        if (el) targets.push(el);
      }
      if (pickDO) {
        const el = document.getElementById("chart-do");
        if (el) targets.push(el);
      }

      // if nothing selected (edge), fall back to all 4 if present
      if (!targets.length) {
        const all: (HTMLElement | null)[] = [
          document.getElementById("wq-cards"),
          document.getElementById("chart-temp"),
          document.getElementById("chart-ph"),
          document.getElementById("chart-do"),
        ];
        all.forEach((el) => el && targets.push(el));
      }

      if (!targets.length) {
        alert("Nothing to export — no cards or charts found.");
        return;
      }

      // snapshot each target
      const imgs: { dataUrl: string; w: number; h: number }[] = [];
      for (const el of targets) {
        const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: "#ffffff" });
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imgs.push({ dataUrl, w: img.naturalWidth, h: img.naturalHeight });
            resolve();
          };
          img.src = dataUrl;
        });
      }

      // === Single-page A4 PORTRAIT, top-left aligned vertical stack ===
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const margin = 36;
      const gap = 10;
      const headerH = 32;
      const footerH = 24;

      // Header
      const title = "AQUAFORECAST – Water Quality";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      const tw = doc.getTextWidth(title);
      doc.text(title, (pageW - tw) / 2, margin + 16);

      // content bounds
      const top = margin + headerH;
      const bottom = pageH - margin - footerH;
      const availH = bottom - top;
      const availW = pageW - margin * 2;

      // We cap each block to a reasonable maximum (for 1–3 items),
      // and auto-scale down if total would overflow.
      const n = imgs.length;              // 1..4
      const MAX_BLOCK_H = 260;            // pleasant size for 1–3 items
      const needed = n * MAX_BLOCK_H + (n - 1) * gap;
      const scaleDown = needed > availH ? availH / needed : 1;
      const blockH = MAX_BLOCK_H * scaleDown;

      // Start drawing from TOP-LEFT (no centering)
      let yCursor = top;

      imgs.forEach((img) => {
        const scaleW = availW / img.w;
        const scaleH = blockH / img.h;
        const scale = Math.min(scaleW, scaleH);
        const drawW = img.w * scale;
        const drawH = img.h * scale;

        const x = margin;     // left aligned
        const y = yCursor;    // top aligned

        doc.addImage(img.dataUrl, "PNG", x, y, drawW, drawH);

        yCursor += drawH + gap; // advance only by actual height + gap
      });

      // Footer
      const who = (user && (user.displayName || user.email)) || "Unknown user";
      const when = new Date().toLocaleString();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Generated on: ${when} • Generated by: ${who}`, margin, pageH - margin);

      doc.save(`AQUAFORECAST_WQ_${new Date().toISOString().slice(0, 10)}.pdf`);
      setOpen(false);
      resetPicks();
    } catch (e) {
      console.error(e);
      alert("Export failed. See console for details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={onClickExport} disabled={busy}>
        <Download className="h-4 w-4 mr-2" />
        {busy ? "Exporting..." : "Export Data"}
      </Button>

      {/* Offline alert */}
      <Dialog open={showOfflineAlert} onOpenChange={setShowOfflineAlert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Export blocked
            </DialogTitle>
          </DialogHeader>
          <Alert variant="destructive" className="border-red-300">
            <AlertDescription>
              Export is disabled while <b>Parameter Cards</b> or <b>Water Quality Charts</b> are offline.
              Restore sensor connectivity, then try again.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <DialogClose asChild>
              <Button>OK</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export picker */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetPicks(); // restore to "all selected" when closing
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose what to export</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="opt-all"
                checked={pickAll}
                onCheckedChange={(v) => toggleAll(Boolean(v))}
              />
              <Label htmlFor="opt-all" className="font-medium">
                All (cards + all graphs)
              </Label>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="opt-cards"
                  checked={pickCards}
                  onCheckedChange={(v) => setPickCards(Boolean(v))}
                />
                <Label htmlFor="opt-cards">Parameter Cards</Label>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="opt-temp"
                  checked={pickTemp}
                  onCheckedChange={(v) => setPickTemp(Boolean(v))}
                />
                <Label htmlFor="opt-temp">Temperature graph</Label>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="opt-ph"
                  checked={pickPH}
                  onCheckedChange={(v) => setPickPH(Boolean(v))}
                />
                <Label htmlFor="opt-ph">pH graph</Label>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  id="opt-do"
                  checked={pickDO}
                  onCheckedChange={(v) => setPickDO(Boolean(v))}
                />
                <Label htmlFor="opt-do">DO graph</Label>
              </div>
            </div>

            <Alert className="text-xs">
              <AlertDescription>
                Note: Export is disabled if either the Parameter Cards or the Charts are offline.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button onClick={handleConfirm} disabled={busy || !anyPicked}>
              {busy ? "Exporting..." : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
