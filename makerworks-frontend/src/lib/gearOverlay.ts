// src/lib/gearOverlay.ts
// Tiny singleton overlay that animates a ⚙️ bouncing across the viewport and can dock to an element.
// No frameworks, no dependencies.

type Vec2 = { x: number; y: number }
type PlayOpts = {
  startAt?: Vec2 // starting pixel position (center)
  startRect?: DOMRect // or a DOMRect to compute center from
  bounces?: number // total wall collisions before finishing (default 8)
  speed?: number // initial speed in px/s (default 900)
  gravity?: number // px/s^2 (default 1800)
  restitution?: number // energy kept on bounce (0..1, default 0.75)
  durationCapMs?: number // safety cap (default 6000)
  after?: 'fade' | 'dock'
  dockSelector?: string // required if after === 'dock'
}

class GearOverlay {
  private el: HTMLSpanElement | null = null
  private raf = 0
  private running = false

  private ensureEl() {
    if (this.el) return this.el
    const el = document.createElement('span')
    el.textContent = '⚙️'
    el.style.position = 'fixed'
    el.style.left = '0px'
    el.style.top = '0px'
    el.style.willChange = 'transform, opacity'
    el.style.fontSize = '28px'
    el.style.pointerEvents = 'none'
    el.style.zIndex = '2147483647' // over everything
    el.style.opacity = '0'
    el.style.transform = 'translate3d(-9999px,-9999px,0)'
    document.body.appendChild(el)
    this.el = el
    return el
  }

  private stop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private centerOfRect(r: DOMRect): Vec2 {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  /** Main animation: bounce around, then fade or dock. */
  async play(opts: PlayOpts = {}) {
    if (this.running) this.stop()
    const el = this.ensureEl()
    const bounds = { w: window.innerWidth, h: window.innerHeight }
    const margin = 16
    const size = 28 // font-size approximation for collision
    const half = size / 2

    const startPos: Vec2 =
      opts.startAt ??
      (opts.startRect ? this.centerOfRect(opts.startRect) : { x: bounds.w / 2, y: bounds.h / 2 })

    let x = startPos.x
    let y = startPos.y

    const speed = opts.speed ?? 900
    const angle = Math.random() * Math.PI * 2
    let vx = Math.cos(angle) * speed
    let vy = Math.sin(angle) * speed

    const gravity = opts.gravity ?? 1800
    const restitution = opts.restitution ?? 0.75
    let bouncesLeft = Math.max(1, opts.bounces ?? 8)
    const t0 = performance.now()
    const cap = opts.durationCapMs ?? 6000

    this.running = true
    el.style.opacity = '1'
    el.style.transition = 'none'

    const step = (t: number) => {
      if (!this.running) return
      const dt = Math.min(32, t - (this as any)._lt ?? 16) / 1000
      ;(this as any)._lt = t

      // physics
      vy += gravity * dt
      x += vx * dt
      y += vy * dt

      // collisions (walls)
      let collided = false
      if (x < margin + half) {
        x = margin + half
        vx = -vx * restitution
        collided = true
      } else if (x > bounds.w - margin - half) {
        x = bounds.w - margin - half
        vx = -vx * restitution
        collided = true
      }
      if (y < margin + half) {
        y = margin + half
        vy = -vy * restitution
        collided = true
      } else if (y > bounds.h - margin - half) {
        y = bounds.h - margin - half
        vy = -vy * restitution
        collided = true
      }
      if (collided) bouncesLeft--

      // draw
      el.style.transform = `translate3d(${x - half}px, ${y - half}px, 0) rotate(${t * 0.6}deg)`

      const timedOut = t - t0 > cap
      if (timedOut || bouncesLeft <= 0) {
        this.stop()
        if (opts.after === 'dock' && opts.dockSelector) {
          this.dockTo(opts.dockSelector, { from: { x, y } })
        } else {
          el.style.transition = 'opacity 280ms ease-out, transform 320ms ease-out'
          el.style.opacity = '0'
          el.style.transform = `translate3d(${x - half}px, ${y - half}px, 0) scale(0.7) rotate(${t * 0.6}deg)`
          setTimeout(() => {
            if (this.el === el) el.style.transform = 'translate3d(-9999px,-9999px,0)'
          }, 320)
        }
        return
      }
      this.raf = requestAnimationFrame(step)
    }

    // initialize position
    el.style.transform = `translate3d(${x - half}px, ${y - half}px, 0) rotate(0deg)`
    this.raf = requestAnimationFrame(step)
  }

  /** Animate to the center of target selector and vanish into it. */
  dockTo(selector: string, opts?: { from?: Vec2 }) {
    const el = this.ensureEl()
    const target = document.querySelector(selector) as HTMLElement | null
    if (!target) {
      // no target, just fade
      el.style.transition = 'opacity 200ms ease-out'
      el.style.opacity = '0'
      setTimeout(() => (el.style.transform = 'translate3d(-9999px,-9999px,0)'), 220)
      return
    }

    const rect = target.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2

    const start = opts?.from
    if (start) {
      el.style.transition = 'none'
      el.style.opacity = '1'
      el.style.transform = `translate3d(${start.x - 14}px, ${start.y - 14}px, 0) rotate(0deg)`
      // next frame, tween
      requestAnimationFrame(() => {
        el.style.transition = 'transform 500ms cubic-bezier(.2,.8,.2,1), opacity 500ms linear'
        el.style.transform = `translate3d(${cx - 14}px, ${cy - 14}px, 0) scale(0.85)`
        el.style.opacity = '0'
        setTimeout(() => (el.style.transform = 'translate3d(-9999px,-9999px,0)'), 520)
      })
    } else {
      el.style.transition = 'transform 500ms cubic-bezier(.2,.8,.2,1), opacity 500ms linear'
      el.style.transform = `translate3d(${cx - 14}px, ${cy - 14}px, 0) scale(0.85)`
      el.style.opacity = '0'
      setTimeout(() => (el.style.transform = 'translate3d(-9999px,-9999px,0)'), 520)
    }
  }

  /** Convenience: play exit from a DOMRect and just fade. */
  playExitFromRect(r: DOMRect) {
    return this.play({ startRect: r, bounces: 10, after: 'fade' })
  }

  /** Convenience: playful entrance that ends docked to the navbar gear. */
  playEnterAndDock() {
    return this.play({
      bounces: 8,
      after: 'dock',
      dockSelector: '#gear-dock',
      // start a bit off-screen for drama
      startAt: { x: -40, y: 60 + Math.random() * 120 },
      speed: 1000,
    })
  }
}

export const gearOverlay = new GearOverlay()
export default gearOverlay
