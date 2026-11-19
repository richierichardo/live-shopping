# Goodluch Storefront Prototype

Client-only Goodluch storefront prototype built with Next.js App Router, TypeScript, and Tailwind CSS. Catalog, cart, checkout, order confirmation, and tracking use mock data stored in the browser. No payment or fulfillment service is connected.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

```bash
npm test        # try-on asset, body proxy, mask, camera/privacy guards
npm run typecheck
```

## Demo routes

- `/` — storefront home
- `/products` — searchable, filterable, sortable mock catalog
- `/products/[slug]` — product detail, size guide, variant selection, and optional live preview
- `/cart` — browser-persisted demo cart
- `/checkout` — simulated checkout with no card or bank details
- `/order/[id]` — local demo order confirmation
- `/tracking` — local demo lookup; `GL-DEMO-001` opens the sample timeline

## Try-on preview

The camera starts only after the customer chooses **Try it live** and then **Allow camera & start**. Constraints stay `facingMode: "user"`, ideal `1280×720`, audio off (`TRYON_CAMERA_CONSTRAINTS`). Before camera access, the modal displays a rotatable local 3D garment. The live preview uses a Three.js volumetric mesh (`GARMENT_RIG`), MediaPipe pose + segmentation, a per-SKU try-on asset contract (`coverage` / `templateId` / anchors via `resolveTryOnAsset`), body-proxy scale, an on-device occlusion stack (dim underlay → **2.5D front-texture warp** → 3D garment → head/hands), and confidence fade. Frames are never uploaded (MediaPipe model/WASM may load from CDN). The video is mirrored for selfie use; composite canvases are not.

The pilot product **Retro Racing Group Black Longsleeve** loads `public/models/longsleeve-racing.glb` (rebuild with `npm run build:garment`). Other SKUs use the same fitting pipeline with category templates (tee/jersey short sleeves, procedural mesh when no GLB). This is a **visual simulation only** — not size advice, fitting-room replacement, or photoreal VTON.

### Manual baseline checklist (pilot + asset switch)

1. `/products/retro-racing-group-black-longsleeve` — confirm GLB inspect works, copy says visual simulation, then Allow camera.
2. Live: note FPS, pose-lost fade, shirt dim under torso, **front texture warp** on the chest, hands/head above garment.
3. Raise arms: sleeves follow; torso does not tear.
4. Open a non-GLB product (e.g. Trackside Club Tee) — try-on still opens with short-sleeve template; no crash.
5. Stop camera: stream ends; return to 3D inspect.
6. `npm test` passes (asset/GLB exists, camera constraints, no frame-upload patterns).
7. Hard-refresh after asset/GLB changes.

Target: **≥20 FPS** laptop, **≥18 FPS** phone; pilot GLB path unchanged; privacy local-only.

## Prototype limits

- No admin, backend, customer accounts, real inventory, payments, courier integration, or real order processing.
- Products and stock values are mock data. Catalog product images are local demo illustrations; the home hero uses a locally saved public Goodluch brand image.
- Cart and demo orders persist in this browser's local storage. Use a clean browser profile to start with an empty demo.
