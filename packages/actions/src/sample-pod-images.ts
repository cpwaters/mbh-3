// Sample Proof-of-Delivery images for the founder's test invoice email
// (sendTestInvoiceEmail — see drain.ts). Real deliveries attach the driver's
// actual signature/photos; this synthetic pair exists so the debug tool
// exercises the SAME inline-image rendering path (invoiceHtml's "Proof of
// delivery" section) rather than silently skipping it, which would make a
// passing test email prove less than it appears to.
//
// Generated PNGs, inlined as base64 so this package stays dependency- and
// filesystem-free (it runs inside the bundled Cloud Function).
//
// Decoded lazily inside functions, NEVER at module scope: this package's
// barrel is imported by apps/web, so anything that runs on import also runs
// in the browser — where `Buffer` is undefined. A top-level Buffer.from()
// here threw on load and took the whole web app down with it (caught by
// e2e, since Node-based unit tests have Buffer and never noticed).

const SIGNATURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAPAAAABaCAIAAAAJsExNAAACcklEQVR42u3d21HDMBBA0e2CCuiI/luBApgJxJbkfZw7/BIs" +
  "+aDYjpPEt9SoMAUCWgJaAloCWkBLQEtAS0BLQAtoCWgJaAloCWgBLQGt7X18fv3+MS1A1xb8+gdolUdMNtCdKU+WDXRnygNZ" +
  "A12G8u4HAVp7KSd8ZKD1NrgzfwhoFUY2hzXQzSlPYw309zRMvU0DPXFdbGwa6Ll0WrIGerqYZqaBBqWVaaA9lbdiDTTNrUwD" +
  "DcQfowCa5vJHonXHAvT0w4xmpoG2MLc6/ACa5lamgaa51UhjOMHL+2nam0GqvOkrIF7ylicrQhLccXlgjWf/9Z5AOTPruDO8" +
  "irN/57cGLsyr/u2PzVvcH2fLE3PvoP5z1PdXiqSg094SeWa/Tr6s8e6cHJjGWDXmaWuVK3SXjW6dzFg4/oEHkZMp3/zFTZMZ" +
  "yyei/Q5uOd7lZx1P4Ykk01Fuuep6Y12GNf550M1Mbzol6q05ielIPkHlzorGUk7COmrNVImzouGaF05mCtBFX1G7v80lhnx4" +
  "I2+yzgK6nOlVW1vrIziemtv/X9dLBLoK6x1XlxMOec4H6sX5kfRbmJObTrIxZ16ciup0Mi8Y2dbFtE+JuV4pzPakk2GdeJxU" +
  "8oO9fTcUxOPD6Eo5z7WFQufiGa9DJ4SV4e6iM3+6zUeQVQJ9knW2G+U2bUmPOwFrg956IJX8ns+FW9X1ptaSoP95IHX5/trk" +
  "O/vyRvq62NSg3+LY77uBffNxT9D7WFc/MeK4MOi1sksfPnLcCvRl3PYo0BLQEtAS0BLQAloCWgJaAloCWkBLQEtAS0BLQAto" +
  "CWgJaAloCWgBLQEtPdYP9QsdTgonqUsAAAAASUVORK5CYII=";

const PHOTO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAIAAAAUvlBOAAACJElEQVR42u3ZuQ3CUBAE0K2LCmiFy/jA3KVQAa0QUwBEhJRA" +
  "SkBkeSUbPWnCCazVC741cbs/RHpPOIGAJWAJWCJgCVgClghYApaAJQKWgCVgiYAlYAlYImAJWAKWCFgCloAlApaAJWCJgCXD" +
  "g/V8vUV6D1gCloAlYLmCgCVgCVgiYAlYAlb3XM/TQeX72y7FZFAZy93AAgsssMACCyywwAILLLDAAgsssMACCyywwAILLLDA" +
  "AgsssMACCyywwAILLLDAAgsssMACCyywwAILLLDAAgsssMACCyywwAJr/LBEwBKwBCyR/mF5IP/fjwVYYIEFFlhggQUWWGCB" +
  "BRZYYIEFFlhggQUWWGCBBRZYYIEFFlhggQUWWGCBBRZYYIEFFlhggQUWWGCBBRZYYIEFFlhggQUWWGCNH5bID1jzZV01h9W6" +
  "nS2qst4vi03TntbVbrFq6s2xKLcKCh0K4UAKGYVwIIWMQjiQQkYhHEghoxAOpJBRCAdSyCiEAylkFMKBFDIK4UAKGYVwIIWM" +
  "gklHwaSjYNJRMOk4kIJJR8Gko2DScSAFk46CSUfBpONACiYdBZOOgknHgRRMOgomHQWTjgMpmHQUTDoKJh0HUjDpKJh0FEw6" +
  "DqRg0lEw6SiYdBxIwaSjYNJRMOk4kIJJR8Gko2DScSAFk46CSUfBpOOCCiYdBZOOgklHQcGko2DSUTDpKCiYdBRMOgomHQUF" +
  "k46CSUfhLwsfyHlbQQQvUAMAAAAASUVORK5CYII=";

export function sampleSignaturePng(): Buffer {
  return Buffer.from(SIGNATURE_PNG_BASE64, 'base64');
}

export function samplePhotoPng(): Buffer {
  return Buffer.from(PHOTO_PNG_BASE64, 'base64');
}
