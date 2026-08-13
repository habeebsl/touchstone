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
  const root = dirname(require.resolve('@mediapipe/tasks-vision'))
  const prefix = '/mediapipe/'

  // An explicit allow-list, which is also what keeps the dev middleware from being walked out of.
  // vision_bundle.js is the IIFE build: the worker pulls it in with importScripts rather than an
  // ESM import, which is the only form that works in a classic worker under both dev and build.
  const files = new Map<string, string>(
    readdirSync(join(root, 'wasm')).map((name) => [name, join(root, 'wasm', name)]),
  )
  files.set('vision_bundle.js', join(root, 'vision_bundle.js'))

  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (!url?.startsWith(prefix)) return next()
        const source = files.get(url.slice(prefix.length))
        if (!source) return next()
        res.setHeader('Content-Type', source.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(source))
      })
    },
    generateBundle() {
      for (const [name, source] of files) {
        this.emitFile({ type: 'asset', fileName: `mediapipe/${name}`, source: readFileSync(source) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), mediapipeWasm()],
  // The landmarker worker has to be classic rather than a module: MediaPipe loads its wasm glue
  // with importScripts(), which a module worker forbids. Stated explicitly because the failure it
  // produces — "ModuleFactory not set." — names nothing that would lead you back here.
  worker: { format: 'iife' },
})
