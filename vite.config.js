import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: { settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } },
    },
  },
})
