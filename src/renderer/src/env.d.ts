/// <reference types="vite/client" />

import type { SpireApi } from '../../shared/types'

declare module '*.png' {
  const src: string
  export default src
}

declare global {
  interface Window {
    spire: SpireApi
  }
}

export {}
