import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

interface ModelViewerProps {
  src?: string          // STL/GLB/3MF URL
  fallbackSrc?: string  // fallback URL
  previewImage?: string // optional image fallback
  webmVideo?: string    // optional turntable webm
  color?: string
  className?: string
  /** extra framing around model when fitting (1 = snug) */
  fitMargin?: number
  /** re-fit camera on container resize (default true) */
  refitOnResize?: boolean
}

export default function ModelViewer({
  src,
  fallbackSrc,
  previewImage,
  webmVideo,
  color = '#999999',
  className,
  fitMargin = 1.35,              // a bit more breathing room
  refitOnResize = true,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)

  const observerRef = useRef<ResizeObserver | null>(null)
  const objectRef = useRef<THREE.Object3D | null>(null)
  const frameRef = useRef<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Build renderer/scene/camera/controls once
  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    // If we’re showing an image/video preview, skip WebGL entirely.
    if (previewImage || webmVideo) {
      setLoading(false)
      return
    }

    let mounted = true

    const scene = new THREE.Scene()
    scene.background = null
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000)
    camera.position.set(0, 0, 1)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    // @ts-expect-error - older three types may not include outputColorSpace
    renderer.outputColorSpace = THREE.SRGBColorSpace ?? (THREE as any).LinearSRGBColorSpace
    rendererRef.current = renderer

    try {
      if (node.isConnected) node.appendChild(renderer.domElement)
    } catch (e) {
      console.error('[ModelViewer] appendChild failed', e)
      setError('Viewer failed to attach.')
      setLoading(false)
      return
    }

    // Lights
    const amb = new THREE.AmbientLight(0xffffff, 0.9)
    const key = new THREE.DirectionalLight(0xffffff, 0.7); key.position.set(3, 4, 5)
    const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-4, 2, -3)
    scene.add(amb, key, rim)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.8
    controls.zoomSpeed = 0.8
    controls.screenSpacePanning = false
    controlsRef.current = controls

    const resize = () => {
      if (!node || !rendererRef.current || !cameraRef.current) return
      const w = Math.max(1, node.clientWidth)
      const h = Math.max(1, node.clientHeight)
      rendererRef.current.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      if (refitOnResize && objectRef.current) fitToObject(objectRef.current, fitMargin)
    }

    try {
      const ro = new ResizeObserver(resize)
      observerRef.current = ro
      ro.observe(node)
    } catch {
      window.addEventListener('resize', resize)
    }
    resize()

    const tick = () => {
      if (!mounted) return
      controls.update()
      renderer.render(scene, camera)
      frameRef.current = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      mounted = false
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
      try { observerRef.current?.disconnect() } catch {}
      observerRef.current = null
      try { controls.dispose() } catch {}
      controlsRef.current = null
      disposeObject(objectRef.current)
      objectRef.current = null
      try { renderer.dispose() } catch {}
      try {
        if (node.isConnected && renderer.domElement && node.contains(renderer.domElement)) {
          node.removeChild(renderer.domElement)
        }
      } catch {}
      scene.clear()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewImage, webmVideo])

  // Load model when src changes
  useEffect(() => {
    if (previewImage || webmVideo) return
    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!scene || !camera) return

    const urlToLoad = src || fallbackSrc
    if (!urlToLoad) {
      setError('No model URL provided.')
      setLoading(false)
      return
    }

    let cancelled = false
    setError(null)
    setLoading(true)

    if (objectRef.current) {
      scene.remove(objectRef.current)
      disposeObject(objectRef.current)
      objectRef.current = null
    }

    const ext = urlToLoad.split('.').pop()?.toLowerCase()
    if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader()
      loader.load(
        urlToLoad,
        (gltf) => {
          if (cancelled) return
          const root = gltf.scene || gltf.scenes?.[0]
          if (!root) {
            setError('GLB contains no scene.')
            setLoading(false)
            return
          }
          root.updateMatrixWorld(true)
          scene.add(root)
          objectRef.current = root
          fitToObject(root, fitMargin)
          setLoading(false)
        },
        undefined,
        (err) => {
          if (cancelled) return
          console.error('[ModelViewer] GLB load error', err)
          setError('Failed to load GLB.')
          setLoading(false)
        }
      )
    } else if (ext === 'stl') {
      const loader = new STLLoader()
      loader.load(
        urlToLoad,
        (geometry) => {
          if (cancelled) return
          geometry.center()
          geometry.computeBoundingBox()
          geometry.computeBoundingSphere()

          const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.6,
            metalness: 0.0,
            flatShading: false,
          })
          const mesh = new THREE.Mesh(geometry, material)
          // Most STLs are Z-up; rotate to Y-up
          mesh.rotation.x = -Math.PI / 2
          mesh.updateMatrixWorld(true)

          scene.add(mesh)
          objectRef.current = mesh
          fitToObject(mesh, fitMargin)   // re-fit AFTER rotation
          setLoading(false)
        },
        undefined,
        (err) => {
          if (cancelled) return
          console.error('[ModelViewer] STL load error', err)
          setError('Failed to load STL.')
          setLoading(false)
        }
      )
    } else if (ext === '3mf') {
      const loader = new ThreeMFLoader()
      loader.load(
        urlToLoad,
        (group) => {
          if (cancelled) return
          group.updateMatrixWorld(true)
          scene.add(group)
          objectRef.current = group
          fitToObject(group, fitMargin)
          setLoading(false)
        },
        undefined,
        (err) => {
          if (cancelled) return
          console.error('[ModelViewer] 3MF load error', err)
          setError('Failed to load 3MF.')
          setLoading(false)
        }
      )
    } else {
      setError('Unsupported model format.')
      setLoading(false)
    }

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fallbackSrc, previewImage, webmVideo, color, fitMargin])

  /**
   * Proper fit using vertical & horizontal FoV against a bounding *sphere*.
   * This avoids the “too close” bug from box height/width only.
   */
  const fitToObject = (object: THREE.Object3D, margin = 1.35) => {
    const camera = cameraRef.current!
    const controls = controlsRef.current!

    // Compute world-space bounds
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    // Bounding sphere radius that encloses the box (safe upper-bound)
    const radius = size.length() * 0.5  // diagonal / 2

    // FoVs
    const vFov = THREE.MathUtils.degToRad(camera.fov)                // vertical
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1)) // horizontal

    // Distances required to fit sphere in each FoV
    const distV = radius / Math.sin(vFov / 2)
    const distH = radius / Math.sin(hFov / 2)
    const distance = margin * Math.max(distV, distH)

    // Position camera straight out on +Z looking at center
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance))

    camera.near = Math.max(distance / 100, 0.01)
    camera.far = distance * 100
    camera.updateProjectionMatrix()

    controls.target.copy(center)
    controls.minDistance = distance / 10
    controls.maxDistance = distance * 10
    controls.update()
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-64 md:h-96 rounded-xl overflow-hidden bg-black/10 flex items-center justify-center relative ${className ?? ''}`}
    >
      {previewImage && (
        <img src={previewImage} alt="Model preview" className="object-contain w-full h-full" />
      )}

      {!previewImage && webmVideo && (
        <video
          src={webmVideo}
          autoPlay
          loop
          muted
          controls
          className="object-contain w-full h-full"
        />
      )}

      {!previewImage && !webmVideo && (
        <>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur text-white text-sm">
              Loading…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center text-sm text-red-600 dark:text-red-400 bg-black/20 backdrop-blur">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ----------------- utils ----------------- */
function disposeObject(obj: THREE.Object3D | null) {
  if (!obj) return
  obj.traverse((o: any) => {
    if (o.geometry) o.geometry.dispose?.()
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose?.())
      else o.material.dispose?.()
    }
  })
}
