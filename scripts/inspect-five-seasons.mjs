// Read-only diagnostics for the already-running benchmark, via its local Node inspector.
// Enable only on the benchmark's PID with process._debugProcess(pid).
import { readFileSync, writeFileSync } from 'node:fs'
const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json()
const socket = new WebSocket(targets[0].webSocketDebuggerUrl)
const expression = process.argv.includes('--capture-manager') ? `(() => {
  const m = globalThis.__fiveSeasonBench, original = m.invoke;
  m.invoke = function(...args) {
    if (args[0] === 'processUltiworldTick') {
      const c = args[3][0];
      this.managerAudit = {date: this.date, playerTeamId: c.playerTeamId, manager: structuredClone(c.managerCareer)};
      this.invoke = original;
    }
    return original.apply(this, args);
  };
  return 'capture armed';
})()` : `JSON.stringify({stage:globalThis.__fiveSeasonBench?.stage,date:globalThis.__fiveSeasonBench?.date,playerTeamId:globalThis.__fiveSeasonBench?.playerTeamId,managerAudit:globalThis.__fiveSeasonBench?.managerAudit})`
socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
socket.onmessage = event => {
  const response = JSON.parse(event.data)
  if (response.id !== 1) return
  const value = response.result?.result?.value ?? response
  console.log(typeof value === 'string' ? value : JSON.stringify(value))
  if (!process.argv.includes('--capture-manager')) {
    const audit = JSON.parse(value)
    audit.benchmarkStartedAt = JSON.parse(readFileSync('artifacts/five-seasons-2026-09-21/results.json', 'utf8')).startedAt
    writeFileSync('artifacts/five-seasons-2026-09-21/manager-audit.json', JSON.stringify(audit, null, 2))
  }
  socket.close()
}
