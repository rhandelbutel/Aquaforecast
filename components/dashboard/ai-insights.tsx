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
  type LiveReading,
  type PondLite,
  detectRealtimeFindingsDash,
  resolveAllWaterInsightsForOffline, // used when going offline (with delay)
} from "@/lib/dash-insights-service";
import { useAquaSensors } from "@/hooks/useAquaSensors";

// Icons / badges
const iconFor = (sev: DashInsight["severity"]) =>
  sev === "error" ? XCircle : sev === "warning" ? AlertTriangle : Info;

const badgeFor = (sev: DashInsight["severity"]) =>
  sev === "error"
    ? "bg-red-100 text-red-800"
    : sev === "warning"
    ? "bg-amber-100 text-amber-800"
    : "bg-blue-100 text-blue-800";

// Base URL (overridable by env)
const ESP32_BASE =
  (process.env.NEXT_PUBLIC_SENSORS_BASE as string | undefined) || "http://aquamon.local";

// Throttle thresholds to avoid hammering Firestore
const DIFF = { temp: 0.5, ph: 0.2, do: 0.2, tds: 10 };

// Delay before clearing insights after going offline
const OFFLINE_CLEAR_DELAY_MS = 1_000; // 5 seconds

export function AIInsightsCard({ pondId, pondName }: { pondId: string; pondName?: string }) {
  const [items, setItems] = useState<DashInsight[]>([]);

  // 1) Subscribe to current insights (UI reacts in realtime)
  useEffect(() => {
    if (!pondId) return;
    return subscribeDashInsights(pondId, setItems);
  }, [pondId]);

  // 2) Periodically resolve ephemerals that have autoResolveAt
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

  // 3) Realtime driver: feed live sensor data into detectRealtimeFindingsDash
  const { data, isOnline } = useAquaSensors({ baseUrl: ESP32_BASE, intervalMs: 1000 });

  const lastSentRef = useRef<{ ts: number; temp: number; ph: number; do: number; tds: number } | null>(null);

  useEffect(() => {
    if (!pondId || !isOnline || !data) return;

    const now = Date.now();
    const last = lastSentRef.current;

    const changedEnough =
      !last ||
      Math.abs((data.temp ?? NaN) - (last.temp ?? NaN)) >= DIFF.temp ||
      Math.abs((data.ph ?? NaN) - (last.ph ?? NaN)) >= DIFF.ph ||
      Math.abs((data.do ?? NaN) - (last.do ?? NaN)) >= DIFF.do ||
      Math.abs((data.tds ?? NaN) - (last.tds ?? NaN)) >= DIFF.tds ||
      now - (last.ts || 0) >= 3000; // hard throttle: 3s

    if (!changedEnough) return;

    const reading: LiveReading = {
      ts: now,
      temp: Number(data.temp ?? NaN),
      ph: Number(data.ph ?? NaN),
      do: Number(data.do ?? NaN),
      tds: Number(data.tds ?? NaN),
    };

    const pondLite: PondLite = { id: pondId, name: pondName };
    void detectRealtimeFindingsDash(pondLite, reading).catch(() => {});

    lastSentRef.current = { ts: now, temp: reading.temp, ph: reading.ph, do: reading.do, tds: reading.tds };
  }, [pondId, pondName, data, isOnline]);

  // 4) Delay-clear when device goes OFFLINE; cancel if it comes back ONLINE
  const prevOnline = useRef<boolean | null>(null);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pondId) return;

    // initialize previous state
    if (prevOnline.current === null) {
      prevOnline.current = isOnline;
      return;
    }

    // online → offline: start a 10s timer; if it stays offline for 10s, clear insights
    if (prevOnline.current === true && isOnline === false && !offlineTimerRef.current) {
      offlineTimerRef.current = setTimeout(() => {
        void resolveAllWaterInsightsForOffline(pondId).finally(() => {
          offlineTimerRef.current = null;
        });
      }, OFFLINE_CLEAR_DELAY_MS);
    }

    // offline → online: cancel any pending clear
    if (prevOnline.current === false && isOnline === true && offlineTimerRef.current) {
      clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }

    prevOnline.current = isOnline;
  }, [isOnline, pondId]);

  // 5) Sort + show active insights only
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
