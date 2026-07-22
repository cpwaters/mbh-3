# Keyless deploys: GitHub Actions authenticates via Workload Identity
# Federation — no service-account keys anywhere. The provider's attribute
# condition PINS the exact repo, so only this repo's workflows can mint
# credentials to impersonate the deploy service account.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Only tokens from THIS repo are accepted.
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "gh-deployer"
  display_name = "GitHub Actions deployer"
}

# Let the pinned repo's workflows impersonate the deployer SA.
resource "google_service_account_iam_member" "wif_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# Deploy permissions: hosting, gen2 functions (Cloud Functions + Run +
# Artifact Registry + Cloud Build), Firestore rules/indexes, and acting as
# runtime service accounts.
locals {
  deployer_roles = [
    "roles/firebasehosting.admin",
    "roles/cloudfunctions.admin",
    "roles/run.admin",
    "roles/artifactregistry.admin",
    "roles/cloudbuild.builds.editor",
    "roles/firebaserules.admin",
    "roles/datastore.indexAdmin",
    "roles/iam.serviceAccountUser",
    "roles/serviceusage.serviceUsageConsumer",
  ]
}

resource "google_project_iam_member" "deployer" {
  for_each = toset(local.deployer_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}
