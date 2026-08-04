export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sendNotification } from "@/lib/notifications.js";

/**
 * Daily push job, triggered by the Vercel cron declared in vercel.json.
 *
 * Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron
 * invocations whenever the CRON_SECRET environment variable is set on the
 * project. Any request without that header is rejected.
 *
 * This endpoint fans out real push notifications to real subscribers, so it
 * fails closed: if CRON_SECRET is not configured, nothing is sent. Setting the
 * variable in the Vercel dashboard (Production *and* Preview) is required for
 * the daily job to run.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(
      "[notifications] CRON_SECRET is not set — refusing to send notifications.",
    );
    return NextResponse.json(
      { error: "Notification job is not configured." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendNotification();
  return NextResponse.json(result);
}
