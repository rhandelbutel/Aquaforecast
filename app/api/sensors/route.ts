import { NextResponse } from "next/server"

const DEFAULT_BASE = process.env.SENSORS_BASE || process.env.NEXT_PUBLIC_SENSORS_BASE || "http://aquamon.local/sensors"

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  res.headers.set("Cache-Control", "no-store")
  return res
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }))
}

export async function GET() {
  const base = (DEFAULT_BASE || "").replace(/\/+$/, "")
  const target = `${base}/sensors`

  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 5000)
  try {
    const resp = await fetch(target, { cache: "no-store", signal: ctrl.signal })
    if (!resp.ok) {
      return withCors(NextResponse.json({ error: `Upstream ${resp.status}` }, { status: 502 }))
    }
    const data = await resp.json()
    return withCors(NextResponse.json(data, { status: 200 }))
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Upstream timeout" : (e?.message || "Fetch failed")
    return withCors(NextResponse.json({ error: msg }, { status: 504 }))
  } finally {
    clearTimeout(timeout)
  }
}


