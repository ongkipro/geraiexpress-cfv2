// Neutral Indonesian status pages. They never reveal whether a tenant exists (spec 11 §3).
const page = (title: string, body: string) => `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>html{font-size:16px;color-scheme:light}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#203551;background:#fff;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}main{max-width:440px;text-align:center}h1{font-size:28px;margin:0 0 12px}p{font-size:16px;line-height:1.5;color:#55657D;margin:0}</style>
</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`

export const notFoundHtml = () =>
  new Response(page("Halaman tidak ditemukan", "Alamat yang Anda buka tidak tersedia. Periksa kembali alamatnya."), {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })

export const suspendedHtml = () =>
  new Response(page("Gerai sedang tidak aktif", "Gerai ini untuk sementara tidak melayani pengunjung. Silakan hubungi gerai secara langsung."), {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })

export const recoveryHtml = () =>
  new Response(page("Sedang dalam pemeliharaan", "Gerai ini sedang dalam pemeliharaan singkat. Silakan coba lagi beberapa menit lagi."), {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "120" },
  })

export const healthz = () => Response.json({ ok: true }, { headers: { "cache-control": "no-store" } })
