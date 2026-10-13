# Enterprise signing repair and physical-device acceptance

Physical devices are not connected to this workspace; adb and a physical-device test service are unavailable. Browser viewport checks and APK integrity checks are not hardware sign-off.

Actual downloaded APK v2 certificates differ:

- Enterprise Build56: `fb85bc38ee6f5b338fff60ca22e97dcbf9f8c96d033a6e8234a81db13a5911ea`
- Enterprise Build58: `f4bb2e64dd57a7c7f2d354200e89c5b5ef06279f8a87af3c30eaebd34e3afd08`

Both certificates identify Android Debug. This prevents normal in-place upgrades between these builds. APK ZIP/signature validity does not prove upgrade compatibility. Existing debug-installed copies cannot be upgraded by a newly chosen release key. Preserve any unsynced work before arranging a controlled transition; never assume uninstalling is safe.

The repaired workflow requires persistent signing material and checks its pinned certificate before publishing. Configure these repository Actions secrets in KyawWannaBL/britium-go-live:

- `ENTERPRISE_ANDROID_KEYSTORE_BASE64`: base64 of the durable keystore
- `ENTERPRISE_ANDROID_KEYSTORE_PASSWORD`: store password
- `ENTERPRISE_ANDROID_KEY_ALIAS`: selected signing alias
- `ENTERPRISE_ANDROID_KEY_PASSWORD`: selected private-key password (for PKCS12 typically identical to store password)
- `ENTERPRISE_ANDROID_CERT_SHA256`: SHA256 fingerprint of that alias certificate

Keep the same key and certificate for every later release. Keys/passwords must be entered through GitHub secret settings, not committed or pasted into conversation. No signing material has been generated or provisioned by this repair. Missing secrets stop the workflow before build/publication. Actual signed release build remains pending.

Acceptance must be recorded separately for each affected phone/tablet and app:

1. Record model, Android version, Android System WebView/Chrome version, APK build and display/font scale.
2. Verify initial install and subsequent in-place upgrade against the same permanent signer.
3. Check login, menu expansion/collapse, finance/pickup/delivery forms and table scrolling in portrait and landscape.
4. Open the keyboard; confirm focused fields and submit/close controls remain reachable.
5. Take a camera photo, approve/upload it, rotate the device and return to the same task without losing unsaved state.
6. Verify notification sound after first interaction, GPS permissions and offline/reconnect recovery.

Pass evidence requires the result and observed failure for each step on actual devices. Android version alone is insufficient: Rider89 targets Chrome101 explicitly; an older WebView needs separate verification. No universal-device or whole-system Go-Live readiness claim is made.
