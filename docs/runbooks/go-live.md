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
      then `! gcloud config set project mybackhaul-app`. (A local
      `firebase login` is NOT required — CI deploys keylessly via WIF and
      Terraform uses gcloud ADC.)
- [ ] Point ADC's quota project at this project, or the billing-budgets API
      call in `terraform apply` 403s (falls back to the OAuth client project):
      `! gcloud auth application-default set-quota-project mybackhaul-app`
- [ ] Enable the APIs Terraform + deploy need (one-time). NOTE: `firebase
      deploy` insists on enabling `firebaseextensions.googleapis.com` and the
      scheduled `drain` function needs Cloud Scheduler + Pub/Sub; enable them
      up front so the least-privileged deploy SA never has to (it can't):
      `! gcloud services enable cloudbilling.googleapis.com billingbudgets.googleapis.com monitoring.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com eventarc.googleapis.com firestore.googleapis.com firebasehosting.googleapis.com firebaseextensions.googleapis.com firebaserules.googleapis.com cloudscheduler.googleapis.com pubsub.googleapis.com cloudresourcemanager.googleapis.com --project mybackhaul-app`
- [ ] Firestore database created in `europe-west2`:
      `! gcloud firestore databases create --location=europe-west2 --project mybackhaul-app`

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
- [ ] **One-time after the FIRST successful functions deploy** — make the
      public HTTP function invocable so Hosting can route `/api/**` + `/health`
      to it (the deploy does not set this itself; hosting 404s until it is).
      The binding persists across future deploys, so this is one-time:
      `! gcloud run services add-iam-policy-binding dispatch --project mybackhaul-app --region europe-west2 --member=allUsers --role=roles/run.invoker`
      Then re-run the `deploy` job so the hosting release publishes.
      (`dispatch` enforces auth in-app — `/health` open, `/api/dispatch`
      requires a bearer token — so public invoke is correct. Do NOT grant this
      to `drain`; it is invoked only by Cloud Scheduler.)
- [ ] Confirm `smoke:prod` passed in the job log: /health 200, unauthenticated
      /api/dispatch 401 (fail closed), pages 200.
- [ ] Visit `https://mybackhaul-app.web.app/app` and record a test delivery;
      confirm it reaches Firestore (it will actually deliver now, not just
      queue). Then delete the test data before any real user.

## Deploy gotchas seen on the first go-live (all resolved in-repo)

- The Google Node **buildpack runs `npm install` on the deployed
  `functions/package.json`** and fails on `workspace:*` deps. Fixed in-repo:
  the esbuild bundle inlines the `@mbh/*` packages, so those build-time deps
  live in the ROOT devDependencies and `functions/package.json` ships an
  npm-clean manifest (only firebase-admin/functions + esbuild).
- Hosting rewrites to a gen2 function **default to us-central1**; ours are in
  europe-west2. Fixed in-repo: `firebase.json` rewrites use the object form
  `{ "functionId": "dispatch", "region": "europe-west2" }`.
- The deploy SA is least-privileged; it cannot enable APIs (hence enabling
  them all up front) and needs `roles/firebaseextensions.editor` for the CLI's
  extension-instances pre-flight (in Terraform).
- A **scheduled (`onSchedule`) function** deploys a Cloud Scheduler job, so the
  deploy SA needs `roles/cloudscheduler.admin` (in Terraform) — without it the
  deploy 403s on `cloudscheduler.jobs.create/update`. Note firebase only
  (re)writes the schedule when the function's deployed config changes, so if
  you grant the role after a skipped deploy, force one redeploy of that
  function (any config/source change) to actually create the job. No App
  Engine app is required.

## Never

- Never `firebase deploy` by hand except a documented emergency (with founder
  creds); CI on green is the only path. Deploy functions + hosting together
  (CI does) — shipping one without the other silently no-ops features.

## After go-live

- Migrate the handful of real prototype accounts (cpwaters/mbh-2 /
  mybackhaul-21112) into mybackhaul-app by script at cutover — separate slice.
  The prototype stays live until mbh-3 reaches parity.
