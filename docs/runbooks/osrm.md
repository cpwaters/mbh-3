# Runbook: self-hosted OSRM routing

The drain routes loads via OSRM. By default it uses the public demo server
(`router.project-osrm.org`) — rate-limited, not for production. This stands up
your own OSRM on Cloud Run (scale-to-zero, so ~£0 while idle) and points the
drain at it. No app code changes — the endpoint is an env var.

WHO: the founder runs these (they build a heavy image and create cloud
resources with real, if small, cost). Claude wrote the config.

## Cost & time note

Building the Great Britain routing graph is heavy: a ~30-45 minute Cloud Build
on a 32-vCPU machine (a few pounds of build time), producing a ~2GB image.
Serving is cheap — Cloud Run scales to zero between drain runs.

## 1. Prereqs (one-time)

```
! gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project mybackhaul-app
```

## 2. Create the Artifact Registry repo

```
! cd infrastructure/osrm && terraform init && terraform apply -target=google_artifact_registry_repository.osrm
```

## 3. Build + push the OSRM image (heavy)

```
! gcloud builds submit --config infrastructure/osrm/cloudbuild.yaml \
    --substitutions=_IMAGE=europe-west2-docker.pkg.dev/mybackhaul-app/osrm/osrm-gb:latest \
    infrastructure/osrm
```

(Swap the region extract in `infrastructure/osrm/Dockerfile` — the `REGION_URL`
arg — to cover an area other than Great Britain.)

## 4. Deploy the Cloud Run service

```
! cd infrastructure/osrm && terraform apply
! terraform output -raw osrm_url          # e.g. https://osrm-xxxx-nw.a.run.app
```

Verify it routes (London → Manchester; first call cold-starts the graph, ~30s):

```
! curl "$(terraform output -raw osrm_url)/route/v1/driving/-0.1416,51.501;-2.2,53.4?overview=false"
```

Expect `{"code":"Ok","routes":[{"distance":…,"duration":…}], …}`.

## 5. Point the drain at it

Set a GitHub Actions **variable** (Repo → Settings → Secrets and variables →
Actions → Variables): `OSRM_BASE_URL` = the `osrm_url` output. Then push to main
(or re-run the deploy). CI writes `functions/.env` from it, so the deployed
drain calls your OSRM. It is a URL, not a secret.

Confirm after deploy: post a load (or wait for one), then check the drain enriched
it — the load/listing gets a `route`, sourced from your OSRM.

## Hardening (later)

The service is currently public (`osrm_public = true`), bounded by
`max_instances` + scale-to-zero. To make it private, set `osrm_public = false`
and `invoker_service_account` to the drain's runtime SA — but that requires the
drain to send a Google ID token on each OSRM request (add an injectable
`getAuthToken` to `OsrmRouteProvider` and a metadata-server token fetcher in
`functions/src/composition.ts`). Until that lands, keep it public.

## Never

- Don't build the graph locally — it needs ~16GB RAM. Use Cloud Build (step 3).
