# Rider domain and waybill printing

## Local routes

- Enterprise portal: `http://localhost:5173/`
- Rider app: `http://localhost:5173/rider-app`

The application now uses clean browser routes. The previous `HashRouter` required
`http://localhost:5173/#/rider-app`, which is why `/rider-app` opened the portal.

## Production domains

Attach both custom domains to the same Vite deployment:

- `www.britiumexpress.com` renders the enterprise portal.
- `www.britiumexpress.app` renders the standalone Rider App for every path,
  including `/`.

The host decision is in `src/config/appRuntime.ts`. `vercel.json` supplies the SPA
fallback needed when a user refreshes a clean URL. Both DNS records must point to
the deployment target supplied by the hosting provider, and both domains need
valid TLS certificates.

## Supported physical waybill layouts

| Paper | Label | Layout |
| --- | --- | --- |
| 4 × 6 in | 4 × 6 in | 1 full waybill |
| 4 × 6 in | 4 × 3 in | 2 stacked waybills |
| 4 × 6 in | 4 × 2 in | 3 stacked waybills |
| 4 × 6 in | 2 × 3 in | 4 waybills in a 2 × 2 grid |
| A5 | selectable label size | Labels remain at physical size and are centered |
| A4 | selectable label size | Labels remain at physical size and fill the sheet grid |

The four-up reference image is a 4 × 6 sheet containing four 2 × 3 labels. It is
not physically possible to place four 2 × 3 labels on a 4 × 4 sheet without
scaling or clipping them.

For exact output, print at 100% / Actual Size, disable browser headers and footers,
and select the same paper size in the operating-system printer dialog.
