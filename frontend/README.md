# ZET Live Frontend

React 19 + Vite + Tailwind CSS app for live tracking of ZET (Zagreb) public transit vehicles.

## Commands

| Command       | Action                                      |
| :------------ | :------------------------------------------ |
| `bun install` | Installs dependencies                       |
| `bun dev`     | Starts local dev server                     |
| `bun build`   | Build production site to `./dist/`          |
| `bun preview` | Preview production build locally            |

The social preview image (`public/og.png`) is generated from
`src/assets/og/og.svg`. After editing the SVG, regenerate it with
`just frontend og-image` (requires `rsvg-convert` / librsvg).

## Environment Variables

All env vars must be prefixed with `VITE_` to be exposed to the client.

| Variable                    | Description                       | Default |
| :-------------------------- | :-------------------------------- | :------ |
| `VITE_API_URL`              | Backend API URL                   | `/api`  |
| `VITE_PUBLIC_SITE_URL`      | Public site URL (for SEO)         |         |
| `VITE_PLAUSIBLE_SITE_URL`   | Plausible analytics site URL      |         |
| `VITE_PLAUSIBLE_SCRIPT_URL` | Plausible analytics script URL    |         |
| `VITE_PLAUSIBLE_API_URL`    | Plausible analytics API URL       |         |
