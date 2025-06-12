<p align="center">
  <img src="assets/mwbanner-v3.svg" alt="MakerWorks banner" width="100%" />
</p>

<div align="center">

### MakerWorks

💡 A next-generation platform for managing, estimating, and ordering 3D prints — built for creators, powered by visionOS-inspired UI.

[Frontend Repo](https://github.com/schartrand77/makerworks-frontend) • 
[Backend Repo](https://github.com/schartrand77/makerworks-backend) • 
[Live Demo](https://makerworks.app) _(coming soon)_  

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build](https://img.shields.io/github/actions/workflow/status/schartrand77/makerworks/link-check.yml?label=link%20check)
![Made with Love](https://img.shields.io/badge/made%20with-%F0%9F%92%96-red)

</div>

---

## ✨ Overview

**MakerWorks** is a full-stack, AAAA-grade 3D printing app designed with the aesthetics of Liquid Glass OS and the performance of top-tier engineering. It integrates:

- 📦 STL/3MF uploads
- 📸 Instant thumbnails & metadata
- 🎨 Filament selection with cost/time estimates
- 🛒 Checkout with Stripe
- 🌐 Realtime backend with FastAPI + PostgreSQL
- 🔐 Auth (magic link, OAuth, sessions)
- 🌈 Gorgeous VisionOS-inspired UI (React + Tailwind)

---

## 🔧 Monorepo Structure

```bash
makerworks/
├── docs/                    # Architecture, roadmap
├── assets/                 # Logos, banners, screenshots
├── .github/workflows/      # CI scripts (lint, link-check, etc.)
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
