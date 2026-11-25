import { describe, expect, it } from "vitest"
import { googleMapsPinUrl, isInIndonesia, parseCoordinate, parseLocationInput, validatePinpoint } from "../src/geo"

describe("geo pinpoint validation & smart parser", () => {
  it("treats blank and whitespace-only strings as null (never Null Island 0)", () => {
    expect(parseCoordinate("", 90)).toBeNull()
    expect(parseCoordinate("   ", 90)).toBeNull()
    expect(parseCoordinate("\t\n", 180)).toBeNull()
    expect(validatePinpoint("  ", " ")).toEqual({ ok: true, latitude: null, longitude: null })
  })

  it("validates global bounds, pairs, (0,0), and Indonesia bounding box with helpful minus-sign hint", () => {
    expect(validatePinpoint("-6,9456", "107.5703")).toEqual({ ok: true, latitude: -6.9456, longitude: 107.5703 })
    expect(validatePinpoint(5.55, 95.32)).toEqual({ ok: true, latitude: 5.55, longitude: 95.32 }) // Banda Aceh
    expect(validatePinpoint(-2.5916, 140.669)).toEqual({ ok: true, latitude: -2.5916, longitude: 140.669 }) // Jayapura
    expect(validatePinpoint(95, 107)).toMatchObject({ ok: false, errors: { latitude: expect.stringContaining("-90 sampai 90") } })
    expect(validatePinpoint("-6.9", "")).toMatchObject({ ok: false, errors: { longitude: expect.stringContaining("sekaligus") } })
    expect(validatePinpoint(0, 0)).toMatchObject({ ok: false })
    expect(validatePinpoint("6.9456", "107.5703")).toMatchObject({ ok: false, errors: { latitude: expect.stringContaining("minus (-)") } })
    expect(isInIndonesia(0, 0)).toBe(false)
  })

  it("extracts coordinates from Google Maps URLs, OSM URLs, geo URIs, and pasted pairs", () => {
    // Prioritizes exact place pin (!3d/!4d) over viewport center (@lat,lng)
    expect(
      parseLocationInput("https://www.google.com/maps/place/Gerai/@-6.9000,107.6000,17z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d-6.945612!4d107.570345!16s"),
    ).toEqual({ lat: -6.945612, lng: 107.570345 })
    expect(parseLocationInput("https://www.google.com/maps/@-6.9456,107.5703,18z")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("https://maps.google.com/?q=-6.2088,106.8456")).toEqual({ lat: -6.2088, lng: 106.8456 })
    expect(parseLocationInput("https://maps.google.com/?q=-6.9456,+107.5703")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("https://maps.google.com/?q=-6.9456%2C%20107.5703")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("https://www.google.com/maps/search/?api=1&query=-6.9456%2C+107.5703")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("https://www.google.com/maps/search/-6.9456,+107.5703")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("https://www.openstreetmap.org/#map=17/-6.9456/107.5703")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("geo:-6.9456,107.5703")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("-6.9456, 107.5703")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("-6,9456 ; 107,5703")).toEqual({ lat: -6.9456, lng: 107.5703 })
    expect(parseLocationInput("not a location")).toBeNull()
    expect(parseLocationInput("40.7128, -74.0060")).toBeNull() // outside Indonesia
    expect(googleMapsPinUrl(-6.9456, 107.5703)).toBe("https://www.google.com/maps/search/?api=1&query=-6.9456,107.5703")
  })
})
