// components/dashboard/ai-insights.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, AlertTriangle, XCircle, Lightbulb } from "lucide-react";
import {
  subscribeDashInsights,
  resolveDashInsight,
  type DashInsight,
} from "@/lib/dash-insights-service";

const iconFor = (sev: DashInsight["severity"]) =>
  sev === "error" ? XCircle : sev === "warning" ? AlertTriangle : Info;

const badgeFor = (sev: DashInsight["severity"]) =>
  sev === "error"
    ? "bg-red-100 text-red-800"
    : sev === "warning"
    ? "bg-amber-100 text-amber-800"
    : "bg-blue-100 text-blue-800";

export function AIInsightsCard({ pondId }: { pondId: string }) {
  const [items, setItems] = useState<DashInsight[]>([]);

  useEffect(() => {
    if (!pondId) return;
    return subscribeDashInsights(pondId, setItems);
  }, [pondId]);

  // auto-resolve ephemerals when expired
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

  const display = useMemo(() => {
    const rank = (s: DashInsight["severity"]) => (s === "error" ? 2 : s === "warning" ? 1 : 0);
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
