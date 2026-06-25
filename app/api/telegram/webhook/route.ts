import { handleWebhook } from "../../../../src/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (configuredSecret) {
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== configuredSecret) return new Response("Unauthorized", { status: 401 });
  }
  return handleWebhook(request);
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "telegram-webhook" });
}
