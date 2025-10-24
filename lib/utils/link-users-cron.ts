export function startUserLinkingCron() {
  const interval = 6 * 60 * 60 * 1000; 

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
