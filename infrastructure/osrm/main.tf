# OSRM routing server on Cloud Run — scale-to-zero, so it costs nothing while
# idle and matches the near-zero-idle-cost principle. Separate Terraform root
# from environments/production because the Cloud Run service references an image
# that must already be built and pushed (see docs/runbooks/osrm.md). Apply this
# AFTER the image exists.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}

# The registry the OSRM image is pushed to (also created here; create it first
# with `terraform apply -target=google_artifact_registry_repository.osrm`, then
# build the image, then apply the rest).
resource "google_artifact_registry_repository" "osrm" {
  location      = var.region
  repository_id = "osrm"
  format        = "DOCKER"
  description   = "Self-hosted OSRM routing images"
}

resource "google_cloud_run_v2_service" "osrm" {
  name     = "osrm"
  location = var.region
  # Only reachable via the internet if you make it public below; keep ingress
  # limited to internal + load balancer by default is not needed here since the
  # drain calls it over the internet with an invoker binding.
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    # Scale to zero when idle; cap instances so a runaway (or abuse) is bounded.
    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }
    containers {
      image = var.image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "2"
          memory = "4Gi"
        }
        # Loading the graph on cold start is CPU-heavy; boost it.
        startup_cpu_boost = true
      }
      startup_probe {
        tcp_socket {
          port = 8080
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 30 # allow up to ~5 min for the graph to load
      }
    }
    # The graph load can take a while on cold start; give requests room.
    timeout = "60s"
  }

  depends_on = [google_artifact_registry_repository.osrm]
}

# Who may invoke the OSRM service. Default: the drain's runtime service account
# only (private). Set osrm_public = true to allow unauthenticated access (the
# drain then needs no token, but the endpoint is open — bound by max_instances).
resource "google_cloud_run_v2_service_iam_member" "invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.osrm.name
  role     = "roles/run.invoker"
  member   = var.osrm_public ? "allUsers" : "serviceAccount:${var.invoker_service_account}"
}
