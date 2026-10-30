# Android release packages

Goal: deliver updated permanent-signed Enterprise APK and Play-upload AAB, and connect Enterprise download buttons to the stable release.

Use the existing Capacitor app identity, permanent signing secrets and certificate checks. Keep the separate Rider App button on the root site. Never replace a signing key or claim Play acceptance without store evidence.

- Update the existing workflow to publish verified AAB and its checksum with the APK, retaining certificate checks and monotonic versions.
- Point Enterprise download buttons and obsolete nested portal APK links to the stable Enterprise release.
- Verify signing-policy checks, download references and production build. Commit only this release change; publish through main using the authorized deployment workflow.
- Inspect the completed Actions artifact, APK identity, signatures and checksums; deliver APK, AAB and supporting release files. State any Google Play or device verification limits.
