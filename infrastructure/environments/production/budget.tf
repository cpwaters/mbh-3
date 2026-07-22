# A product with no users this month should cost pounds, not hundreds. This
# budget emails at 50/90/100% of a small monthly cap so a runaway cost is
# caught fast.

# The budgets API stores/returns the project *number*, so filtering by the
# project id produces a perpetual diff. Resolve the number once and use it.
data "google_project" "this" {
  project_id = var.project_id
}

resource "google_monitoring_notification_channel" "email" {
  display_name = "mbh alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account
  display_name    = "mbh-3 monthly budget"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "GBP"
      units         = tostring(var.budget_amount_gbp)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = [google_monitoring_notification_channel.email.id]
    disable_default_iam_recipients   = false
  }
}
