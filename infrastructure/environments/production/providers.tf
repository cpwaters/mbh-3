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

  # Some APIs (e.g. billingbudgets) require a quota/billing project on every
  # request. With user Application Default Credentials the provider otherwise
  # falls back to the OAuth client's project, where the API is disabled. Force
  # requests to be quota-attributed to this project.
  billing_project       = var.project_id
  user_project_override = true
}
