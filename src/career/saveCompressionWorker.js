// Runs the expensive lz-string compression off the main thread (see saveStore.js).
// A save's JSON can be several MB once a career has progressed, and compressing
// it synchronously froze the UI for multiple seconds on every checkpoint save.
import { compressToUTF16 } from 'lz-string'

self.onmessage = (event) => {
  const { id, json } = event.data
  const compressed = compressToUTF16(json)
  self.postMessage({ id, compressed })
}
