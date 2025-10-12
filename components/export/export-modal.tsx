// components/export/export-modal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  captureById,
  buildPdfFromImages,
  buildPdfSinglePageFromImages,
  makeDefaultTargets,
  niceNow,
} from "@/lib/export-utils";
import type { UnifiedPond } from "@/lib/pond-context";
import { useAuth } from "@/lib/auth-context";          // 👈 NEW
import { useUser } from "@/lib/user-context";          // 👈 NEW

type Props = { open: boolean; onClose: () => void; pond: UnifiedPond };

export default function ExportModal({ open, onClose, pond }: Props) {
  const targets = useMemo(() => makeDefaultTargets(), []);
  const { user } = useAuth();            // 👈 email
  const { userProfile } = useUser();     // 👈 studentId lives here

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
    try {
      const chosen = targets.filter((t) => selected[t.id]);
      if (chosen.length === 0) {
        setBusy(false);
        setError("Pick at least one section to export.");
        return;
      }

      const images: Array<{ title: string; dataUrl: string }> = [];
      for (const t of chosen) {
        const dataUrl = await captureById(t.id);
        if (dataUrl) images.push({ title: t.title, dataUrl });
      }
      if (images.length === 0) {
        setBusy(false);
        setError("Nothing was captured. Are the sections visible on this page?");
        return;
      }

      const file = `${pond?.name || "Pond"}_${niceNow()}.pdf`;
      const footer = { email: user?.email ?? null, studentId };

      // using single-page builder (your UI has this fixed)
      await buildPdfSinglePageFromImages({ images, fileName: file, footer });

      onClose();
    } catch (e) {
      console.error(e);
      setError("Export failed. Check console for details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
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

          {/* Fixed single-page checkbox */}
          <label className="flex items-center gap-2">
            <Checkbox checked disabled />
            <span className="text-sm">Single page (fit to A4)</span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
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
