// lib/utils/link-users-cron.ts

let linkCronStarted = false

export function startUserLinkingCron() {
  // Prevent duplicate intervals (e.g., hot reloads in dev)
  if (linkCronStarted) {
    console.log("🟡 User linking cron already running — skipping duplicate start.")
    return
  }
  linkCronStarted = true

  // Only run automatically in production
  if (process.env.NODE_ENV !== "production") {
    console.log("⚙️ User linking cron disabled in development mode.")
    return
  }

  const interval = 6 * 60 * 60 * 1000 // every 6 hours

  console.log("🔁 Auto-linking cron started (every 6 h)…")

  setInterval(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/utils/link-users-to-pond`)
      console.log("🔗 Auto-link check:", res.status)
    } catch (err) {
      console.error("Auto-link failed:", err)
    }
  }, interval)
}
