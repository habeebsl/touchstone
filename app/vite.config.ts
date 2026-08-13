import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Serve MediaPipe's wasm from the installed package instead of a CDN.
 *
 * The live preview was loading `@mediapipe/tasks-vision@latest/wasm` from jsDelivr while the
 * bundled JS glue was 1.0.1. A mismatched pair degrades quietly rather than failing: face
 * detection measured 136ms per frame on a real machine, which is what the non-SIMD build costs,
 * and the preview ran at six frames a second. Pinning it to the version actually installed also
 * means the demo does not depend on a CDN being reachable.
 *
 * The three builds are ~12MB each, so they are served out of node_modules rather than copied into
 * the repo. FilesetResolver picks one at runtime by feature detection and fetches only that one.
 */
function mediapipeWasm(): Plugin {
  const require = createRequire(import.meta.url)
  // Resolved via the main entry rather than package.json, which the package's exports map hides.
  const dir = join(dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm')
  const prefix = '/mediapipe/'

  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (!url?.startsWith(prefix)) return next()
        const name = url.slice(prefix.length)
        // Serve only what the package ships, so the middleware cannot be walked out of.
        if (!readdirSync(dir).includes(name)) return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(join(dir, name)))
      })
    },
    generateBundle() {
      for (const name of readdirSync(dir)) {
        this.emitFile({ type: 'asset', fileName: `mediapipe/${name}`, source: readFileSync(join(dir, name)) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), mediapipeWasm()],
})
