import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const { to, status } = await req.json();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    let subject = "";
    let html = "";

    switch (status) {
      // ---------- USER STATUS EMAILS ----------
      case "pending":
        subject = "Your Aquaforecast account is pending approval";
        html = `
          <p>Hello,</p>
          <p>Your Aquaforecast account has been created and is now <b>pending admin approval</b>.</p>
          <p>You will receive another email once your account is approved or rejected.</p>
          <p>Thank you,<br/>The Aquaforecast Team</p>
        `;
        break;

      case "approved":
        subject = "Your Aquaforecast account has been approved!";
        html = `
          <p>Hello,</p>
          <p>Good news! Your Aquaforecast account has been <b>approved</b>. You can now log in and start using the platform.</p>
          <p>Thank you,<br/>The Aquaforecast Team</p>
        `;
        break;

      case "rejected":
        subject = "Your Aquaforecast account was rejected";
        html = `
          <p>Hello,</p>
          <p>We’re sorry to inform you that your Aquaforecast account request has been <b>rejected</b>.</p>
          <p>If you believe this was a mistake, please contact support.</p>
          <p>Thank you,<br/>The Aquaforecast Team</p>
        `;
        break;

      case "blocked":
        subject = "Your Aquaforecast account has been blocked";
        html = `
          <p>Hello,</p>
          <p>Your account has been <b>blocked</b> by the administrator due to a policy violation or other issue.</p>
          <p>If you think this was an error, please reach out to support for assistance.</p>
          <p>Thank you,<br/>The Aquaforecast Team</p>
        `;
        break;

      // ---------- FEEDING ALERT EMAILS ----------
      case "feeding-reminder":
        subject = "Feeding Reminder – Scheduled Feeding in 1 Hour";
        html = `
          <p>Hello,</p>
          <p>This is a friendly reminder that your next feeding time is coming up <b>soon</b>.</p>
          <p>Please make sure your feed is ready and check your pond status in <b>Aquaforecast</b>.</p>
          <p>Thank you,<br/>The Aquaforecast Team</p>

        `;
        break;

      case "feeding-daily":
        subject = "Today's Feeding Schedule – Aquaforecast";
        html = `
          <p>Hello,</p>
          <p>Here’s your feeding schedule for today. Stay consistent to ensure healthy pond conditions!</p>
          <p>Check your full schedule and logs here:</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://aquaforecast.com"}">Open Aquaforecast Dashboard</a></p>
          <p>Thank you,<br/>The Aquaforecast Team</p>
        `;
        break;

      default:
        throw new Error("Invalid email status.");
    }

    await transporter.sendMail({
      from: `"Aquaforecast" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
