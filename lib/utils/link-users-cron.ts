export function startUserLinkingCron() {
  const interval = 2 * 60 * 1000; // every 10 minutes

  console.log("🔁 Auto-linking cron started...");

  setInterval(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/utils/link-users-to-pond`);
      console.log("🔗 Auto-link check:", res.status);
    } catch (err) {
      console.error("Auto-link failed:", err);
    }
  }, interval);
}
