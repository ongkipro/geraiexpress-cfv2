// Brand site `geraiexpress.com` (TASK-502, DEC-202, visual 03 §2, visual 09, spec 06 §5):
// Multi-page SEO SSR, zero cookies (session cookies are host-only on app./owner.), legal footer from
// `platform_legal_profile` rendering filled fields only (DEC-218), and interactive synthetic counter demos.
import { notFoundHtml } from "../http/pages"
import {
  BIAYA_SCRIPT,
  CARA_SCRIPT,
  HOME_SCRIPT,
  PRODUCT_SHOT,
  renderBiaya,
  renderCaraKerja,
  renderEkspedisi,
  renderFitur,
  renderHome,
  renderHubungi,
  renderKetentuan,
  renderPrivasi,
  renderSimulasi,
  renderTanyaJawab,
  SEL_SCRIPT,
  SIM_SCRIPT,
} from "./pages"
import { BRAND_PAGES, renderShell, type Legal } from "./seo"

const BRAND_ASSETS = new Set([
  "/logo.svg",
  "/favicon.svg",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/logo-192.png",
  "/og-geraiexpress.png",
  "/three.min.js",
  "/hero-studio-3d.min.js",
  PRODUCT_SHOT.src,
  ...["jne", "jt", "sicepat", "sap", "lion", "anteraja", "idexpress", "pos", "spx"].map((c) => `/couriers/${c}.svg`),
])

export async function handleBrand(request: Request, env: Env, host: string): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, "") || "/"
  if (request.method !== "GET" && request.method !== "HEAD") return notFoundHtml()

  const apex = env.PLATFORM_APEX
  // One canonical brand host: `www.` redirects permanently to the apex.
  if (host === `www.${apex}`) {
    return new Response(null, {
      status: 301,
      headers: { location: `https://${apex}${url.pathname}${url.search}`, "cache-control": "public, max-age=86400" },
    })
  }

  // Serve shared brand static assets from the app SPA bundle directory (`/app/<asset>`).
  if (BRAND_ASSETS.has(path)) {
    const res = await env.ASSETS.fetch(new Request(new URL(`/app${path}`, url.origin), { method: request.method }))
    if (res.status !== 200) return notFoundHtml()
    const out = new Response(res.body, res)
    out.headers.set("cache-control", "public, max-age=86400")
    out.headers.set("x-content-type-options", "nosniff")
    return out
  }

  const appOrigin =
    env.GX_ENV === "local"
      ? `${url.protocol}//app.${apex}${url.port ? `:${url.port}` : ""}`
      : `https://app${env.GX_ENV === "staging" ? "-staging" : ""}.${apex}`

  if (path === "/robots.txt") {
    return new Response(`User-agent: *\nAllow: /\nSitemap: https://${host}/sitemap.xml\n`, {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
    })
  }

  if (path === "/sitemap.xml") {
    const urls = Object.keys(BRAND_PAGES)
      .map((p) => `<url><loc>https://${host}${p === "/" ? "/" : p}</loc></url>`)
      .join("")
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`, {
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
    })
  }

  const meta = BRAND_PAGES[path]
  if (!meta) return notFoundHtml()

  const legal = await env.DB.prepare(
    "SELECT legal_name, brand_name, nib, registered_address, support_email, support_whatsapp, privacy_contact_email, pse_registration_number FROM platform_legal_profile WHERE id = 1",
  ).first<Legal>()

  const body =
    path === "/"
      ? renderHome(appOrigin)
      : path === "/fitur"
        ? renderFitur(appOrigin)
        : path === "/ekspedisi"
          ? renderEkspedisi(appOrigin)
          : path === "/cara-kerja"
            ? renderCaraKerja(appOrigin)
            : path === "/biaya-dan-paket"
              ? renderBiaya(appOrigin)
              : path === "/simulasi-kasir"
                ? renderSimulasi(appOrigin)
                : path === "/tanya-jawab"
                  ? renderTanyaJawab(appOrigin)
                  : path === "/hubungi-kami"
                    ? renderHubungi(legal, appOrigin)
                    : path === "/ketentuan"
                      ? renderKetentuan(legal, appOrigin)
                      : renderPrivasi(legal, appOrigin)

  const script = path === "/" ? HOME_SCRIPT + BIAYA_SCRIPT : path === "/simulasi-kasir" ? SIM_SCRIPT + SEL_SCRIPT : path === "/cara-kerja" ? CARA_SCRIPT : path === "/biaya-dan-paket" ? BIAYA_SCRIPT : undefined
  const html = renderShell({
    path,
    meta,
    host,
    appOrigin,
    legal,
    body,
    script,
    noindex: env.GX_ENV === "staging",
  })

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  })
}
