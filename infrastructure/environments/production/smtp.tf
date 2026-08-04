# SMTP credentials for the invoice email the drain sends once a job's PoD is
# recorded (see packages/actions/src/drain.ts's sendInvoiceEmail task and
# packages/providers/nodemailer).
#
# NOT CURRENTLY WIRED UP — applying this creates the secret containers but
# functions/src/composition.ts does NOT read them (it reads a plain
# SMTP_USER/SMTP_PASSWORD env var instead, via a GitHub Actions repository
# SECRET — see .github/workflows/ci.yml). Why: merely calling
# firebase-functions' defineSecret() anywhere in the deployed bundle makes
# `firebase deploy` resolve it against Secret Manager during analysis, for
# EVERY function, regardless of which function's own `secrets: [...]`
# references it — so with neither the Secret Manager API enabled nor these
# secrets provisioned, declaring it broke the entire deploy
# (functions+hosting+firestore are one command) twice. See docs/HANDOFF.md's
# "Invoice email on delivery" section for the incident.
#
# This file is left in place as the real migration path: once the founder
# enables the Secret Manager API and applies this (terraform apply
# -var="smtp_user=..." -var="smtp_password=..."), a follow-up code change can
# switch composition.ts back to defineSecret() + this function's own
# `secrets: [...]` — tested end to end that time, not assumed. Applying or
# not applying this Terraform has NO effect on the current deploy either way.

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
