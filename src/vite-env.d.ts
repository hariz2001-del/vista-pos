/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** '1' runs against the in-browser stand-in and demo menu. Never set in production. */
  readonly VITE_DEMO?: string
  readonly VITE_DUITNOW_QR_IMAGE_URL?: string
  readonly VITE_USE_MOCK_CHECKOUT?: string
  /** vistahub.my, for the "register a business" link. Defaults to the live hub. */
  readonly VITE_HUB_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
