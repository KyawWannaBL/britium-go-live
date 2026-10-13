# Enterprise legacy WebView styling repair

User photos identify Galaxy Tab S6 Lite SM-P615 and show Enterprise login text/buttons without utility layout: tablet-hidden hero remains visible and workspace tiles run together. Android/WebView versions and installed APK build are not visible in those photos. Hardware identity is not a browser version.

The same rendering failure was reproduced with actual Login TSX and actual Card/Input/Button components, production CSS and Chromium92. Baseline Tailwind4 yields hero display:block instead of tablet-hidden display:none. Official Tailwind guidance states v4 targetsChrome111+, recommends3.4 for older browsers: https://tailwindcss.com/docs/upgrade-guide#browser-requirements .

The app now uses Tailwind3.4.19, explicit v3PostCSS config and autoprefixer; duplicate PostCSS configs are removed. Existing colors, radii, dark mode and source scanning are preserved. The exact non-class date regex `[-:T]` is blocklisted because source scanning otherwise emits invalid CSS. JavaScript targetChrome87 and CSS targetChrome80 are explicit.

Validation: production build and73registered verification scripts pass. Login passes at360x640,800x1280,1280x800 on actualChromium92 and153. Shell passes9phone/tablet/desktop sizes, expanded phone menu and simulated safe-area inset geometry onChromium92; modern shell tests also pass. Read-only auth/router adapters mean this is actual component/CSS rendering evidence, not login transactions, camera/native-plugin acceptance or physicalSamsung sign-off.

Commands after npm run build:

```sh
CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium92 npm run verify:legacy-login
CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium92 npm run verify:mobile-layout
```

A newer user-agent string is not legacy-engine verification. These tests use an actual old Chromium binary. The old Playwright engine lacks checkVisibility; the inset test obtains DOM rectangle geometry directly, retaining the same assertions.

Release remains pending. APK publication must use the permanent signing guard in this PR; configure signing secrets first. After release, the actual tablet must be checked again. Updating styles or signing cannot establish universal physical-device compatibility.
