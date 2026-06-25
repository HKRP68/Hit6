export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 720, margin: "4rem auto", padding: 24 }}>
      <h1>🏏 Hit6 Telegram Bot</h1>
      <p>A daily cricket progression bot for Telegram groups and private chats.</p>
      <p>Configure <code>BOT_TOKEN</code>, <code>DATABASE_URL</code>, and <code>TELEGRAM_WEBHOOK_SECRET</code>, then point Telegram to <code>/api/telegram/webhook</code>.</p>
    </main>
  );
}
