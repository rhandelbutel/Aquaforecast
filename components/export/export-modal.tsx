// components/export/export-modal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  captureById,
  buildPdfSinglePageFromImages,
  makeDefaultTargets,
  niceNow,
} from "@/lib/export-utils";
import type { UnifiedPond } from "@/lib/pond-context";
import { useAuth } from "@/lib/auth-context";
import { useUser } from "@/lib/user-context";

type Props = { open: boolean; onCloseAction: () => void; pond: UnifiedPond };

export default function ExportModal({ open, onCloseAction, pond }: Props) {
  const targets = useMemo(() => makeDefaultTargets(), []);
  const { user } = useAuth();
  const { userProfile } = useUser();

  const studentId =
    (userProfile as any)?.studentId ||
    (userProfile as any)?.studentID ||
    (userProfile as any)?.student_id ||
    null;

  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(targets.map((t) => [t.id, true]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(Object.fromEntries(targets.map((t) => [t.id, true])));
  }, [targets]);

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const onExport = async () => {
    setBusy(true);
    setError(null);

    // 1. Define the desktop width and create the style override
    const DESKTOP_WIDTH = 1024;
    const styleTag = document.createElement("style");
    styleTag.id = "temp-dashboard-print-styles";
    // This CSS forces the main content area of your page to a fixed width.
    // We assume your page content is inside a <main> tag, which is standard.
    styleTag.innerHTML = `
      main {
        width: ${DESKTOP_WIDTH}px !important;
        max-width: ${DESKTOP_WIDTH}px !important;
        margin: 0 auto !important;
      }
    `;

    try {
      const chosen = targets.filter((t) => selected[t.id]);
      if (chosen.length === 0) {
        setError("Pick at least one section to export.");
        setBusy(false);
        return;
      }

      // 2. Apply the styles and wait for the page to re-render
      document.head.appendChild(styleTag);
      await new Promise(resolve => setTimeout(resolve, 200));

      const images: Array<{ title: string; dataUrl: string }> = [];
      for (const t of chosen) {
        // 3. Capture each element, telling the library to use the desktop width
        const dataUrl = await captureById(t.id, { width: DESKTOP_WIDTH });
        if (dataUrl) images.push({ title: t.title, dataUrl });
      }

      if (images.length === 0) {
        setError("Nothing was captured. Are the sections visible on this page?");
        setBusy(false);
        return;
      }

      const file = `${pond?.name || "Pond"}_${niceNow()}.pdf`;
      const footer = { email: user?.email ?? null, studentId };

      await buildPdfSinglePageFromImages({ images, fileName: file, footer });

      onCloseAction();
    } catch (e) {
      console.error(e);
      setError("Export failed. Check console for details.");
    } finally {
      // 4. CRITICAL: Always remove the temporary stylesheet to restore the page
      setBusy(false);
      const existingStyleTag = document.getElementById(styleTag.id);
      if (existingStyleTag) {
        document.head.removeChild(existingStyleTag);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onCloseAction() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export data (current view)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The export captures exactly what you see now (status chips like <b>optimal</b>/<b>warning</b>/<b>danger</b>/<b>offline</b> are preserved).
          </p>

          <div className="border rounded-md p-3 space-y-2">
            {targets.map((t) => {
              const label = t.label || t.title || t.id;
              return (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={!!selected[t.id]} onCheckedChange={() => toggle(t.id)} disabled={busy} />
                  <span className="text-sm">{label}</span>
                </label>
              );
            })}
          </div>

          <label className="flex items-center gap-2">
            <Checkbox checked disabled />
            <span className="text-sm">Single page (fit to A4)</span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCloseAction} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onExport} disabled={busy}>
              {busy ? "Building PDF..." : "Export PDF"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
