import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FIELD_DIMENSIONS } from '../matchEngine/fieldDimensions.js'
import { integrateDiscFlight3D, sampleDiscFlight3D, solveDragPacing, sampleDragPaceU } from '../matchEngine/ai/discPhysics.js'

// --- One throw, defined in real field meters (same coordinate system as the 2D engine) ---
const THROWER = { x: 34, y: 14 }
const RECEIVER_START = { x: 44, y: 26 }
const CATCH_POINT = { x: 61, y: 9 } // out cut toward the sideline
const DEFENDER_START = { x: 43, y: 23 } // trailing the cutter, slightly beaten

const releaseHeightM = 1.1
const peakHeightM = 4.4
const pathLenM = Math.hypot(CATCH_POINT.x - THROWER.x, CATCH_POINT.y - THROWER.y)
const totalFlightMs = Math.round((pathLenM / 15.5) * 1000 + 550) // rough real timing for this distance

const flightSamples = integrateDiscFlight3D({
  totalFlightMs,
  peakHeightM,
  turnFadeAmplitudeM: 1.6,
  turnFadeSign: 1,
})
const pacing = solveDragPacing({ totalFlightMs, pathLenM })

const dirX = (CATCH_POINT.x - THROWER.x) / pathLenM
const dirY = (CATCH_POINT.y - THROWER.y) / pathLenM
const perpX = -dirY
const perpY = dirX

function discPositionAt(ms) {
  const tSec = ms / 1000
  const totalSec = totalFlightMs / 1000
  const u = pacing.valid
    ? sampleDragPaceU(pacing, tSec, totalSec, pathLenM)
    : Math.min(1, Math.max(0, ms / totalFlightMs))
  const { z, lateral } = sampleDiscFlight3D(flightSamples, ms)
  const baseX = THROWER.x + dirX * pathLenM * u
  const baseY = THROWER.y + dirY * pathLenM * u
  return {
    x: baseX + perpX * lateral,
    y: baseY + perpY * lateral,
    z: releaseHeightM + z,
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function runnerPositionAt(from, to, ms, leadFrac = 1) {
  const t = Math.min(1, Math.max(0, (ms / totalFlightMs) * leadFrac))
  const e = easeOutCubic(t)
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }
}

// --- Three.js scene setup ---
const canvasHost = document.getElementById('app')
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
canvasHost.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b0f14)
scene.fog = new THREE.Fog(0x0b0f14, 60, 160)

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400)
const midX = (THROWER.x + CATCH_POINT.x) / 2
const midY = (THROWER.y + CATCH_POINT.y) / 2
camera.position.set(midX - 26, 15, midY + 30)
camera.lookAt(midX, 2, midY)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(midX, 1.5, midY)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.maxPolarAngle = Math.PI * 0.49
controls.minDistance = 8
controls.maxDistance = 90
controls.update()

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.55))
const sun = new THREE.DirectionalLight(0xffffff, 1.1)
sun.position.set(-30, 50, 20)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -60
sun.shadow.camera.right = 60
sun.shadow.camera.top = 60
sun.shadow.camera.bottom = -60
scene.add(sun)

// Field: x = length (0..100), z(three) = width (0..37)
const { lengthM, widthM, endzoneM } = FIELD_DIMENSIONS
function fieldTexture() {
  const canvas = document.createElement('canvas')
  const scale = 12
  canvas.width = lengthM * scale
  canvas.height = widthM * scale
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#2f7d3c'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // alternating mow stripes
  for (let i = 0; i < lengthM; i += 5) {
    ctx.fillStyle = i % 10 === 0 ? '#3a8a48' : '#2f7d3c'
    ctx.fillRect(i * scale, 0, 5 * scale, canvas.height)
  }
  // endzones
  ctx.fillStyle = 'rgba(37, 99, 235, 0.35)'
  ctx.fillRect(0, 0, endzoneM * scale, canvas.height)
  ctx.fillRect((lengthM - endzoneM) * scale, 0, endzoneM * scale, canvas.height)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 3
  ;[0, endzoneM, lengthM - endzoneM, lengthM].forEach((x) => {
    ctx.beginPath()
    ctx.moveTo(x * scale, 0)
    ctx.lineTo(x * scale, canvas.height)
    ctx.stroke()
  })
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(lengthM, widthM),
  new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.95 }),
)
ground.rotation.x = -Math.PI / 2
ground.position.set(lengthM / 2, 0, widthM / 2)
ground.receiveShadow = true
scene.add(ground)

function makePlayer(color) {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 1.05, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  )
  body.position.y = 0.9
  body.castShadow = true
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8c39e, roughness: 0.7 }),
  )
  head.position.y = 1.65
  head.castShadow = true
  group.add(body, head)
  return group
}

const thrower = makePlayer(0xdc2626)
thrower.position.set(THROWER.x, 0, THROWER.y)
scene.add(thrower)

const receiver = makePlayer(0xdc2626)
receiver.position.set(RECEIVER_START.x, 0, RECEIVER_START.y)
scene.add(receiver)

const defender = makePlayer(0xf1f5f9)
defender.position.set(DEFENDER_START.x, 0, DEFENDER_START.y)
scene.add(defender)

const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(0.135, 0.135, 0.02, 28),
  new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.05 }),
)
disc.castShadow = true
scene.add(disc)

// Simple drop-shadow blob under the disc so height reads clearly even from broadcast angle
const discShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.4, 24),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
)
discShadow.rotation.x = -Math.PI / 2
scene.add(discShadow)

// --- Timeline ---
const clockEl = document.getElementById('clock')
const speedSel = document.getElementById('speed')
const replayBtn = document.getElementById('replay')

const PRE_RELEASE_MS = 350
const POST_CATCH_MS = 900
const totalTimelineMs = PRE_RELEASE_MS + totalFlightMs + POST_CATCH_MS
let startedAt = performance.now()

function resetTimeline() {
  startedAt = performance.now()
}
replayBtn.addEventListener('click', resetTimeline)

function tick(now) {
  const speed = Number(speedSel.value)
  const elapsed = (now - startedAt) * speed
  const t = elapsed % totalTimelineMs

  clockEl.textContent = `00:${String(Math.floor((now / 1000) % 60)).padStart(2, '0')}`

  if (t < PRE_RELEASE_MS) {
    disc.position.set(THROWER.x, releaseHeightM, THROWER.y)
    receiver.position.set(RECEIVER_START.x, 0, RECEIVER_START.y)
  } else if (t < PRE_RELEASE_MS + totalFlightMs) {
    const ms = t - PRE_RELEASE_MS
    const p = discPositionAt(ms)
    disc.position.set(p.x, p.z, p.y)
    disc.rotation.z = ms * 0.02
    disc.rotation.x = 0.15
    const r = runnerPositionAt(RECEIVER_START, CATCH_POINT, ms)
    receiver.position.set(r.x, 0, r.y)
    const d = runnerPositionAt(DEFENDER_START, CATCH_POINT, ms, 0.88)
    defender.position.set(d.x, 0, d.y)
  } else {
    disc.position.set(CATCH_POINT.x, releaseHeightM, CATCH_POINT.y)
    receiver.position.set(CATCH_POINT.x, 0, CATCH_POINT.y)
  }

  discShadow.position.set(disc.position.x, 0.01, disc.position.z)

  // face receiver toward run direction, thrower toward receiver
  thrower.lookAt(receiver.position.x, thrower.position.y + 0.9, receiver.position.z)

  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
