// Six transactional templates in Bahasa Indonesia (spec 12 §1, §4). Plain text always; simple HTML; links only to
// geraiexpress.com hosts; no images, pixels or attachments. The footer reads only filled legal fields (DEC-218).

export type TemplateId =
  | "signup_otp"
  | "password_reset"
  | "kasir_invite"
  | "email_change_otp"
  | "application_status"
  | "security_alert"
  | "application_submitted"
  | "admin_new_application"

export interface LegalFooter {
  legalName: string | null
  supportEmail: string | null
}

export type TemplateVars = {
  signup_otp: { code: string }
  password_reset: { link: string }
  kasir_invite: { link: string; outletName: string; inviterName: string }
  email_change_otp: { code: string }
  application_status: { outletName: string; decision: "approved" | "rejected"; reason?: string | null; link: string }
  security_alert: { when: string; device: string; link: string }
  application_submitted: { outletName: string; slug: string; link: string }
  admin_new_application: { outletName: string; slug: string; areaLabel: string; link: string }
}

export interface Rendered {
  subject: string
  text: string
  html: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const ALLOWED_LINK = /^https?:\/\/([a-z0-9-]+\.)*geraiexpress\.(com|localhost)(:\d+)?\//

function assertLink(link: string): string {
  if (!ALLOWED_LINK.test(link)) throw new Error("email links must point to geraiexpress.com hosts")
  return link
}

function footer(f: LegalFooter, why: string): { text: string; html: string } {
  const lines = [why]
  if (f.legalName) lines.push(f.legalName)
  if (f.supportEmail) lines.push(`Bantuan: ${f.supportEmail}`)
  return {
    text: `\n\n—\n${lines.join("\n")}`,
    html: `<hr style="border:0;border-top:1px solid #E3E8F0;margin:24px 0"><p style="font-size:14px;color:#55657D;margin:0">${lines.map(esc).join("<br>")}</p>`,
  }
}

function wrap(bodyHtml: string, foot: string): string {
  return `<!doctype html><html lang="id"><body style="margin:0;padding:24px;background:#FFFFFF;color:#203551;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5"><div style="max-width:520px;margin:0 auto">${bodyHtml}${foot}</div></body></html>`
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#2E47BA;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${esc(label)}</a></p>`

export function renderTemplate<T extends TemplateId>(id: T, vars: TemplateVars[T], legal: LegalFooter): Rendered {
  switch (id) {
    case "signup_otp": {
      const { code } = vars as TemplateVars["signup_otp"]
      const f = footer(legal, "Anda menerima email ini karena alamat ini dipakai untuk mendaftar gerai di GeraiExpress.")
      return {
        subject: `Kode verifikasi GeraiExpress: ${code}`,
        text: `Kode verifikasi Anda: ${code}\n\nKode berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun, termasuk yang mengaku dari GeraiExpress.\nJika Anda tidak mendaftar, abaikan email ini.${f.text}`,
        html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Kode verifikasi Anda</h1><p style="font-size:32px;font-weight:700;letter-spacing:4px;margin:16px 0">${esc(code)}</p><p>Kode berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun, termasuk yang mengaku dari GeraiExpress.</p><p>Jika Anda tidak mendaftar, abaikan email ini.</p>`, f.html),
      }
    }
    case "email_change_otp": {
      const { code } = vars as TemplateVars["email_change_otp"]
      const f = footer(legal, "Anda menerima email ini karena ada permintaan mengganti email akun GeraiExpress ke alamat ini.")
      return {
        subject: `Kode ganti email GeraiExpress: ${code}`,
        text: `Kode untuk mengganti email akun Anda: ${code}\n\nKode berlaku 10 menit. Jika Anda tidak meminta penggantian email, abaikan email ini.${f.text}`,
        html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Kode ganti email</h1><p style="font-size:32px;font-weight:700;letter-spacing:4px;margin:16px 0">${esc(code)}</p><p>Kode berlaku 10 menit. Jika Anda tidak meminta penggantian email, abaikan email ini.</p>`, f.html),
      }
    }
    case "password_reset": {
      const { link } = vars as TemplateVars["password_reset"]
      const f = footer(legal, "Anda menerima email ini karena ada permintaan atur ulang kata sandi untuk akun GeraiExpress Anda.")
      return {
        subject: "Atur ulang kata sandi GeraiExpress",
        text: `Buka tautan ini untuk membuat kata sandi baru:\n${assertLink(link)}\n\nTautan berlaku 30 menit dan hanya bisa dipakai sekali. Setelah kata sandi diganti, perangkat lain akan dikeluarkan dari akun.\nJika Anda tidak meminta ini, abaikan email ini; kata sandi Anda tidak berubah.${f.text}`,
        html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Atur ulang kata sandi</h1><p>Tekan tombol di bawah untuk membuat kata sandi baru.</p>${button(assertLink(link), "Buat Kata Sandi Baru")}<p>Tautan berlaku 30 menit dan hanya bisa dipakai sekali. Setelah kata sandi diganti, perangkat lain akan dikeluarkan dari akun.</p><p>Jika Anda tidak meminta ini, abaikan email ini; kata sandi Anda tidak berubah.</p>`, f.html),
      }
    }
    case "kasir_invite": {
      const { link, outletName, inviterName } = vars as TemplateVars["kasir_invite"]
      const f = footer(legal, "Anda menerima email ini karena pemilik gerai mengundang alamat ini sebagai kasir.")
      return {
        subject: `Undangan menjadi kasir di ${outletName}`,
        text: `${inviterName} mengundang Anda menjadi kasir di ${outletName} pada GeraiExpress.\n\nBuat akun melalui tautan ini:\n${assertLink(link)}\n\nUndangan berlaku 7 hari dan hanya bisa dipakai sekali.${f.text}`,
        html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Undangan menjadi kasir</h1><p>${esc(inviterName)} mengundang Anda menjadi kasir di <strong>${esc(outletName)}</strong> pada GeraiExpress.</p>${button(assertLink(link), "Buat Akun Kasir")}<p>Undangan berlaku 7 hari dan hanya bisa dipakai sekali.</p>`, f.html),
      }
    }
    case "application_status": {
      const { outletName, decision, reason, link } = vars as TemplateVars["application_status"]
      const f = footer(legal, "Anda menerima email ini karena mengajukan pendaftaran gerai di GeraiExpress.")
      if (decision === "approved") {
        return {
          subject: `Pengajuan ${outletName} disetujui`,
          text: `Selamat, pengajuan gerai ${outletName} telah disetujui. Akun pengiriman Mengantar untuk gerai Anda sedang disiapkan.\n\nMasuk ke ruang kerja gerai:\n${assertLink(link)}${f.text}`,
          html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Pengajuan disetujui</h1><p>Selamat, pengajuan gerai <strong>${esc(outletName)}</strong> telah disetujui. Akun pengiriman Mengantar untuk gerai Anda sedang disiapkan.</p>${button(assertLink(link), "Masuk ke Ruang Kerja")}`, f.html),
        }
      }
      const why = reason ? `\n\nAlasan: ${reason}` : ""
      return {
        subject: `Pengajuan ${outletName} belum dapat disetujui`,
        text: `Mohon maaf, pengajuan gerai ${outletName} belum dapat kami setujui.${why}\n\nAnda dapat memperbaiki data lalu mengajukan kembali:\n${assertLink(link)}${f.text}`,
        html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Pengajuan belum dapat disetujui</h1><p>Mohon maaf, pengajuan gerai <strong>${esc(outletName)}</strong> belum dapat kami setujui.</p>${reason ? `<p>Alasan: ${esc(reason)}</p>` : ""}${button(assertLink(link), "Perbaiki Pengajuan")}`, f.html),
      }
    }
    case "security_alert": {
      const { when, device, link } = vars as TemplateVars["security_alert"]
      const f = footer(legal, "Anda menerima email ini untuk menjaga keamanan akun GeraiExpress Anda.")
      return {
        subject: "Login baru ke akun GeraiExpress Anda",
        text: `Ada login baru ke akun Anda pada ${when} dari ${device}.\n\nJika itu Anda, tidak perlu melakukan apa pun. Jika bukan, segera ganti kata sandi dan keluarkan perangkat lain:\n${assertLink(link)}${f.text}`,
        html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Login baru ke akun Anda</h1><p>Ada login baru ke akun Anda pada <strong>${esc(when)}</strong> dari <strong>${esc(device)}</strong>.</p><p>Jika itu Anda, tidak perlu melakukan apa pun. Jika bukan, segera ganti kata sandi dan keluarkan perangkat lain.</p>${button(assertLink(link), "Amankan Akun")}`, f.html),
      }
    }
    case "application_submitted": {
      const { outletName, slug, link } = vars as TemplateVars["application_submitted"]
      const domain = slug.includes(".") ? slug : `${slug}.geraimitra.com`
      const f = footer(legal, "Anda menerima email ini karena mengajukan pendaftaran gerai di GeraiExpress.")
      return {
        subject: `Pengajuan gerai ${outletName} diterima`,
        text: `Terima kasih, pengajuan gerai ${outletName} (${domain}) sudah kami terima dan sedang ditinjau oleh tim GeraiExpress.\n\nPantau status pengajuan Anda di sini:\n${assertLink(link)}${f.text}`,
        html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Pengajuan gerai diterima</h1><p>Terima kasih, pengajuan gerai <strong>${esc(outletName)}</strong> (<code>${esc(domain)}</code>) sudah kami terima dan sedang ditinjau oleh tim GeraiExpress.</p>${button(assertLink(link), "Pantau Status Pengajuan")}`, f.html),
      }
    }
    case "admin_new_application": {
      const { outletName, slug, areaLabel, link } = vars as TemplateVars["admin_new_application"]
      const domain = slug.includes(".") ? slug : `${slug}.geraimitra.com`
      const f = footer(legal, "Notifikasi otomatis konsol Super Admin GeraiExpress.")
      return {
        subject: `Pengajuan gerai baru: ${outletName}`,
        text: `Ada pengajuan gerai baru yang menunggu tinjauan:\n- Nama gerai: ${outletName}\n- Alamat: ${domain}\n- Wilayah titik jemput: ${areaLabel}\n\nTinjau pengajuan di konsol Super Admin:\n${assertLink(link)}${f.text}`,
        html: wrap(`<h1 style="font-size:22px;margin:0 0 16px">Pengajuan gerai baru</h1><p>Ada pengajuan gerai baru yang menunggu tinjauan:</p><ul style="padding-left:20px;margin:12px 0"><li><strong>Nama gerai:</strong> ${esc(outletName)}</li><li><strong>Alamat:</strong> <code>${esc(domain)}</code></li><li><strong>Titik jemput:</strong> ${esc(areaLabel)}</li></ul>${button(assertLink(link), "Tinjau Pengajuan")}`, f.html),
      }
    }
  }
  throw new Error(`unknown template ${String(id)}`)
}
