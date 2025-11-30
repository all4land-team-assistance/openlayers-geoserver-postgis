import { GEOSERVER_URL, WORKSPACE } from "../../config/constants";

/**
 * 공통 WFS URL 쿼리 파라미터 생성
 */
function buildBaseWfsParams(typeName) {
  return new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName: `${WORKSPACE}:${typeName}`,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
  });
}

/**
 * kr_admin1 레이어에서 name 필터로 GeoJSON WFS URL 생성
 */
export function buildAdmin1WfsUrl(name) {
  const safeName = String(name || "").replace(/'/g, "''");

  const params = buildBaseWfsParams("kr_admin1");
  params.set("cql_filter", `name='${safeName}'`);

  return `${GEOSERVER_URL}/wfs?${params.toString()}`;
}

/**
 * kr_admin2 레이어에서 bjcd 앞 2자리(prefix)로 필터링하는 WFS URL
 */
export function buildAdmin2ByBjcdPrefix(bjcdPrefix) {
  const prefix = String(bjcdPrefix || "").slice(0, 2);
  const params = buildBaseWfsParams("kr_admin2");

  if (!prefix) {
    console.warn(
      "[buildAdmin2ByBjcdPrefix] prefix 가 비어있습니다. kr_admin2 전체를 반환합니다."
    );
  } else {
    params.set("cql_filter", `bjcd LIKE '${prefix}%'`);
  }

  return `${GEOSERVER_URL}/wfs?${params.toString()}`;
}

/**
 * Heritage_ALL 레이어에서 특정 광역시/도(admin1Name)의 문화재만 가져오는 WFS URL
 */
export function buildHeritageInAdmin1WfsUrl(admin1Name) {
  const safeName = String(admin1Name || "").replace(/'/g, "''");

  const params = buildBaseWfsParams("Heritage_ALL");
  params.set("cql_filter", `"시도명"='${safeName}'`);

  return `${GEOSERVER_URL}/wfs?${params.toString()}`;
}

/**
 * 공통 GeoJSON fetch 유틸
 */
export async function fetchGeoJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `[fetchGeoJson] WFS 요청 실패: ${res.status} ${res.statusText}`
    );
  }
  return res.json();
}
