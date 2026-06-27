import { handleWebhook } from "../../../../src/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (configuredSecret) {
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== configuredSecret) return new Response("Unauthorized", { status: 401 });
  }
  // Always acknowledge Telegram with 200, even on a handler error. Returning a
  // 500 makes Telegram retry the same update indefinitely, which builds an
  // un-drainable backlog (especially with stale callback queries on free-tier
  // cold starts). Errors are logged for debugging instead.
  try {
    return await handleWebhook(request);
  } catch (err) {
    console.error("Webhook handler error", err);
    return new Response("ok", { status: 200 });
  }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "telegram-webhook" });
}
