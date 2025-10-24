export function startFeedingAlertCron() {
  const interval = 30 * 60 * 1000; 

  console.log("Feeding alert auto-check started...");

  setInterval(async () => {
    try {
      // Call your existing feeding alert endpoint
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/feeding/alerts`);
      console.log("🔄 Feeding alert check:", res.status);
    } catch (err) {
      console.error("Feeding alert auto-run failed:", err);
    }
  }, interval);
}
