// components/analytics/efficiency-tips.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import type { PondData } from "@/lib/pond-service";

import {
  detectRealtimeFindings, detectMortality, detectGrowthDelta, detectOffline,
  subscribeInsights, resolveInsight, snoozeInsight, recordHeartbeat,
  type Insight
} from "@/lib/insights-service";

import { useAquaSensors } from "@/hooks/useAquaSensors";

type Props = { pond: PondData & { id: string } };

const iconFor = (sev: Insight["severity"]) =>
  sev === "danger" || sev === "error" ? XCircle
  : sev === "warning" ? AlertTriangle
  : Info;

const badgeFor = (sev: Insight["severity"]) =>
  sev === "danger" || sev === "error" ? "bg-red-100 text-red-800"
  : sev === "warning" ? "bg-yellow-100 text-yellow-800"
  : "bg-blue-100 text-blue-800";

export function EfficiencyTips({ pond }: Props) {
  const [items, setItems] = useState<Insight[]>([]);

  // 1) Subscribe to stored insights for this pond
  useEffect(() => {
    if (!pond?.id) return;
    return subscribeInsights(pond.id, setItems);
  }, [pond?.id]);

  // 2) Stream sensors → detectors + heartbeat
  //    NOTE: use returned setOnReading (no function prop in options)
  const { setOnReading } = useAquaSensors({ baseUrl: "/api", intervalMs: 1000 });

  useEffect(() => {
    if (!pond?.id) return;

    setOnReading(async (r) => {
      await recordHeartbeat(pond.id);
      await detectRealtimeFindings(
        { id: pond.id, name: pond.name, fishSpecies: pond.fishSpecies },
        { ts: r.ts, temp: r.temp, ph: r.ph, tds: r.tds, do: r.do }
      );
    });

    // cleanup: stop calling when component/pond changes
    return () => setOnReading(undefined);
  }, [pond?.id, pond?.name, pond?.fishSpecies, setOnReading]);

  // 3) Periodic checks for mortality / growth delta / offline sweep
  useEffect(() => {
    if (!pond?.id) return;
    let stop = false;

    const run = async () => {
      try {
        await Promise.all([
          detectMortality({ id: pond.id, name: pond.name }),
          detectGrowthDelta({ id: pond.id, name: pond.name }),
          detectOffline({ id: pond.id, name: pond.name }),
        ]);
      } finally {
        if (!stop) setTimeout(run, 5 * 60 * 1000); // every 5 min
      }
    };

    run();
    return () => { stop = true; };
  }, [pond?.id, pond?.name]);

  // 4) Sort & trim (danger > error > warning > info; newest first)
  const display = useMemo(() => {
    const rank = (s: Insight["severity"]) =>
      s === "danger" ? 3 : s === "error" ? 2 : s === "warning" ? 1 : 0;

    const filtered = items.filter(i => i.status === "active");
    return filtered
      .slice()
      .sort((a, b) => (rank(b.severity) - rank(a.severity)) || (b.createdAt - a.createdAt))
      .slice(0, 6);
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Efficiency Tips & Alerts — {pond.name}</CardTitle>
      </CardHeader>
      <CardContent>
        {display.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active alerts. Tips will appear as we capture more data.
          </p>
        ) : (
          <div className="space-y-3">
            {display.map((it) => {
              const Icon = iconFor(it.severity);
              const color =
                it.severity === "danger" || it.severity === "error"
                  ? "text-red-600"
                  : it.severity === "warning"
                  ? "text-yellow-600"
                  : "text-blue-600";

              return (
                <div key={it.id ?? it.key} className="flex items-start gap-3 p-4 border rounded-lg">
                  <Icon className={`h-5 w-5 mt-0.5 ${color}`} />
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

                    <div className="mt-3 flex gap-2">
                      <button
                        className="text-xs px-2 py-1 border rounded hover:bg-muted"
                        onClick={() => it.id && snoozeInsight(pond.id!, it.id)}
                      >
                        Snooze 6h
                      </button>
                      <button
                        className="text-xs px-2 py-1 border rounded hover:bg-muted"
                        onClick={() => it.id && resolveInsight(pond.id!, it.id)}
                      >
                        Resolve
                      </button>
                    </div>
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
