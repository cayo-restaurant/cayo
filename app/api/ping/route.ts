export const dynamic = 'force-dynamic'

export async function GET() {
  // Cron warmup route for Vercel. A simple 200 is enough to warm the serverless function.
  return Response.json({ ok: true })
}
