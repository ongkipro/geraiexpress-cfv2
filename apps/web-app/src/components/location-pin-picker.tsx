import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type WheelEvent } from "react"
import { ExternalLinkIcon, LocateFixedIcon, MapPinIcon, MinusIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react"
import { googleMapsPinUrl, ID_BOUNDS, INDONESIA_DEFAULT_CENTER, isInIndonesia, parseCoordinate, parseLocationInput } from "@gx/domain/geo"
import { api } from "../lib/api"
import { sanitizeCoord } from "../lib/input"
import { Button } from "./ui/button"
import { Field, FieldError, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"

// Lightweight zero-dependency interactive slippy map pin picker (Gojek/Grab/Shopee center-pin model) built on Web
// Mercator 256px OpenStreetMap raster tiles (no API key). Supports:
// - Drag & tap/click-to-place pin on map, double-click zoom, Ctrl/Cmd+wheel zoom, and keyboard arrow nudge
// - Inline street / landmark / kecamatan search via `/api/app/geocode` with candidate picker
// - GPS geolocation, area-hint lookup, Google Maps URL / coordinate paste, and direct lat/lng editing

const TILE_SIZE = 256
const MIN_ZOOM = 5
const MAX_ZOOM = 18

interface GeoPoint {
  lat: number
  lng: number
  label: string
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function latLngToWorld(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom
  const x = ((lng + 180) / 360) * scale
  const rad = (clamp(lat, -85.0511, 85.0511) * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale
  return { x, y }
}

function worldToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const scale = TILE_SIZE * 2 ** zoom
  const lng = (x / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / scale
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return {
    lat: Math.round(clamp(lat, ID_BOUNDS.minLat, ID_BOUNDS.maxLat) * 1e6) / 1e6,
    lng: Math.round(clamp(lng, ID_BOUNDS.minLng, ID_BOUNDS.maxLng) * 1e6) / 1e6,
  }
}

function tileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

export function LocationPinPicker({
  latitude,
  longitude,
  onChange,
  latError,
  lngError,
  areaHint,
  compact = false,
}: {
  latitude: string
  longitude: string
  onChange: (lat: string, lng: string) => void
  latError?: string
  lngError?: string
  /** Optional area/address label to center the map via `/api/app/geocode`. */
  areaHint?: string | null
  /** Shorter map canvas for onboarding disclosure (`e2e/auth-stage.spec.ts` short-viewport contract). */
  compact?: boolean
}) {
  const parsedLat = parseCoordinate(latitude, 90)
  const parsedLng = parseCoordinate(longitude, 180)
  const hasValidPin = typeof parsedLat === "number" && typeof parsedLng === "number" && isInIndonesia(parsedLat, parsedLng)

  // View center follows valid pin when present; otherwise local fallback center (Jakarta / geocoded area).
  const [fallbackCenter, setFallbackCenter] = useState<{ lat: number; lng: number }>(INDONESIA_DEFAULT_CENTER)
  const [zoom, setZoom] = useState<number>(hasValidPin ? 16 : 11)
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const [mapQuery, setMapQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [candidates, setCandidates] = useState<GeoPoint[]>([])
  const [pasteText, setPasteText] = useState("")
  const [status, setStatus] = useState<{ tone: "safe" | "warn"; text: string } | null>(null)
  const [locating, setLocating] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const dragStart = useRef<{ id: number; x: number; y: number } | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)

  const center = hasValidPin ? { lat: parsedLat, lng: parsedLng } : fallbackCenter
  const world = latLngToWorld(center.lat, center.lng, zoom)
  const viewX = world.x - (drag?.dx ?? 0)
  const viewY = world.y - (drag?.dy ?? 0)
  const maxTile = 2 ** zoom

  // 5×3 tile window around center covers up to ~1024×512 px cleanly with zero blank edges during drag.
  const centerTileX = Math.floor(viewX / TILE_SIZE)
  const centerTileY = Math.floor(viewY / TILE_SIZE)
  const tiles: Array<{ key: string; tx: number; ty: number; left: number; top: number }> = []
  for (let dy = -1; dy <= 1; dy++) {
    const ty = centerTileY + dy
    if (ty < 0 || ty >= maxTile) continue
    for (let dx = -2; dx <= 2; dx++) {
      const tx = ((centerTileX + dx) % maxTile + maxTile) % maxTile
      tiles.push({
        key: `${zoom}-${tx}-${ty}`,
        tx,
        ty,
        left: (centerTileX + dx) * TILE_SIZE - viewX,
        top: ty * TILE_SIZE - viewY,
      })
    }
  }

  function applyCoords(lat: number, lng: number, nextZoom?: number, message?: string) {
    setFallbackCenter({ lat, lng })
    if (nextZoom !== undefined) setZoom(clamp(nextZoom, MIN_ZOOM, MAX_ZOOM))
    onChange(String(lat), String(lng))
    setStatus(message ? { tone: "safe", text: message } : null)
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a, input")) return
    if (e.button !== 0 && e.pointerType === "mouse") return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    setDrag({ dx: 0, dy: 0 })
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || dragStart.current.id !== e.pointerId) return
    setDrag({ dx: e.clientX - dragStart.current.x, dy: e.clientY - dragStart.current.y })
  }

  function finishDrag(e: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || dragStart.current.id !== e.pointerId) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    dragStart.current = null
    setDrag(null)
    if (Math.hypot(dx, dy) < 4) {
      // Tap/click on map canvas places pin directly at the clicked location.
      const rect = mapRef.current?.getBoundingClientRect()
      if (!rect) return
      const offsetX = e.clientX - (rect.left + rect.width / 2)
      const offsetY = e.clientY - (rect.top + rect.height / 2)
      if (Math.hypot(offsetX, offsetY) < 6) return
      const tapped = worldToLatLng(world.x + offsetX, world.y + offsetY, zoom)
      applyCoords(tapped.lat, tapped.lng, undefined, "Pin dipindahkan ke titik yang dipilih.")
      return
    }
    const next = worldToLatLng(world.x - dx, world.y - dy, zoom)
    applyCoords(next.lat, next.lng, undefined, "Pin diperbarui dari peta.")
  }

  function cancelDrag(e: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || dragStart.current.id !== e.pointerId) return
    dragStart.current = null
    setDrag(null)
  }

  function onDoubleClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a, input")) return
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return
    const offsetX = e.clientX - (rect.left + rect.width / 2)
    const offsetY = e.clientY - (rect.top + rect.height / 2)
    const nextZoom = Math.min(MAX_ZOOM, zoom + 1)
    const target = worldToLatLng(world.x + offsetX, world.y + offsetY, zoom)
    applyCoords(target.lat, target.lng, nextZoom, "Peta diperbesar ke titik yang dipilih.")
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom((z) => clamp(z + (e.deltaY < 0 ? 1 : -1), MIN_ZOOM, MAX_ZOOM))
  }

  function onMapKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = 32
    if (e.key === "+" || e.key === "=") {
      e.preventDefault()
      setZoom((z) => Math.min(MAX_ZOOM, z + 1))
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault()
      setZoom((z) => Math.max(MIN_ZOOM, z - 1))
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
      const next = worldToLatLng(world.x + dx, world.y + dy, zoom)
      applyCoords(next.lat, next.lng, undefined, "Pin digeser dengan tombol arah.")
    }
  }

  function locateMe() {
    if (locating) return
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus({ tone: "warn", text: "Perangkat ini tidak mendukung GPS browser. Tempel link Google Maps atau geser peta." })
      return
    }
    setLocating(true)
    setStatus(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6
        const lng = Math.round(pos.coords.longitude * 1e6) / 1e6
        if (!isInIndonesia(lat, lng)) {
          setStatus({ tone: "warn", text: "Lokasi GPS terdeteksi di luar Indonesia. Geser peta atau tempel koordinat gerai." })
          return
        }
        setCandidates([])
        applyCoords(lat, lng, 17, "Lokasi saat ini berhasil diambil. Geser peta bila perlu dirapikan.")
      },
      (err) => {
        setLocating(false)
        setStatus({
          tone: "warn",
          text:
            err.code === err.PERMISSION_DENIED
              ? "Izin lokasi ditolak browser. Aktifkan izin lokasi, atau tempel link Google Maps."
              : "Gagal mendeteksi lokasi GPS. Geser peta manual atau tempel koordinat Google Maps.",
        })
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }

  async function centerFromArea() {
    const q = (areaHint ?? "").trim()
    if (geocoding || q.length < 3) return
    setGeocoding(true)
    setStatus(null)
    setCandidates([])
    try {
      const r = await api<{ point: GeoPoint | null; candidates?: GeoPoint[] }>(`/geocode?q=${encodeURIComponent(q)}`)
      if (r.point && isInIndonesia(r.point.lat, r.point.lng)) {
        applyCoords(r.point.lat, r.point.lng, 15, "Peta diarahkan ke wilayah gerai. Klik atau geser peta tepat ke titik lokasi Anda.")
      } else {
        setStatus({ tone: "warn", text: "Wilayah belum ditemukan di peta. Cari nama jalan di kotak peta atau tempel koordinat Google Maps." })
      }
    } catch {
      setStatus({ tone: "warn", text: "Gagal mencari wilayah di peta. Geser peta manual atau tempel koordinat." })
    } finally {
      setGeocoding(false)
    }
  }

  async function searchOnMap() {
    const q = mapQuery.trim()
    if (searching || q.length < 3) return
    // If operator typed/pasted raw coordinates or Google Maps link into the map search box, handle it directly.
    const direct = parseLocationInput(q)
    if (direct) {
      setCandidates([])
      setMapQuery("")
      applyCoords(direct.lat, direct.lng, 17, "Koordinat berhasil dibaca dan pin dipindahkan.")
      return
    }
    setSearching(true)
    setStatus(null)
    setCandidates([])
    try {
      const r = await api<{ point: GeoPoint | null; candidates?: GeoPoint[] }>(`/geocode?q=${encodeURIComponent(q)}`)
      const list = (r.candidates ?? (r.point ? [r.point] : [])).filter((p) => isInIndonesia(p.lat, p.lng))
      if (list.length > 0) {
        const first = list[0]!
        setCandidates(list.length > 1 ? list : [])
        applyCoords(first.lat, first.lng, 16, `Peta diarahkan ke ${first.label.split(",").slice(0, 2).join(",")}. Klik atau geser peta untuk merapikan pin.`)
      } else {
        setStatus({ tone: "warn", text: "Lokasi tidak ditemukan di peta. Coba nama jalan/kecamatan lebih umum atau tempel link Google Maps." })
      }
    } catch {
      setStatus({ tone: "warn", text: "Pencarian peta sedang gangguan. Geser peta manual atau tempel link Google Maps." })
    } finally {
      setSearching(false)
    }
  }

  function applyPasted(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    const parsed = parseLocationInput(trimmed)
    if (parsed) {
      setPasteText("")
      setCandidates([])
      applyCoords(parsed.lat, parsed.lng, 17, "Koordinat berhasil dibaca dan pin dipindahkan.")
      return
    }
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(trimmed)) {
      setStatus({ tone: "warn", text: "Link pendek Google Maps tidak memuat angka koordinat. Buka di Google Maps, tekan lama titik gerai, lalu salin dua angkanya (contoh: -6.9456, 107.5703)." })
      return
    }
    setStatus({ tone: "warn", text: "Format belum dikenali. Tempel link Google Maps lengkap atau pasangan angka, contoh: -6.9456, 107.5703." })
  }

  function handleSmartPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text")
    const parsed = parseLocationInput(text)
    if (parsed) {
      e.preventDefault()
      setPasteText("")
      setCandidates([])
      applyCoords(parsed.lat, parsed.lng, 17, "Koordinat otomatis dipisahkan ke Latitude & Longitude.")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={locateMe} disabled={locating} className="h-11 md:h-9">
          <LocateFixedIcon aria-hidden /> {locating ? "Mendeteksi lokasi…" : "Lokasi Saya"}
        </Button>
        {areaHint && areaHint.trim().length >= 3 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void centerFromArea()} disabled={geocoding} className="h-11 md:h-9">
            <SearchIcon aria-hidden /> {geocoding ? "Mencari peta…" : "Cari dari Wilayah"}
          </Button>
        ) : null}
        {hasValidPin ? (
          <>
            <a
              href={googleMapsPinUrl(parsedLat, parsedLng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-primary hover:bg-slate-50 md:h-9 md:text-xs"
            >
              Cek di Google Maps <ExternalLinkIcon aria-hidden className="size-3.5" />
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 text-muted-foreground md:h-9"
              onClick={() => {
                onChange("", "")
                setCandidates([])
                setStatus(null)
              }}
            >
              <XIcon aria-hidden /> Hapus titik
            </Button>
          </>
        ) : null}
      </div>

      {/* Inline map search: find a street, landmark, or kecamatan right on the map */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={compact ? "daftar-search-map" : "profil-search-map"}
              aria-label="Cari jalan, patokan, atau kecamatan di peta"
              value={mapQuery}
              onChange={(e) => setMapQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void searchOnMap()
                }
              }}
              placeholder="Cari nama jalan, patokan, atau kecamatan di peta…"
              className="pl-9"
            />
          </div>
          <Button type="button" variant="outline" disabled={searching || mapQuery.trim().length < 3} onClick={() => void searchOnMap()} className="h-11 md:h-9">
            {searching ? "Mencari…" : "Cari di Peta"}
          </Button>
        </div>
        {candidates.length > 1 ? (
          <ul role="listbox" aria-label="Hasil pencarian lokasi di peta" className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-xs shadow-xs">
            {candidates.slice(0, 5).map((c) => (
              <li key={`${c.lat},${c.lng}`}>
                <button
                  type="button"
                  onClick={() => {
                    setCandidates([])
                    applyCoords(c.lat, c.lng, 17, `Pin dipindahkan ke ${c.label.split(",").slice(0, 2).join(",")}.`)
                  }}
                  className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 md:min-h-8"
                >
                  <MapPinIcon aria-hidden className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Interactive slippy map canvas: click/tap or drag the map to place the fixed center pin onto the shop roof. */}
      <div
        ref={mapRef}
        role="application"
        tabIndex={0}
        aria-label="Peta pilih titik koordinat gerai"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onKeyDown={onMapKeyDown}
        className={`relative w-full overflow-hidden rounded-xl border border-slate-300/90 bg-slate-100 select-none touch-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${drag ? "cursor-grabbing" : "cursor-grab"} ${compact ? "h-48" : "h-64 sm:h-72"}`}
        style={{
          backgroundImage: "linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.16) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        {/* Tile layer anchored at exact container center (50%, 50%) */}
        <div className="pointer-events-none absolute top-1/2 left-1/2">
          {tiles.map((t) => (
            <img
              key={t.key}
              src={tileUrl(zoom, t.tx, t.ty)}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer-when-downgrade"
              onError={(e) => {
                e.currentTarget.style.opacity = "0"
              }}
              className="max-w-none"
              style={{
                position: "absolute",
                width: TILE_SIZE,
                height: TILE_SIZE,
                maxWidth: "none",
                transform: `translate3d(${Math.round(t.left)}px, ${Math.round(t.top)}px, 0)`,
              }}
            />
          ))}
        </div>

        {/* Center drop pin */}
        <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
          <div className={`flex flex-col items-center transition-transform duration-100 ${drag ? "-translate-y-1.5 scale-105" : ""}`}>
            <span className={`grid size-9 place-items-center rounded-full shadow-md ring-2 ring-white ${hasValidPin ? "bg-primary text-white" : "bg-slate-700 text-white"}`}>
              <MapPinIcon className="size-5" />
            </span>
            <span className="h-2 w-0.5 bg-slate-900/70" />
          </div>
          <span className={`mx-auto block h-1.5 w-3 rounded-full bg-slate-950/30 blur-[1px] transition-opacity ${drag ? "opacity-40" : "opacity-80"}`} />
        </div>

        {/* Top-left floating guidance pill */}
        <div className="pointer-events-none absolute top-2.5 left-2.5 max-w-[calc(100%-5rem)] rounded-lg bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200/80">
          {hasValidPin ? (
            <span className="flex items-center gap-1.5 tabular-nums">
              <span className="size-1.5 shrink-0 rounded-full bg-safe" aria-hidden />
              <span className="truncate">{parsedLat}, {parsedLng}</span>
            </span>
          ) : (
            <span>Klik atau geser peta untuk meletakkan pin lokasi gerai</span>
          )}
        </div>

        {/* Zoom +/- controls */}
        <div className="absolute right-2.5 bottom-2.5 flex flex-col gap-1">
          <button
            type="button"
            aria-label="Perbesar peta"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
            className="grid size-11 place-items-center rounded-lg border border-slate-200 bg-white/95 text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-40 md:size-9"
          >
            <PlusIcon aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Perkecil peta"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
            className="grid size-11 place-items-center rounded-lg border border-slate-200 bg-white/95 text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-40 md:size-9"
          >
            <MinusIcon aria-hidden className="size-4" />
          </button>
        </div>

        {/* Attribution */}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[11px] text-slate-600 tabular-nums">
          © OpenStreetMap · Z{zoom}
        </div>
      </div>

      {/* Smart paste helper: Google Maps URL or `-6.9456, 107.5703` */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor={compact ? "daftar-paste-map" : "profil-paste-map"}>Tempel link Google Maps atau koordinat</FieldLabel>
          <Input
            id={compact ? "daftar-paste-map" : "profil-paste-map"}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={(e) => {
              const txt = e.clipboardData.getData("text")
              if (parseLocationInput(txt)) {
                e.preventDefault()
                applyPasted(txt)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                applyPasted(pasteText)
              }
            }}
            placeholder="Contoh: -6.9456, 107.5703 atau link Google Maps"
          />
        </Field>
        <Button type="button" variant="outline" disabled={!pasteText.trim()} onClick={() => applyPasted(pasteText)}>
          Terapkan
        </Button>
      </div>

      {status ? (
        <p role="status" className={`border-l-4 py-1 pl-3 text-xs font-medium ${status.tone === "safe" ? "border-safe text-safe" : "border-warn text-warn"}`}>
          {status.text}
        </p>
      ) : null}

      {/* Direct Latitude & Longitude fields (power users & automated tests; pasting a pair auto-splits into both). */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field data-invalid={latError ? true : undefined}>
          <FieldLabel htmlFor={compact ? "daftar-lat" : "latitude"}>Latitude</FieldLabel>
          <Input
            id={compact ? "daftar-lat" : "latitude"}
            name="latitude"
            inputMode="decimal"
            placeholder="-6.9456"
            className="tabular-nums"
            value={latitude}
            onPaste={handleSmartPaste}
            onChange={(e) => {
              setStatus(null)
              onChange(sanitizeCoord(e.target.value), longitude)
            }}
            aria-invalid={latError ? true : undefined}
          />
          {latError ? <FieldError>{latError}</FieldError> : null}
        </Field>
        <Field data-invalid={lngError ? true : undefined}>
          <FieldLabel htmlFor={compact ? "daftar-lng" : "longitude"}>Longitude</FieldLabel>
          <Input
            id={compact ? "daftar-lng" : "longitude"}
            name="longitude"
            inputMode="decimal"
            placeholder="107.5703"
            className="tabular-nums"
            value={longitude}
            onPaste={handleSmartPaste}
            onChange={(e) => {
              setStatus(null)
              onChange(latitude, sanitizeCoord(e.target.value))
            }}
            aria-invalid={lngError ? true : undefined}
          />
          {lngError ? <FieldError>{lngError}</FieldError> : null}
        </Field>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
        {hasValidPin
          ? "Titik koordinat gerai sudah siap dipakai untuk penjemputan Pos Indonesia dan tombol Buka Peta di mini-site."
          : "Titik koordinat wajib untuk penjemputan Pos Indonesia dan membuat tombol Buka Peta di mini-site langsung mengarah ke lokasi tepat gerai."}
      </p>
    </div>
  )
}
