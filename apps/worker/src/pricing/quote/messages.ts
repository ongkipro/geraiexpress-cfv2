// Pos Indonesia COD eligibility (Mengantar create-order "Pos Indonesia", DEC-238): shared by the quote service and the
// tenant object that records a 403 refusal.
export const COD_BLOCK_TTL_MS = 24 * 3_600_000

/** Indonesian reason for a Pos Indonesia COD refusal (create-order 403 `status`), with the delivered rate vs 82 %. */
export function posCodMessage(status: string | null, deliveredRate: number | null): string {
  const rate = deliveredRate === null ? "" : ` Tingkat terkirim akun ${deliveredRate}% (minimal 82%).`
  if (status === "new_seller") return `COD Pos Indonesia belum bisa: akun Mengantar belum punya riwayat kiriman terkirim.${rate} Non-COD tetap bisa.`
  if (status === "insufficient") return `COD Pos Indonesia belum bisa: data kiriman belum cukup untuk dinilai.${rate} Non-COD tetap bisa.`
  return `COD Pos Indonesia diblokir: tingkat terkirim di bawah 82% tiga periode berturut-turut.${rate} Non-COD tetap bisa.`
}
