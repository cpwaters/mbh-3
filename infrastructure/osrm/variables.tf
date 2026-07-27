variable "project_id" {
  type    = string
  default = "mybackhaul-app"
}

variable "region" {
  type    = string
  default = "europe-west2"
}

variable "image" {
  type        = string
  description = "The OSRM image built by cloudbuild.yaml (…/osrm/osrm-gb:latest)."
  default     = "europe-west2-docker.pkg.dev/mybackhaul-app/osrm/osrm-gb:latest"
}

variable "max_instances" {
  type        = number
  description = "Cap on OSRM instances (bounds cost/abuse)."
  default     = 3
}

variable "osrm_public" {
  type        = bool
  description = "If true, allUsers may invoke OSRM (drain needs no token). If false, only invoker_service_account may — but that requires the drain to send an ID token (a documented follow-up)."
  # Default public for now: the drain sends no auth token yet, and access is
  # bounded by max_instances + scale-to-zero. Flip to false once the drain
  # signs its OSRM requests (see docs/runbooks/osrm.md, "Hardening").
  default = true
}

variable "invoker_service_account" {
  type        = string
  description = "The drain function's runtime service account (used when osrm_public = false), e.g. NNN-compute@developer.gserviceaccount.com."
  default     = ""
}
