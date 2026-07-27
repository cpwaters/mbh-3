# Self-contained OSRM routing server for Great Britain, graph baked in so the
# container is stateless and Cloud Run can scale it to zero. Two stages: build
# the routing graph from OpenStreetMap data (heavy — needs ~16GB RAM, done once
# in Cloud Build), then a slim serving stage that just runs osrm-routed.
#
# Build via infrastructure/osrm/cloudbuild.yaml (a high-memory Cloud Build
# machine), NOT locally. See docs/runbooks/osrm.md.

ARG OSRM_IMAGE=ghcr.io/project-osrm/osrm-backend:v5.27.1
# Great Britain extract (~1.2GB). Swap the region here to cover a different area.
ARG REGION_URL=https://download.geofabrik.de/europe/great-britain-latest.osm.pbf

FROM ${OSRM_IMAGE} AS build
WORKDIR /data
ADD ${REGION_URL} /data/region.osm.pbf
# MLD pipeline (fast queries, modest serve-time memory).
RUN osrm-extract -p /opt/car.lua /data/region.osm.pbf \
 && osrm-partition /data/region.osrm \
 && osrm-customize /data/region.osrm \
 && rm -f /data/region.osm.pbf

FROM ${OSRM_IMAGE}
WORKDIR /data
COPY --from=build /data/region.osrm* /data/
# Cloud Run provides $PORT (8080); osrm-routed must bind 0.0.0.0.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "osrm-routed --algorithm mld --ip 0.0.0.0 --port ${PORT} /data/region.osrm"]
