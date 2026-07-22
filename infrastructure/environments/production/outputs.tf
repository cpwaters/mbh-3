# Set these as GitHub Actions repo VARIABLES so the deploy job can auth:
#   WIF_PROVIDER          <- workload_identity_provider
#   DEPLOY_SERVICE_ACCOUNT <- deployer_service_account
# (Both are non-secret — the security is the repo-pinned attribute condition.)

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  value = google_service_account.deployer.email
}
