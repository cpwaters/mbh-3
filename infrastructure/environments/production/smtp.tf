# SMTP credentials for the invoice email the drain sends once a job's PoD is
# recorded (see packages/actions/src/drain.ts's sendInvoiceEmail task and
# packages/providers/nodemailer). Real secrets — unlike OSRM_BASE_URL, these
# go through Secret Manager, not a plain functions/.env var.
#
# FOUNDER ACTION NEEDED: this only creates the secret CONTAINERS. Set the
# actual values (never committed, never pasted into chat):
#   terraform apply -var="smtp_user=..." -var="smtp_password=..."
# and set the non-secret connection details as GitHub Actions repo VARIABLES
# consumed by the deploy job the same way OSRM_BASE_URL already is:
#   SMTP_HOST, SMTP_PORT, SMTP_FROM

variable "smtp_user" {
  type        = string
  description = "SMTP auth username for the invoice mailbox. Never committed — supply at apply-time."
  sensitive   = true
}

variable "smtp_password" {
  type        = string
  description = "SMTP auth password for the invoice mailbox. Never committed — supply at apply-time."
  sensitive   = true
}

data "google_project" "current" {}

resource "google_secret_manager_secret" "smtp_user" {
  secret_id = "smtp-user"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "smtp_user" {
  secret      = google_secret_manager_secret.smtp_user.id
  secret_data = var.smtp_user
}

resource "google_secret_manager_secret" "smtp_password" {
  secret_id = "smtp-password"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "smtp_password" {
  secret      = google_secret_manager_secret.smtp_password.id
  secret_data = var.smtp_password
}

# Gen2 Cloud Functions run as the project's default compute service account
# unless a custom one is configured (not done here) — grant it read access to
# both secrets so the drain function can mount them at runtime.
locals {
  functions_runtime_sa = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_secret_manager_secret_iam_member" "smtp_user_access" {
  secret_id = google_secret_manager_secret.smtp_user.id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.functions_runtime_sa
}

resource "google_secret_manager_secret_iam_member" "smtp_password_access" {
  secret_id = google_secret_manager_secret.smtp_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.functions_runtime_sa
}
