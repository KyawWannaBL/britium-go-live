# Enterprise mobile layout validation

Scope: existing Enterprise shell/sidebar and contained worksheet scrolling. No backend operations, camera or physical-device sign-off is claimed.

After a production build, run:

```sh
CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium npm run verify:mobile-layout
```

Verifier renders real AppShell and Sidebar TSX using read-only auth/router adapters with actual production CSS. Viewports:320x568,360x640,390x844,360x300 (reduced keyboard-height geometry),640x360,768x1024,1024x768,1280x800,1920x1080. Also checks expanded overlay at320px and simulated nonzero CSS safe-area values (20px top,16px bottom,12px left). Simulation proves geometry, not hardware behavior.

Baseline reproduced collapsed rail208/256px despite intended64px and main760px onphones. Scoped rules restore64px collapse, keep main/content within viewport and let wide worksheet data scroll. Mobile defaults collapsed; expanded navigation overlays content and collapses on route change. Sidebar and shell respect safe-area insets;100vh fallback precedes100dvh.

SSR geometry does not validate menu event handling or router lifecycle. Physical Android8+ phone/tablet testing with keyboard, camera return, rotation, font/display scaling remains required. Full finance acceptance and Go-Live isolation/recovery gates remain blocked separately.
