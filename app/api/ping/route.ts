import { getServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getServiceClient()
  await supabase.from('settings').select('key').limit(1)
  return Response.json({ ok: true })
}
