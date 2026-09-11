// Read-only loopback viewer, scoped to one audit directory.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = fs.realpathSync(process.argv[2])
const server = http.createServer((req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'review.html'
    const file = fs.realpathSync(path.resolve(root, relative))
    if (!file.startsWith(root + path.sep) || !/\.(html|json)$/.test(file)) { res.writeHead(403).end(); return }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store'); fs.createReadStream(file).pipe(res)
  } catch { res.writeHead(404).end() }
})
server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/`))
