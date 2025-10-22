export async function sendUserStatusEmail({
  to,
  status,
}: {
  to: string;
  status: "pending" | "approved" | "rejected" | "blocked";
}) {
  try {
    await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, status }),
    });
  } catch (err) {
    console.error("Failed to trigger email API:", err);
  }
}
