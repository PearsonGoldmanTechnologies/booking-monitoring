# PearsonGoldman booking monitoring

This repository contains only read-only monitors for public URLs. It contains no website source, Graph credentials, customer records or deployment mechanism.

UptimeRobot Free: native Microsoft document and custom /book document keyword checks every five minutes, with email alerts. The existing homepage monitor remains unchanged. A document check alone does not establish functioning availability.

GitHub Actions standard public runners: HTTP and current/next-month availability every five minutes (best-effort scheduler), fresh Chromium approximately every 30 minutes. A separate private local investigation also verified Firefox. No appointment submissions, customer details or slot reservations. Microsoft POSTs are denied except the three observed service/availability/timezone read operations. Service workers are disabled. Unknown native writes are classified as a monitor-policy restriction, not automatically a customer outage.

Two consecutive failures create a GitHub incident issue; recovery comments and closes it. The owner confirmed receipt of controlled outage/recovery and summary notifications on 3 November 2026. A daily UK-time summary is posted as an issue after 09:00. `status.json`, Git history and incident issues retain observations and incident history. No paid artifacts or cache are configured. Repository access uses only repository-scoped GITHUB_TOKEN.

Healthchecks.io Free independently watches the cloud worker: expected period five minutes, twenty-minute grace for GitHub scheduling delays, email to the authorised operations account. The private ping URL is held only in the encrypted HEALTHCHECKS_PING_URL Actions secret. It receives success only after a completed worker, or failure when the job fails; a missing worker alerts after 25 minutes since its last success. A stale browser observation over 45 minutes also fails worker health. This is independent of customer outage alerts. Account activation, cloud failure/recovery signals and owner receipt of the emails were verified on 3 November 2026.

## Operation

`npm ci --ignore-scripts`; `npm test`; `node run.mjs`; `node browser.mjs`.
Browser process exit 1 means at least one check was not healthy; inspect JSON classification. Empty availability is valid and is not an outage. Screenshots remain local to the runner and are not uploaded. The workflow log contains only bounded public check information.

The workflow is schedule/workflow_dispatch only, never pull_request. `test_notifications=true` runs an isolated notification outage/recovery cycle and heartbeat failure/recovery signals without altering production. Do not substitute production outages for controlled tests.

## Limits and maintenance

GitHub schedules may be delayed or dropped; they are not a timing SLA. Check last-observation timestamps and investigate missing daily reports. The workflow writes a small status commit each successful run, preventing the 60-day inactivity condition while it operates; persistent failures still need owner attention. Independently hosted UptimeRobot checks continue if GitHub stops, but cannot prove that the functional worker remains fresh solely from a previously green document.

On a worker alert, inspect Actions runs and Healthchecks last-ping time. Restore only the monitoring workflow or its encrypted secret, then dispatch a read-only run and verify recovery. Never redeploy the website or alter Bookings settings as an automatic monitoring response. The free heartbeat integration closes the stale-worker gap; maintain its account/email and keep the secret private.

Maintain the exact public native URL against Bookings' published `publicUrl`. Keep the custom page unlisted unless separately approved. Preserve blocked write operations and tests when Microsoft changes its interface. Review dependency updates monthly. Keep GitHub Actions billing at zero, use standard public runners only, and do not enable paid UptimeRobot features.

Microsoft tenant incidents are delivered through separately configured Microsoft 365 Service Health email subscriptions. No tenant credentials or tenant-specific incident details belong in this public repository.
