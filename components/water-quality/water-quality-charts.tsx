// app/(wherever)/water-quality/water-quality-charts.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAnalytics24h } from "@/lib/hooks/useAnalytics24h";

export function WaterQualityCharts({ pondId }: { pondId: string }) {
  const { temp, ph, do: doSeries, tds, ticks } = useAnalytics24h(pondId);
  console.log("temp series", temp);
  console.log("ph series", ph);
  console.log("do series", doSeries);
  console.log("tds series", tds);


 type SeriesPoint = { time: string; value: number | null };

const Chart = ({
  title, data, yDomain,
}: { title: string; data: SeriesPoint[]; yDomain?: any }) => (
  <Card>
    <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
    <CardContent>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis domain={yDomain ?? ['auto', 'auto']} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            strokeWidth={2}
            dot
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);


  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <Chart title="Temperature (24h)" data={temp} yDomain={['dataMin - 1', 'dataMax + 1']} />
        <Chart title="pH Level (24h)"   data={ph}   yDomain={[6.5, 9]} />
        <Chart title="Dissolved Oxygen (24h)" data={doSeries} yDomain={['dataMin - 0.5', 'dataMax + 0.5']} />
        <Chart title="TDS (24h)" data={tds} yDomain={['dataMin - 10', 'dataMax + 10']} />
      </div>
    </div>
  );


}
