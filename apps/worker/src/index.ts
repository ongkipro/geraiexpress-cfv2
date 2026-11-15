import { healthz, notFoundHtml } from "./http/pages"
import { serveSpa } from "./assets/spa"

export { GeraiVaultDO } from "./do/gerai-vault"
export { PartnerQuotaDO } from "./do/partner-quota"

// TASK-101 shell: liveness on every host and the two SPAs on their own hosts. The authoritative host classifier
// (TASK-102) replaces the static match below; queue consumers and cron jobs are filled in by their owning tasks.
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/healthz") return healthz()
    const host = url.hostname.toLowerCase()
    if (host === `app.${env.PLATFORM_APEX}`) return serveSpa(request, env.ASSETS, "app")
    if (host === `owner.${env.PLATFORM_APEX}`) return serveSpa(request, env.ASSETS, "owner")
    return notFoundHtml()
  },
  async queue(batch): Promise<void> {
    // No consumer is wired yet: acknowledge so nothing is redelivered into a missing handler.
    batch.ackAll()
  },
  async scheduled(): Promise<void> {},
} satisfies ExportedHandler<Env>
