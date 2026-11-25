import { describe, expect, it, vi } from "vitest"
import { buildGeocodeQueries, geocodeIndonesia } from "../../src/lib/geocode"

function fakeKv() {
  const store = new Map<string, string>()
  return {
    store,
    kv: {
      async get(key: string, type?: string) {
        const raw = store.get(key)
        if (raw === undefined) return null
        return type === "json" ? JSON.parse(raw) : raw
      },
      async put(key: string, value: string) {
        store.set(key, value)
      },
    } as unknown as Env["CACHE_KV"],
  }
}

describe("geocodeIndonesia", () => {
  it("builds progressively broader fallback queries for comma-separated addresses", () => {
    expect(buildGeocodeQueries("Dago, Coblong, Kota Bandung, Jawa Barat")).toEqual([
      "Dago, Coblong, Kota Bandung, Jawa Barat",
      "Coblong, Kota Bandung, Jawa Barat",
      "Kota Bandung, Jawa Barat",
    ])
  })

  it("queries Nominatim on KV cache miss (null) in production, caches wrapped envelope, and serves cache hit on second call", async () => {
    const { kv, store } = fakeKv()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { lat: "-6.8915123", lon: "107.6107456", display_name: "Coblong, Kota Bandung, Jawa Barat, Indonesia" },
          { lat: "40.7128", lon: "-74.0060", display_name: "Outside Indonesia" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    const env = { GX_ENV: "production", CACHE_KV: kv } as Pick<Env, "GX_ENV" | "CACHE_KV">
    const first = await geocodeIndonesia(env, "Coblong, Bandung", undefined, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(first.point).toEqual({ lat: -6.891512, lng: 107.610746, label: "Coblong, Kota Bandung, Jawa Barat, Indonesia" })
    expect(first.candidates).toHaveLength(1)
    expect(store.has("geocode:v2:coblong, bandung")).toBe(true)

    const second = await geocodeIndonesia(env, "Coblong, Bandung", undefined, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it("falls back to broader kecamatan/city query when subdistrict query returns empty", async () => {
    const { kv } = fakeKv()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: "-6.914744", lon: "107.60981", display_name: "Kota Bandung, Jawa Barat" }]), {
          status: 200,
        }),
      )

    const env = { GX_ENV: "staging", CACHE_KV: kv } as Pick<Env, "GX_ENV" | "CACHE_KV">
    const res = await geocodeIndonesia(env, "Kampung Fiktif, Coblong, Kota Bandung, Jawa Barat", undefined, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(res.point).toMatchObject({ lat: -6.914744, lng: 107.60981 })
  })
})
