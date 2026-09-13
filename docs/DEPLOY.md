# Deploying Forge Studio

Forge phone capture requires HTTPS on the phone. Vercel is a good fit for the browser build.

## Vercel

1. Create a repository and put this project in it.
2. Import the repository into Vercel.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Deploy.

`vercel.json` already rewrites `/capture` to the SPA entry point, so QR links open correctly.

## Use phone mocap

1. Open Forge Studio on the PC using the deployed HTTPS URL.
2. Open **Mocap**.
3. Scan the displayed QR code using the phone.
4. On the phone, tap **Start camera** and allow camera access.
5. Put the phone where the full body is visible.
6. Press the red record control on the phone.
7. Stop recording when finished.
8. The clip appears in the desktop timeline and can be exported as `.forge-motion.json`.

If WebRTC cannot establish a direct connection on a restrictive network, the future production setup should add a TURN server. The prototype uses PeerJS Cloud for signaling.
