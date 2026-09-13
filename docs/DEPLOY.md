# Deploying Forge Studio with GitHub Pages

Forge Studio v0.1 is a static Vite/Three.js application, so GitHub Pages can host both the desktop studio and the phone capture screen over HTTPS.

## One-time repository setting

In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.

After that, every push to `main` runs `.github/workflows/deploy-pages.yml` and publishes the latest Forge build automatically.

The expected site URL is:

`https://thobias12.github.io/forge-studio/`

## Phone mocap

1. Open the GitHub Pages Forge URL on the PC.
2. Open **Mocap**.
3. Scan the QR code from the phone.
4. The phone opens the same GitHub Pages site in Capture mode using HTTPS.
5. Allow camera access and start tracking.

The QR uses a query parameter rather than a separate `/capture` route so GitHub Pages works without a server-side rewrite.

## Repository visibility

GitHub Pages is available for private repositories on eligible paid GitHub plans. If Pages is unavailable for this private repository, either upgrade the GitHub plan or make only this repository public. The deployed Pages site should be treated as publicly reachable unless separate enterprise access controls are configured.
