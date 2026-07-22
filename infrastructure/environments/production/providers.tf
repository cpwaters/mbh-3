terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  # State is local for now (single founder). Move to a GCS backend before a
  # second operator touches infrastructure.
}

provider "google" {
  project = var.project_id
  region  = var.region
}
