# Android Play Store release path

Prepared 2026-11-03. WatchFlow v1.0 is movies only. This is a packaging and
submission runbook, not an Android implementation or store approval. No Android
project, package ID, keystore, signing certificate, Play application, or release
has been created. Payments and Series/TV remain out of scope.

## Packaging decision

Use a Trusted Web Activity (TWA) generated with Bubblewrap around the existing
HTTPS production PWA. This reuses browser rendering and cookie-based sessions
without copying server credentials into an APK. The host and Android application
must prove common ownership through Digital Asset Links. Failed verification
falls back to a browser Custom Tab. See the official
[TWA overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
and [Bubblewrap quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start).

Do not bundle Next.js server output or environment files in the Android package.
The package opens the deployed application; server code and RLS remain on the
existing backend. Web deployments can change the installed app's experience,
so keep a known-good deployment available for rollback.

## Prerequisites before generating the wrapper

1. Close the blockers in `WATCHFLOW_V1_RELEASE_CHECKLIST.md`. Deploy the approved
   movies-only release to the intended stable HTTPS origin through the normal
   release process. This task does not authorize a push or deployment.
2. Choose the permanent reverse-domain Android application ID, developer account
   type, release owner and canonical production domain. Use the owner-approved
   public support contact `hashim.ghub@gmail.com` for the future listing. Inspect
   whether a Play application already exists before choosing a new ID.
3. Verify public manifest/icons, service worker update behavior and generic
   offline fallback on a real Android device. `/dashboard` should launch the
   signed-in workspace or the login screen; no account data is available offline.
4. Resolve public privacy policy, web account-deletion pathway and TMDB
   attribution/licensing. Store declarations must describe the actual release.
5. Provide an operator-controlled Play review account and reproducible login
   instructions, including any OTP requirements. Keep credentials out of Git,
   documentation, screenshots and build logs.

## Generate and sign, when those inputs are settled

Use the current supported Node/JDK/Android SDK versions documented by the chosen
Bubblewrap release. Pin that CLI version and the generated wrapper's build
dependencies for reproducible builds. Generate in a reviewed Android packaging
directory; no generator or SDK installation was run during this task.

Example commands (replace placeholders before execution):

```text
npx @bubblewrap/cli@<reviewed-version> init --manifest=https://<production-host>/manifest.webmanifest
npx @bubblewrap/cli@<reviewed-version> build
```

Review the generated project, app ID, launch origin/path, icons, versionName,
monotonically increasing versionCode, permissions and target SDK. As of
2026-11-03, new phone/tablet apps and updates must target Android 16 / API 36
or higher. Recheck the official
[target API requirement](https://developer.android.com/google/play/requirements/target-sdk)
at submission; old tutorials showing API 35 are insufficient for this release.
Use an Android App Bundle (`.aab`) for Play; an APK is useful for local testing.

Use Play App Signing. Keep the upload keystore/passwords in the operator's secure
storage, outside Git, with a tested recovery/backup process. The upload key and
Play's distribution app-signing key are different. See
[Android signing concepts for web developers](https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs).

After Play App Signing is configured, publish the real application ID and Play
**app-signing** SHA-256 certificate fingerprint at:

```text
https://<production-host>/.well-known/assetlinks.json
```

The file must return public HTTP 200 JSON on the exact launch origin, without
authentication or redirects. Its `delegate_permission/common.handle_all_urls`
statement must target `android_app` with the actual `package_name` and
`sha256_cert_fingerprints`. Include any separately required local test certificate
only deliberately; the upload certificate alone does not verify a Play-installed
build. No placeholder asset-links endpoint is shipped in this repository.

## Device and Play testing

Start on Internal testing and install the **Play-distributed build**. Confirm
Digital Asset Links/fullscreen operation, cold/warm launch, back navigation,
login/logout/relaunch, OTP/recovery links, existing optional Google connection
round trips, private artwork picker, CSV/JSON downloads, keyboard and display
scaling, light/dark themes, offline recovery and denied notification permission.
Use controlled accounts; destructive account deletion requires its dedicated
disposable fixture. Do not activate or rerun completed scheduler acceptance.

Test a web deployment/service-worker update against an already-installed build
and verify rollback. A desktop Chrome pass does not establish Android TWA,
notification delegation, external browser callbacks or file-download behavior.
Use Play's pre-launch report and clear actionable crash/accessibility findings.

For personal developer accounts created after 2023-11-13, Google currently
requires at least 12 testers continuously opted into a closed test for at least
14 days before applying for production access. Account-specific eligibility
still needs checking in Play Console. See
[testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

## Store submission inputs

Prepare the app name, movies-only descriptions, category, support email, privacy
URL, phone screenshots from the actual signed build, 512px listing icon and
1024×500 feature graphic; confirm the current Console asset requirements before
export. Do not imply film streaming, TV tracking, payments or affiliation with
TMDB. Complete content rating, target audience, ads declaration, app access and
Data safety accurately.

Review the following data inventory with the operator; it is not a completed
Data safety declaration:

| Data/service | What to check |
| --- | --- |
| Supabase Auth/profile | Email, name, account identifiers, optional country/timezone/avatar; authentication and deletion/retention |
| Private movie data | Library, ratings/reviews, lists/covers, watch history, schedules, preferences and exports |
| Push and optional calendar | Subscription endpoint/keys, notification content, optional encrypted Google grants and event data; actual enabled deployment behavior |
| Providers/infrastructure | TMDB search requests/images, Vercel/Supabase/notification-provider logs, IP/device metadata, retention and service-provider declarations |
| Crash/analytics SDKs | Audit the generated wrapper and deployed site; do not claim none without checking actual configuration |

Google requires privacy disclosures even for apps declaring no collected data.
Follow the [Data safety instructions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
WatchFlow already offers account deletion under Settings → Data & Account, but
Play also requires a working web deletion resource that identifies WatchFlow
and lets users request deletion without reinstalling the Android app. Resolve
that missing public resource and state retention exceptions accurately. See
[account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Submit only after the tested AAB, signing association, policy pages, declarations
and access instructions are reviewed. Use a staged rollout, monitor crashes and
authentication failures, and retain the prior web deployment and signed wrapper
release. No Play upload, production rollout or external account mutation is part
of this preparation.
