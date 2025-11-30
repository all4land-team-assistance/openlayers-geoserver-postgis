import * as Cesium from "cesium";

// kr_admin1 GeoJsonDataSource 기반으로 minAreaM2 이상인 폴리곤만 파란색 + extrudedHeight 적용
export function styleAndFlyToAdmin1(options) {
  const {
    viewer,
    dataSource,
    name,
    extrudedHeight = 5000.0,
    minAreaM2 = 0,      // m^2 기준 최소 면적. 0이면 전체 사용
  } = options || {};

  if (!viewer || !dataSource) return { labelPosition: null };

  const color = Cesium.Color.fromCssColorString("#2563eb").withAlpha(0.6);
  const entities = dataSource.entities.values;
  const time = viewer.clock.currentTime;

  const bigPositions = [];

  // 큰 폴리곤만 extrude
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    const poly = e.polygon;
    if (!poly) continue;

    let hierarchy = poly.hierarchy;
    if (!hierarchy) continue;

    if (typeof hierarchy.getValue === "function") {
      hierarchy = hierarchy.getValue(time);
    }

    const posArray = hierarchy.positions || hierarchy;
    if (!posArray || posArray.length < 3) {
      e.show = false;
      continue;
    }

    const area = polygonAreaMeters2(posArray);
    if (area < minAreaM2) {
      // 작은 섬/조각은 렌더링 제외
      e.show = false;
      continue;
    }

    e.show = true;
    e.polygon.material = color;
    e.polygon.outline = true;
    e.polygon.outlineColor = Cesium.Color.BLUE.withAlpha(0.8);
    e.polygon.height = 0;
    e.polygon.extrudedHeight = extrudedHeight;

    for (let j = 0; j < posArray.length; j++) {
      bigPositions.push(posArray[j]);
    }
  }

  if (bigPositions.length === 0) {
    return { labelPosition: null };
  }

  const bs = Cesium.BoundingSphere.fromPoints(bigPositions);
  let labelPosition = null;

  if (bs && bs.radius > 0 && Cesium.defined(bs.center)) {
    // 카메라 이동
    viewer.camera.flyToBoundingSphere(bs, {
      duration: 1.5,
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-60),
        bs.radius * 3.0,
      ),
    });

    // 중심 Cartographic → extrudedHeight 위쪽의 Cartesian3
    const centerCarto = Cesium.Cartographic.fromCartesian(bs.center);
    const labelHeight = extrudedHeight + 1000.0;

    labelPosition = Cesium.Cartesian3.fromRadians(
      centerCarto.longitude,
      centerCarto.latitude,
      labelHeight,
    );
  }

  return { labelPosition };
}

// Cartesian3 배열로 된 폴리곤 면적을 m^2 단위로 근사 계산
function polygonAreaMeters2(positions) {
  const n = positions.length;
  if (n < 3) return 0;

  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const p = positions[i];
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  cx /= n; cy /= n; cz /= n;

  const center = new Cesium.Cartesian3(cx, cy, cz);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());

  const local = [];

  for (let i = 0; i < n; i++) {
    const p = positions[i];
    const lp = Cesium.Matrix4.multiplyByPoint(
      invEnu,
      p,
      new Cesium.Cartesian3()
    );
    local.push({ x: lp.x, y: lp.y });
  }

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += local[i].x * local[j].y - local[j].x * local[i].y;
  }

  return Math.abs(area) * 0.5;
}
