# MakerWorks Frontend

MakerWorks Frontend is a responsive React application powered by Vite and TypeScript. The goal of MakerWorks is to provide a sleek interface for uploading 3D models, estimating material costs and securely checking out prints. It comes with a full authentication flow, admin dashboard and an animated landing page.

## Features

- **Modern React stack** – built with React 18, Vite and TypeScript for fast development.
- **State management** – uses Zustand and React Context providers to handle auth, cart and settings.
- **3D model previews** – utilises Three.js for rendering STL/OBJ/3MF models before uploading.
- **Stripe payments** – integrates with Stripe via `@stripe/react-stripe-js` for a smooth checkout experience.
- **Admin tools** – manage users, filament types and uploaded models from the Admin panel.
- **Dark mode** – built in theme toggle persists your preference in `localStorage`.
- **End‑to‑end tests** – Cypress tests ensure core flows work as expected.
- **Filament color mapping** – arbitrary filament `color_hex` values are mapped to the closest MakerWorks palette token; unknown colours fall back to a neutral swatch so they don't resemble brand UI colours.

## Technology Stack

- **React 18** with hooks
- **TypeScript** for type safety
- **Vite** development server
- **Tailwind CSS** for styling
- **Axios** for HTTP requests
- **Zod** for schema validation
- **Framer Motion** animations
- **Cypress** and **Vitest** for testing

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Run the dev server**

   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173` by default.

3. **Build for production**

   ```bash
   npm run build
   ```
   Production files will be generated in the `dist` folder.

4. **Preview a production build**

   ```bash
   npm run preview
   ```

## Environment Variables

Copy `.env.example` to `.env` and customise the following settings:

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_yourkeyhere
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
SESSION_EXPIRE_SECONDS=7200
VITE_APP_NAME=MakerWorks Frontend
VITE_ENV=development
```

`VITE_API_BASE_URL` controls where API calls are sent. `VITE_STRIPE_PUBLISHABLE_KEY` is required for Stripe checkout. The Redis variables are used by the backend for session management.

## Scripts

- `npm run dev` – start Vite in development mode
- `npm run build` – bundle the app for production
- `npm run preview` – serve the production build locally
- `npm run lint` – run ESLint over the codebase
- `npm run test` – execute Vitest unit tests
- `npm run cy:open` – open the Cypress test runner
- `npm run cy:run` – run Cypress tests headlessly

## Directory Structure

```
src/
├─ api/            # helper methods for API requests
├─ assets/         # static images and fonts
├─ components/     # reusable React components
├─ config/         # global configuration values
├─ context/        # React context providers
├─ hooks/          # custom React hooks
├─ lib/            # generic utilities
├─ pages/          # top‑level route components
├─ routes/         # React Router configuration
├─ store/          # Zustand state stores
└─ types/          # TypeScript types
public/            # static files served by Vite
```

A small utility script `generate_sample_images.py` can be used to create placeholder images during development.

## Filament Color Mapping

Filament colours returned from the API can be arbitrary hex values. The `src/lib/colorMap.ts` helper converts these values to the nearest MakerWorks palette token. If a colour doesn't match closely, it falls back to a neutral grey (`zinc-400`). Components display these mapped tokens via `bgClassFromHex`/`fillClassFromHex`, rendering off‑palette colours as subdued swatches or badges so they are clearly distinct from core UI brand colours.

## Testing

Vitest tests reside under `src/**/__tests__` (and `tests/`) and run in a jsdom environment. These unit tests execute in CI alongside the Cypress end‑to‑end suite via `.github/workflows/cypress.yml`.

## Contributing

Pull requests are welcome! Please make sure `npm run lint` and `npm run test` pass before submitting a PR. For major changes, open an issue first to discuss what you would like to change.

## License

This project is licensed under the [MIT License](LICENSE). See the LICENSE file for details.
