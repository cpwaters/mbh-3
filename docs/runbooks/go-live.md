# Runbook: first production go-live (step 6)

WHO does each step is marked. Secrets never go through chat — the founder
runs the authenticated commands. Claude has written and locally-verified all
the code/config; these are the cloud-side actions that need the founder's
credentials.

## Prerequisites (FOUNDER)

- [ ] Fresh Firebase/GCP project `mybackhaul-app` created, billing enabled.
- [ ] Note the **billing account id** (Billing → Account management), format
      `XXXXXX-XXXXXX-XXXXXX`.
- [ ] Re-authenticate the local CLIs (they were expired):
      `! gcloud auth login` and `! gcloud auth application-default login`,
      then `! gcloud config set project mybackhaul-app` and
      `! firebase login` (run these with the `!` prefix so output lands here).
- [ ] Enable the APIs Terraform + deploy need (one-time):
      `! gcloud services enable cloudbilling.googleapis.com billingbudgets.googleapis.com monitoring.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com firestore.googleapis.com firebasehosting.googleapis.com --project mybackhaul-app`
- [ ] Firestore database created in `europe-west2` (Firebase console → Firestore
      → Create database, production mode) if not already.

## Provision infrastructure (FOUNDER runs; CLAUDE wrote the config)

1. `cd infrastructure/environments/production`
2. `cp terraform.tfvars.example terraform.tfvars` and fill `billing_account`
   and `alert_email`. (terraform.tfvars is gitignored.)
3. `! terraform init`
4. `! terraform apply` — review the plan (WIF pool/provider, deploy service
   account + roles, budget alert, uptime check) and confirm.
5. Copy the two outputs:
   - `workload_identity_provider`
   - `deployer_service_account`

## Wire CI deploy (FOUNDER, GitHub repo settings)

Repo → Settings → Secrets and variables → Actions → **Variables**:
- [ ] `WIF_PROVIDER` = the `workload_identity_provider` output.
- [ ] `DEPLOY_SERVICE_ACCOUNT` = the `deployer_service_account` output.
- [ ] `PRODUCTION_DEPLOY` = `true` (this is the gate — deploy runs only when
      this is exactly "true").

(These are variables, not secrets — the security is the repo-pinned attribute
condition in the WIF provider.)

## First deploy (CI, automatic)

- [ ] Push to main (or re-run the latest main workflow). The `deploy` job runs
      after `validate` goes green: keyless auth via WIF → `firebase deploy
      --only functions,hosting,firestore` → `smoke:prod`.
- [ ] Confirm `smoke:prod` passed in the job log: /health 200, unauthenticated
      /api/dispatch 401 (fail closed), pages 200.
- [ ] Visit `https://mybackhaul-app.web.app/app` and record a test delivery;
      confirm it reaches Firestore (it will actually deliver now, not just
      queue). Then delete the test data before any real user.

## Never

- Never `firebase deploy` by hand except a documented emergency (with founder
  creds); CI on green is the only path. Deploy functions + hosting together
  (CI does) — shipping one without the other silently no-ops features.

## After go-live

- Migrate the handful of real prototype accounts (cpwaters/mbh-2 /
  mybackhaul-21112) into mybackhaul-app by script at cutover — separate slice.
  The prototype stays live until mbh-3 reaches parity.
