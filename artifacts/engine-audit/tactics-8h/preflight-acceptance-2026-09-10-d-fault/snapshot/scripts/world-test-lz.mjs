import { createRequire } from 'node:module'
const lz = createRequire(import.meta.url)('lz-string')
export const { compressToUTF16, decompressFromUTF16 } = lz
export default lz
