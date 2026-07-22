variable "project_id" {
  type        = string
  description = "The fresh Firebase/GCP project id for mbh-3."
  default     = "mybackhaul-app"
}

variable "region" {
  type    = string
  default = "europe-west2"
}

variable "billing_account" {
  type        = string
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX) the budget alert watches."
}

variable "alert_email" {
  type        = string
  description = "Email that receives budget + uptime alerts."
}

variable "budget_amount_gbp" {
  type        = number
  description = "Monthly budget in GBP; alerts fire at 50/90/100%."
  default     = 20
}

variable "github_repo" {
  type        = string
  description = "owner/repo allowed to deploy via Workload Identity Federation."
  default     = "cpwaters/mbh-3"
}

variable "site_url" {
  type        = string
  description = "The deployed site host for the uptime check (no scheme), e.g. mybackhaul-app.web.app."
  default     = "mybackhaul-app.web.app"
}
