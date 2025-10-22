// components/dashboard/ai-insights.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, AlertTriangle, XCircle, Lightbulb } from "lucide-react";
import {
  subscribeDashInsights,
  resolveDashInsight,
  type DashInsight,
  // NOTE: don't import LiveReading to avoid forcing a 'tds' field
  type PondLite,
  detectRealtimeFindingsDash,
  resolveAllWaterInsightsForOffline,
} from "@/lib/dash-insights-service";
import { useAquaSensors } from "@/hooks/useAquaSensors";

const iconFor = (sev: DashInsight["severity"]) =>
  sev === "error" ? XCircle : sev === "warning" ? AlertTriangle : Info;

const badgeFor = (sev: DashInsight["severity"]) =>
  sev === "error"
    ? "bg-red-100 text-red-800"
    : sev === "warning"
    ? "bg-amber-100 text-amber-800"
    : "bg-blue-100 text-blue-800";

const ESP32_BASE =
  (process.env.NEXT_PUBLIC_SENSORS_BASE as string | undefined) || "http://aquamon.local";

// TDS removed
const DIFF = { temp: 0.5, ph: 0.2, do: 0.2 };

// Change this to 10000 if you want 10s
const OFFLINE_CLEAR_DELAY_MS = 5_000;

export function AIInsightsCard({ pondId, pondName }: { pondId: string; pondName?: string }) {
  const [items, setItems] = useState<DashInsight[]>([]);

  useEffect(() => {
    if (!pondId) return;
    return subscribeDashInsights(pondId, setItems);
  }, [pondId]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      items.forEach((it) => {
        if (it.status === "active" && it.autoResolveAt && it.autoResolveAt <= now && it.id) {
          void resolveDashInsight(pondId, it.id);
        }
      });
    }, 5_000);
    return () => clearInterval(t);
  }, [items, pondId]);

  const { data, isOnline } = useAquaSensors({ baseUrl: ESP32_BASE, intervalMs: 1000 });

  
  const lastSentRef = useRef<{ ts: number; temp: number; ph: number; do: number } | null>(null);

  useEffect(() => {
    if (!pondId || !isOnline || !data) return;

    const now = Date.now();
    const last = lastSentRef.current;

    const changedEnough =
      !last ||
      Math.abs((data.temp ?? NaN) - (last.temp ?? NaN)) >= DIFF.temp ||
      Math.abs((data.ph ?? NaN) - (last.ph ?? NaN)) >= DIFF.ph ||
      Math.abs((data.do ?? NaN) - (last.do ?? NaN)) >= DIFF.do ||
      now - (last.ts || 0) >= 3000;

    if (!changedEnough) return;

    // Build reading without TDS
    const reading = {
      ts: now,
      temp: Number(data.temp ?? NaN),
      ph: Number(data.ph ?? NaN),
      do: Number(data.do ?? NaN),
    };

    const pondLite: PondLite = { id: pondId, name: pondName };
    
    void detectRealtimeFindingsDash(pondLite, reading as any).catch(() => {});

    lastSentRef.current = { ts: now, temp: reading.temp, ph: reading.ph, do: reading.do };
  }, [pondId, pondName, data, isOnline]);

  // --- OFFLINE CLEAR WITH INITIAL-STATE COVERAGE ---
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!pondId) return;

    // If currently offline and no timer yet, schedule a clear.
    if (isOnline === false && !offlineTimerRef.current) {
      offlineTimerRef.current = setTimeout(() => {
        void resolveAllWaterInsightsForOffline(pondId).finally(() => {
          offlineTimerRef.current = null;
        });
      }, OFFLINE_CLEAR_DELAY_MS);
    }

    // If we come back online, cancel any pending clear.
    if (isOnline === true && offlineTimerRef.current) {
      clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }

    // Cleanup when pond switches
    return () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    };
  }, [isOnline, pondId]);
  // -----------------------------------------------

  const display = useMemo(() => {
    const rank = (s: DashInsight["severity"]) =>
      s === "error" ? 3 : s === "danger" ? 2 : s === "warning" ? 1 : 0;
    return items
      .filter((i) => i.status === "active")
      .slice()
      .sort((a, b) => (rank(b.severity) - rank(a.severity)) || (b.createdAt - a.createdAt))
      .slice(0, 6);
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <Lightbulb className="h-5 w-5 mr-2 text-yellow-600" />
          Insights & Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {display.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active insights. Tips appear when sensors or logs indicate something important.
          </p>
        ) : (
          <div className="space-y-3">
            {display.map((it) => {
              const Icon = iconFor(it.severity);
              return (
                <div key={it.id ?? it.key} className="flex items-start gap-3 p-4 border rounded-lg">
                  <Icon
                    className={`h-5 w-5 mt-0.5 ${
                      it.severity === "error"
                        ? "text-red-600"
                        : it.severity === "warning"
                        ? "text-amber-600"
                        : "text-blue-600"
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{it.title}</h3>
                      <Badge className={badgeFor(it.severity)}>{it.severity}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{it.message}</p>
                    {it.suggestedAction && (
                      <p className="text-xs mt-2">
                        <span className="font-medium">Do this:</span> {it.suggestedAction}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
