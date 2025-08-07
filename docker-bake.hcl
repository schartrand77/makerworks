# ✅ Allow overriding platform from Makefile or env
variable "PLATFORM" {
  default = "linux/amd64"
}

# ✅ Shared base image tag (no implicit Docker Hub pull)
variable "BASE_IMAGE" {
  default = "makerworks-backend-base:latest"
}

target "backend" {
  context = "./makerworks-backend"
  dockerfile = "Dockerfile"
  tags = ["makerworks-backend:latest"]

  # ✅ Pass platform arg into Dockerfile
  args = {
    TARGETPLATFORM = "${PLATFORM}"
  }

  # ✅ Ensure we only ever build for the requested platform
  platforms = ["${PLATFORM}"]

  # ✅ Use local base image, no Docker Hub lookup
  cache-from = ["${BASE_IMAGE}"]
  output = ["type=docker"]
}

target "worker" {
  context = "./makerworks-backend"
  dockerfile = "Dockerfile"
  tags = ["makerworks-worker:latest"]

  args = {
    WORKER_IMAGE = "true"
    TARGETPLATFORM = "${PLATFORM}"
  }

  platforms = ["${PLATFORM}"]
  cache-from = ["${BASE_IMAGE}"]
  output = ["type=docker"]
}

# ✅ Native ARM64 macOS backend target
target "backend-macos" {
  inherits = ["backend"]
  platforms = ["linux/arm64/v8"]
  args = {
    TARGETPLATFORM = "linux/arm64/v8"
  }
  tags = ["makerworks-backend:macos"]
}

# ✅ Native ARM64 macOS worker target
target "worker-macos" {
  inherits = ["worker"]
  platforms = ["linux/arm64/v8"]
  args = {
    TARGETPLATFORM = "linux/arm64/v8"
    WORKER_IMAGE   = "true"
  }
  tags = ["makerworks-worker:macos"]
}

group "backend-only" {
  targets = ["backend"]
}

group "worker-only" {
  targets = ["worker"]
}

group "macos-only" {
  targets = ["backend-macos", "worker-macos"]
}