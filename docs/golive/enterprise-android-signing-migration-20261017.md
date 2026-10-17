# Enterprise Android signing-key migration (draft; not authorized for device rollout)

Status: **PREPARATION ONLY — NO PRODUCTION APK RELEASE**.

## Background and verified constraints

- Approximately 10 Enterprise Portal installations need transition planning.
- Installed October 7 Enterprise APK: package `com.britiumexpress.enterpriseportal`, versionCode `300023`, signer SHA-256 `990fcbce5147015e4a802a4bca6fef44f201c9266eacb38d6ffb08e819d49155`.
- Candidate APK target: versionCode `300024`; current workflow pins the October signer to protect upgrades.
- Recovery searches found no matching private key. Lack of a found key is **not proof of permanent loss**.
- Android does not generally allow replacing an installed package with one signed by an unrelated certificate. Do **not** disable the signer check or assume normal upgrade.
- **Never reuse the Rider release keystore.**

## Phase 1: Data-preservation audit (all 10 devices)

Inventory device ID (internal inventory alias only), Android version, installed package/version/signing fingerprint, last sync time, app user/role, unsent photos, offline queues, incomplete delivery/pickup and finance actions. Do not put personal data in this document.
Confirm operational records, scans, photos and attachments on the server against each device before uninstalling. Capture approved backups using app-supported export mechanisms. Reconcile all local-only data and block migration for any device with unsynced work. Record operator and manager sign-off.

## Phase 2: New Enterprise signing identity (local/offline)

Create a **new** dedicated 4096-bit RSA keystore using `keytool -genkeypair` and a strong password entered interactively, never in command arguments, logs, source control or chat. Keep the keystore outside the Git checkout. Store at least two access-controlled encrypted backups and document a secure recovery procedure. Use the alias `britiumenterprise` and ensure the keystore contains a valid certificate chain. Capture the public SHA-256 certificate fingerprint separately. Treat keystore and passwords as restricted production secrets.

The current GitHub workflow requires:
- `ENTERPRISE_RELEASE_KEYSTORE_BASE64`
- `ENTERPRISE_RELEASE_KEY_ALIAS`
- `ENTERPRISE_RELEASE_STORE_PASSWORD`
- `ENTERPRISE_RELEASE_KEY_PASSWORD`

**Do not populate them using an unverified key.** After local keystore verification, modify the release workflow in a *separate reviewed commit* to require the new explicitly approved SHA-256 fingerprint, keeping verification fail-closed. Maintain the original October fingerprint in audit documentation, not as the new identity. Verify package, increasing versionCode, target/min SDK, v2/v3 APK signature and reproducible signing evidence. Store output as private CI artifact; do not update website downloads automatically.

## Phase 3: One-device controlled migration pilot

Select one noncritical pilot device, confirm server synchronization and backup. Capture screenshots of app settings and records before installation. On Android, a package signed by a different certificate cannot normally install over the old package. **Only after data backup and explicit rollout approval**, uninstall old Enterprise APK and install the newly signed APK. Verify login/auth, correct role, camera/photo capture, tablet/mobile layout, maps, scanning, offline/online sync, finance/warehouse/wayplan lifecycle, alerts, and access to historic records. Validate server reconciliation and rollback plan. Record sign-off.

## Phase 4: Nine-device staged rollout

Migrate only after pilot passes. Schedule in small batches during low activity. Record backups, install outcome, version, package ID and signer, reconciliation results and sign-off for each device. Do not upgrade Rider APKs or touch Rider signing secrets.

## Go/no-go

**NO-GO** unless all: permanent key verified and backed up; CI builds with strict signer check; package/version and Android 8+ compatibility pass; one pilot backup and synchronization verified; pilot signed off; restoration/rollback instructions confirmed; operations approval recorded.

## Security

Do not add .jks files, Base64 keystore blobs, passwords, .env secrets or device personal data to Git, issue comments or chat. Rotate any credential inadvertently disclosed. Do not claim that changing the SHA-256 check creates Android upgrade compatibility.
