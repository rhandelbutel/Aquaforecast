// lib/utils/feeding-alert-cron.ts

let feedingCronStarted = false

export function startFeedingAlertCron() {
  // Prevent duplicate intervals (e.g., hot reloads in dev)
  if (feedingCronStarted) {
    console.log("🟡 Feeding alert cron already running — skipping duplicate start.")
    return
  }
  feedingCronStarted = true

  // Only run automatically in production
  if (process.env.NODE_ENV !== "production") {
    console.log("⚙️ Feeding alert cron disabled in development mode.")
    return
  }

  const interval = 30 * 60 * 1000 // every 30 min

  console.log("🕒 Feeding alert auto-check started (every 30 min)…")

  setInterval(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/feeding/alerts`)
      console.log("🔄 Feeding alert check:", res.status)
    } catch (err) {
      console.error("Feeding alert auto-run failed:", err)
    }
  }, interval)
}
