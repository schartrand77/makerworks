import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

interface ModelViewerProps {
  src?: string          // STL/GLB/3MF URL
  fallbackSrc?: string  // fallback URL
  previewImage?: string // optional image fallback
  webmVideo?: string    // optional turntable webm
  color?: string
  className?: string
}

export default function ModelViewer({
  src,
  fallbackSrc,
  previewImage,
  webmVideo,
  color = '#999999',
  className,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    // If we’re showing an image/video preview, skip WebGL.
    if (previewImage || webmVideo) {
      setLoading(false)
      return
    }

    let mounted = true
    let frameId = 0

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10_000)
    camera.position.set(0, 0, 200)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    rendererRef.current = renderer
    const canvas = renderer.domElement
    canvasRef.current = canvas

    // Append canvas safely
    try {
      if (node.isConnected) node.appendChild(canvas)
    } catch (e) {
      console.error('[ModelViewer] appendChild failed', e)
      setError('Viewer failed to attach.')
      setLoading(false)
      return () => {}
    }

    const resize = () => {
      // Guard against race where node is detached
      if (!node.isConnected) return
      const w = node.clientWidth || 1
      const h = node.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }

    // Observe size, but don’t crash if observer hates the node
    try {
      const ro = new ResizeObserver(resize)
      observerRef.current = ro
      ro.observe(node)
    } catch (e) {
      console.warn('[ModelViewer] ResizeObserver unavailable or failed; using window resize', e)
      window.addEventListener('resize', resize)
    }
    // Initial size
    resize()

    // Lights
    const key = new THREE.DirectionalLight(0xffffff, 1.0)
    key.position.set(3, 4, 5)
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xffffff, 0.4)
    fill.position.set(-3, -2, 4)
    scene.add(fill)

    const amb = new THREE.AmbientLight(0xffffff, 0.35)
    scene.add(amb)

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    const animate = () => {
      if (!mounted) return
      controls.update()
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }

    const fitCameraToObject = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj)
      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)

      const maxDim = Math.max(size.x || 1, size.y || 1, size.z || 1)
      const fov = (camera.fov * Math.PI) / 180
      let dist = (maxDim / 2) / Math.tan(fov / 2)
      dist *= 1.3

      camera.near = Math.max(dist / 1000, 0.1)
      camera.far = dist * 1000
      camera.updateProjectionMatrix()

      camera.position.copy(center)
      camera.position.x += dist
      camera.position.y += dist * 0.15
      camera.position.z += dist

      controls.target.copy(center)
      controls.update()
    }

    const load = async () => {
      setLoading(true)
      const urlToLoad = src || fallbackSrc
      if (!urlToLoad) {
        setError('No model URL provided.')
        setLoading(false)
        return
      }
      const ext = urlToLoad.split('.').pop()?.toLowerCase()
      try {
        if (ext === 'glb') {
          const loader = new GLTFLoader()
          loader.load(
            urlToLoad,
            (gltf) => {
              if (!mounted) return
              scene.add(gltf.scene)
              fitCameraToObject(gltf.scene)
              setLoading(false)
              animate()
            },
            undefined,
            (err) => {
              console.error('[ModelViewer] GLB load error', err)
              setError('Failed to load GLB.')
              setLoading(false)
            }
          )
        } else if (ext === 'stl' || ext === '3mf') {
          const loader = new STLLoader()
          loader.load(
            urlToLoad,
            (geometry) => {
              if (!mounted) return
              geometry.center()
              geometry.computeBoundingSphere()

              const material = new THREE.MeshPhongMaterial({
                color,
                specular: 0x111111,
                shininess: 200,
              })
              const mesh = new THREE.Mesh(geometry, material)

              // 👉 Normalize orientation: most STLs are Z-up; Three is Y-up.
              // Rotate -90° around X so the model stands upright and matches PNG thumbnails.
              mesh.rotation.x = -Math.PI / 2

              scene.add(mesh)
              fitCameraToObject(mesh)
              setLoading(false)
              animate()
            },
            undefined,
            (err) => {
              console.error('[ModelViewer] STL/3MF load error', err)
              setError('Failed to load STL/3MF.')
              setLoading(false)
            }
          )
        } else {
          setError('Unsupported model format.')
          setLoading(false)
        }
      } catch (e) {
        console.error('[ModelViewer] load() error', e)
        setError('Failed to load model.')
        setLoading(false)
      }
    }

    load()

    return () => {
      mounted = false
      cancelAnimationFrame(frameId)

      try {
        observerRef.current?.disconnect()
      } catch {}
      observerRef.current = null

      // Remove canvas only if still present
      try {
        if (node.isConnected && canvas && node.contains(canvas)) {
          node.removeChild(canvas)
        }
      } catch (e) {
        console.warn('[ModelViewer] safe removeChild failed', e)
      }

      try {
        controls.dispose()
      } catch {}
      try {
        renderer.dispose()
      } catch {}

      // Dispose scene resources without yanking DOM children React manages
      try {
        scene.traverse((obj: any) => {
          if (obj.geometry) obj.geometry.dispose?.()
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose?.())
            else obj.material.dispose?.()
          }
        })
      } catch {}
    }
  }, [src, fallbackSrc, previewImage, webmVideo, color])

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

