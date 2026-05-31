export default async function (req: Request): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const requestUrl = new URL(req.url)
  const code = requestUrl.searchParams.get('c') || requestUrl.searchParams.get('code')

  if (!code || !/^[A-Za-z0-9_-]{4,32}$/.test(code)) {
    return new Response('Invalid or missing link code', { status: 400, headers: corsHeaders })
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL') || Deno.env.get('INSFORGE_URL')
  const anonKey = Deno.env.get('ANON_KEY') || Deno.env.get('INSFORGE_ANON_KEY')

  if (!baseUrl || !anonKey) {
    return new Response('Short link service is not configured', { status: 500, headers: corsHeaders })
  }

  const recordsUrl = `${baseUrl}/api/database/records/payment_links?select=id,url,stripe_url,expires_at&short_code=eq.${encodeURIComponent(code)}&limit=1`
  const response = await fetch(recordsUrl, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey
    }
  })

  if (!response.ok) {
    return new Response('Could not load short link', { status: 502, headers: corsHeaders })
  }

  const records = await response.json()
  const link = Array.isArray(records) ? records[0] : null

  if (!link) {
    return new Response('Link not found or expired', { status: 404, headers: corsHeaders })
  }

  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    await fetch(`${baseUrl}/api/database/records/payment_links?id=eq.${link.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey
      }
    }).catch(() => null)

    return new Response('Link expired', { status: 410, headers: corsHeaders })
  }

  const targetUrl = link.stripe_url || String(link.url || '').split('||')[1] || link.url

  if (!targetUrl || !String(targetUrl).startsWith('https://checkout.stripe.com/')) {
    return new Response('Invalid checkout target', { status: 500, headers: corsHeaders })
  }

  return Response.redirect(targetUrl, 302)
}
