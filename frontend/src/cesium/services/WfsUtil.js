// src/cesium/services/admin1Wfs.js
import { GEOSERVER_URL, WORKSPACE } from "../../config/constants";

/**
 * kr_admin1 레이어에서 name 필터로 GeoJSON WFS URL 생성
 */
export function buildAdmin1WfsUrl(name) {
  const safeName = String(name || "").replace(/'/g, "''");

  const params = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName: `${WORKSPACE}:kr_admin1`,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    cql_filter: `name='${safeName}'`,
  });

  return `${GEOSERVER_URL}/wfs?${params.toString()}`;
}
