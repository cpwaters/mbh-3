output "osrm_url" {
  description = "The OSRM service URL — set this as the OSRM_BASE_URL GitHub Actions variable so CI deploys the drain against it."
  value       = google_cloud_run_v2_service.osrm.uri
}
