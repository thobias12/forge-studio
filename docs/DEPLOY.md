# Deploying Forge Studio with GitHub Pages

Forge Studio is a static Vite/Three.js application. GitHub Pages hosts both the desktop studio and the phone capture screen over HTTPS.

## Deployment

The repository is configured to publish through GitHub Actions. Every push to `main` runs `.github/workflows/deploy-pages.yml`, builds Forge, and deploys the `dist` output.

Production URL:

`https://thobias12.github.io/forge-studio/`

## Phone mocap

1. Open the GitHub Pages Forge URL on the PC.
2. Open **Mocap**.
3. Scan the generated QR code with the phone.
4. The phone opens the same GitHub Pages site in Capture mode using HTTPS.
5. Allow camera access and start tracking.
6. Import a rigged GLB in Mocap Studio to drive the character live.

The QR uses query parameters rather than a server-side `/capture` route, so the flow works on static GitHub Pages hosting.
