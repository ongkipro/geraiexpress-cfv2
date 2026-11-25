// Indonesia coordinate parsing, validation, and Google Maps / OSM link extraction (DEC-238, Pos Indonesia pinpoint).
export const ID_BOUNDS = { minLat: -11.5, maxLat: 6.5, minLng: 94.5, maxLng: 141.5 } as const
export const INDONESIA_DEFAULT_CENTER = { lat: -6.2088, lng: 106.8456 } as const

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Parses an optional decimal coordinate (`-6.9456` or `-6,9456`); trims whitespace so blank strings never become `0`. */
export function parseCoordinate(v: unknown, limit: number): number | null | undefined {
  if (v == null) return null
  if (typeof v === "string") {
    const trimmed = v.trim()
    if (!trimmed) return null
    const n = Number(trimmed.replace(",", "."))
    if (!Number.isFinite(n) || Math.abs(n) > limit) return undefined
    return round6(n)
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || Math.abs(v) > limit) return undefined
    return round6(v)
  }
  return undefined
}

export function isInIndonesia(lat: number, lng: number): boolean {
  if (lat === 0 && lng === 0) return false
  return lat >= ID_BOUNDS.minLat && lat <= ID_BOUNDS.maxLat && lng >= ID_BOUNDS.minLng && lng <= ID_BOUNDS.maxLng
}

export type PinpointResult =
  | { ok: true; latitude: number | null; longitude: number | null }
  | { ok: false; errors: Record<string, string>; message: string }

/** Validates optional outlet pinpoint (both or neither, global bounds, and Indonesia bounding box). */
export function validatePinpoint(latRaw: unknown, lngRaw: unknown): PinpointResult {
  const lat = parseCoordinate(latRaw, 90)
  const lng = parseCoordinate(lngRaw, 180)
  const errors: Record<string, string> = {}
  if (lat === undefined) errors.latitude = "Latitude angka -90 sampai 90, contoh -6.9456."
  if (lng === undefined) errors.longitude = "Longitude angka -180 sampai 180, contoh 107.5703."
  if (lat === undefined || lng === undefined) {
    return { ok: false, errors, message: "Titik koordinat tidak valid. Periksa format Latitude dan Longitude." }
  }
  if ((lat === null) !== (lng === null)) {
    const missing = lat === null ? "latitude" : "longitude"
    errors[missing] = "Isi latitude dan longitude sekaligus, atau kosongkan keduanya."
    return { ok: false, errors, message: "Titik koordinat tidak valid. Isi latitude dan longitude sekaligus, atau kosongkan keduanya." }
  }
  if (lat === null || lng === null) return { ok: true, latitude: null, longitude: null }
  if (!isInIndonesia(lat, lng)) {
    // Common Indonesian typo: forgetting the leading `-` on Java/Bali/Nusa Tenggara latitudes (`6.9456` instead of `-6.9456`).
    if (lat > ID_BOUNDS.maxLat && lat <= Math.abs(ID_BOUNDS.minLat) && lng >= ID_BOUNDS.minLng && lng <= ID_BOUNDS.maxLng) {
      errors.latitude = "Latitude di luar Indonesia — kemungkinan lupa tanda minus (-) di depan angka, contoh -6.9456."
      return { ok: false, errors, message: errors.latitude }
    }
    if (lat < ID_BOUNDS.minLat || lat > ID_BOUNDS.maxLat) errors.latitude = "Latitude berada di luar wilayah Indonesia (-11,5 sampai 6,5)."
    if (lng < ID_BOUNDS.minLng || lng > ID_BOUNDS.maxLng) errors.longitude = "Longitude berada di luar wilayah Indonesia (94,5 sampai 141,5)."
    if (!Object.keys(errors).length) errors.latitude = "Titik koordinat berada di luar wilayah Indonesia."
    return { ok: false, errors, message: "Titik koordinat berada di luar wilayah Indonesia. Periksa kembali pin lokasi gerai." }
  }
  return { ok: true, latitude: lat, longitude: lng }
}

/**
 * Extracts an Indonesian `{ lat, lng }` pair from pasted operator text:
 * - Google Maps place pin (`!3d-6.9456!4d107.5703` — prioritized over viewport `@lat,lng`)
 * - Google Maps URL (`@-6.9456,107.5703,17z`, `?q=-6.9456,107.5703`, `?query=`, `?ll=`)
 * - OpenStreetMap (`#map=17/-6.9456/107.5703`)
 * - Geo URI (`geo:-6.9456,107.5703`)
 * - Plain pair (`-6.9456, 107.5703` or `-6,9456 ; 107,5703` or `-6.9456 107.5703`)
 */
export function parseLocationInput(raw: string): { lat: number; lng: number } | null {
  const s = raw.trim()
  if (!s) return null
  const tryPair = (a: string, b: string) => {
    const lat = parseCoordinate(a, 90)
    const lng = parseCoordinate(b, 180)
    if (lat == null || lng == null || !isInIndonesia(lat, lng)) return null
    return { lat, lng }
  }
  const patterns: RegExp[] = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)(?:(?:%2C|,)(?:\+|%20|\s)*|(?:\+|%20|\s)+)(-?\d+(?:\.\d+)?)/i,
    /\/maps\/(?:search|place)\/(-?\d+(?:\.\d+)?)(?:(?:%2C|,)(?:\+|%20|\s)*|(?:\+|%20|\s)+)(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i,
    /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/,
    /^\s*(-?\d+,\d+)\s*;\s*(-?\d+,\d+)\s*$/,
  ]
  for (const re of patterns) {
    const m = re.exec(s)
    if (m?.[1] && m[2]) {
      const hit = tryPair(m[1], m[2])
      if (hit) return hit
    }
  }
  return null
}

export function googleMapsPinUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${round6(lat)},${round6(lng)}`
}
