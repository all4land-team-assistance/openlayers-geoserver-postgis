import * as Cesium from "cesium";
import {
  buildAdmin1WfsUrl,
  buildAdmin2ByBjcdPrefix,
  buildHeritageInAdmin1WfsUrl,
  fetchGeoJson,
} from "../services/WfsUtil";

/**
 * admin1 레이어 제거
 */
function clearAdmin1Layer(viewer, admin1SourceRef) {
  if (admin1SourceRef.current) {
    viewer.dataSources.remove(admin1SourceRef.current, true);
    admin1SourceRef.current = null;
  }
}

/**
 * admin2 레이어 제거
 */
function clearAdmin2Layer(viewer, admin2SourceRef) {
  if (admin2SourceRef.current) {
    viewer.dataSources.remove(admin2SourceRef.current, true);
    admin2SourceRef.current = null;
  }
}

/**
 * Heritage 레이어 제거
 */
function clearHeritageLayer(viewer, heritageSourceRef) {
  if (heritageSourceRef.current) {
    viewer.dataSources.remove(heritageSourceRef.current, true);
    heritageSourceRef.current = null;
  }
}

/**
 * properties에서 시군구 이름을 안전하게 읽는 헬퍼
 */
function readRegionName(props, time) {
  if (!props) return null;

  // 1순위: name 컬럼 (kr_admin2 스키마 기준)
  let v = props.name;
  if (v != null) {
    if (typeof v.getValue === "function") {
      const val = v.getValue(time);
      if (val) return String(val);
    } else if (v) {
      return String(v);
    }
  }

  // 혹시 컬럼명이 다른 경우 대비 (필요하면 키만 추가)
  const candidates = ["adm_nm", "SIG_KOR_NM", "시군구명"];
  for (const key of candidates) {
    v = props[key];
    if (!v) continue;
    if (typeof v.getValue === "function") {
      const val = v.getValue(time);
      if (val) return String(val);
    } else if (v) {
      return String(v);
    }
  }

  return null;
}

/**
 * 기본 광역 하이라이트용 effect
 * - selectedAdmin1만 선택된 상태 (admin3DMode === null)
 */
export function runAdmin1BasicEffect({
  viewer,
  overlay,
  selectedAdmin1,
  admin3DMode,
  admin1SourceRef,
}) {
  if (!viewer) return;

  if (!selectedAdmin1) {
    clearAdmin1Layer(viewer, admin1SourceRef);
    overlay?.clear();
    return;
  }

  // 3D 모드 켜져 있으면 기본 하이라이트는 건드리지 않음
  if (admin3DMode) return;

  let cancelled = false;

  (async () => {
    try {
      console.log("[ADMIN1 기본] 선택된 광역:", selectedAdmin1);

      const url = buildAdmin1WfsUrl(selectedAdmin1);
      const ds = await Cesium.GeoJsonDataSource.load(url, {
        clampToGround: false,
      });
      if (cancelled) return;

      clearAdmin1Layer(viewer, admin1SourceRef);
      viewer.dataSources.add(ds);
      admin1SourceRef.current = ds;

      const entities = ds.entities.values;
      const time = viewer.clock.currentTime;
      const color = Cesium.Color.fromCssColorString("#2563eb").withAlpha(0.6);

      const extrudedHeight = 3000.0;
      const bigPositions = [];

      for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        const poly = ent.polygon;
        if (!poly) continue;

        let hierarchy = poly.hierarchy;
        if (!hierarchy) continue;

        if (typeof hierarchy.getValue === "function") {
          hierarchy = hierarchy.getValue(time);
        }

        const posArray = hierarchy.positions || hierarchy;
        if (!posArray || posArray.length < 3) continue;

        poly.material = color;
        poly.outline = true;
        poly.outlineColor = Cesium.Color.BLUE.withAlpha(0.8);
        poly.height = 0;
        poly.extrudedHeight = extrudedHeight;

        for (let j = 0; j < posArray.length; j++) {
          bigPositions.push(posArray[j]);
        }
      }

      if (bigPositions.length > 0) {
        const bs = Cesium.BoundingSphere.fromPoints(bigPositions);
        if (Cesium.defined(bs) && bs.radius > 0) {
          viewer.camera.flyToBoundingSphere(bs, {
            duration: 1.5,
            offset: new Cesium.HeadingPitchRange(
              0,
              Cesium.Math.toRadians(-60),
              bs.radius * 3.0
            ),
          });

          // 광역 이름은 크게
          overlay?.show(bs.center, selectedAdmin1, 35);
        }
      }
    } catch (err) {
      console.error("admin1 기본 하이라이트 실패:", err);
    }
  })();

  return () => {
    cancelled = true;
  };
}

/**
 * 밀집도 / 3D 모델 모드 effect
 */
export function runAdmin3DModeEffect({
  viewer,
  overlay,
  selectedAdmin1,
  admin3DMode, // "density" | "model" | null
  admin1SourceRef,
  admin2SourceRef,
  heritageSourceRef,
}) {
  if (!viewer) return;

  if (!selectedAdmin1) {
    clearAdmin1Layer(viewer, admin1SourceRef);
    clearAdmin2Layer(viewer, admin2SourceRef);
    clearHeritageLayer(viewer, heritageSourceRef);
    overlay?.clear();
    return;
  }

  // 3D 모드가 꺼졌으면 admin2 / heritage만 정리
  if (!admin3DMode) {
    clearAdmin2Layer(viewer, admin2SourceRef);
    clearHeritageLayer(viewer, heritageSourceRef);
    return;
  }

  let cancelled = false;

  // 밀집도 모드
  if (admin3DMode === "density") {
    console.log("밀집도 모드 켜짐");
    (async () => {
      try {
        console.log("[DENSITY] 선택된 광역:", selectedAdmin1);

        clearAdmin1Layer(viewer, admin1SourceRef);
        clearAdmin2Layer(viewer, admin2SourceRef);
        clearHeritageLayer(viewer, heritageSourceRef);

        // 광역 이름 텍스트는 밀집도 모드에서는 숨김
        overlay?.clear();

        // 1단계: kr_admin1에서 bjcd 가져오기
        const admin1Url = buildAdmin1WfsUrl(selectedAdmin1);
        const admin1Json = await fetchGeoJson(admin1Url);
        if (cancelled) return;

        const admin1Features = admin1Json.features || [];
        if (!admin1Features.length) {
          console.warn(
            "[DENSITY] kr_admin1에서 광역을 찾지 못함:",
            selectedAdmin1
          );
          return;
        }

        const admin1Props = admin1Features[0].properties || {};
        const admin1BjcdRaw = admin1Props.bjcd;
        const admin1Bjcd = String(admin1BjcdRaw || "");
        const bjcdPrefix = admin1Bjcd.slice(0, 2);

        console.log(
          "[DENSITY] kr_admin1 bjcd=",
          admin1Bjcd,
          "prefix=",
          bjcdPrefix
        );

        // 2단계: prefix 기반으로 kr_admin2 조회
        const admin2Url = buildAdmin2ByBjcdPrefix(bjcdPrefix);
        const admin2Ds = await Cesium.GeoJsonDataSource.load(admin2Url, {
          clampToGround: false,
        });
        if (cancelled) return;

        viewer.dataSources.add(admin2Ds);
        admin2SourceRef.current = admin2Ds;

        // 3단계: Heritage_ALL 조회
        const heritageUrl = buildHeritageInAdmin1WfsUrl(selectedAdmin1);
        const heritageGeojson = await fetchGeoJson(heritageUrl);
        if (cancelled) return;

        const heritageFeatures = heritageGeojson.features || [];
        console.log(
          "[DENSITY] Heritage_ALL feature 개수:",
          heritageFeatures.length
        );
        console.log(
          "[DENSITY] Heritage_ALL 예시:",
          heritageFeatures
            .slice(0, 5)
            .map((f) => f.properties?.["국가유산명"])
        );

        // 시군구별 문화재 개수 카운트
        const countsByRegion = {};
        for (const f of heritageFeatures) {
          const props = f.properties || {};
          const guName = props["시군구명"];
          if (!guName) continue;
          countsByRegion[guName] = (countsByRegion[guName] || 0) + 1;
        }
        console.log("[DENSITY] 시군구별 문화재 개수:", countsByRegion);

        const entities = admin2Ds.entities.values;
        const time = viewer.clock.currentTime;

        const perEntityCount = new Map();
        const allCounts = [];

        // 엔티티별로 개수 매핑
        for (let i = 0; i < entities.length; i++) {
          const ent = entities[i];
          const props = ent.properties;
          const poly = ent.polygon;
          if (!props || !poly) continue;

          const regionName = readRegionName(props, time);
          if (!regionName) {
            console.warn(
              "[DENSITY] admin2 엔티티에서 name을 읽지 못함:",
              props
            );
            continue;
          }

          const cnt = countsByRegion[regionName] ?? 0;
          perEntityCount.set(ent, cnt);
          allCounts.push(cnt);
        }

        const uniquePositive = Array.from(
          new Set(allCounts.filter((c) => c > 0))
        ).sort((a, b) => a - b);

        const baseHeight = 1000.0;
        const step = 1000.0;
        const countToHeight = {};

        uniquePositive.forEach((cnt, idx) => {
          countToHeight[cnt] = baseHeight + (idx + 1) * step;
        });

        // 밀집도 extrude용 반투명 색
        const color = Cesium.Color.fromCssColorString("#2563eb");

        const bigPositions = [];
        const minAreaM2 = 8_000_000;

        for (let i = 0; i < entities.length; i++) {
          const ent = entities[i];
          const poly = ent.polygon;
          const props = ent.properties;
          if (!poly || !props) continue;

          let hierarchy = poly.hierarchy;
          if (!hierarchy) continue;
          if (typeof hierarchy.getValue === "function") {
            hierarchy = hierarchy.getValue(time);
          }
          const posArray = hierarchy.positions || hierarchy;
          if (!posArray || posArray.length < 3) {
            ent.show = false;
            continue;
          }

          const area = polygonAreaMeters2(posArray);
          if (area < minAreaM2) {
            ent.show = false;
            continue;
          }

          const regionName = readRegionName(props, time);

          const cnt = perEntityCount.get(ent) ?? 0;
          const height =
            cnt > 0 && countToHeight[cnt] != null
              ? countToHeight[cnt]
              : baseHeight;

          ent.show = true;
          poly.material = color;
          poly.outline = true;
          poly.outlineColor = Cesium.Color.BLUE.withAlpha(0.8);
          poly.height = 0;
          poly.extrudedHeight = height;

          for (let j = 0; j < posArray.length; j++) {
            bigPositions.push(posArray[j]);
          }

          if (regionName) {
            ent.label = new Cesium.LabelGraphics({
              text: regionName,
              font: "700 18px 'Noto Sans KR', system-ui, sans-serif",
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              pixelOffset: new Cesium.Cartesian2(0, 0),
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            });
          }
        }

        console.log("[DENSITY] extrudedHeight 매핑:", countToHeight);

        if (bigPositions.length > 0) {
          const bs = Cesium.BoundingSphere.fromPoints(bigPositions);
          if (Cesium.defined(bs) && bs.radius > 0) {
            viewer.camera.flyToBoundingSphere(bs, {
              duration: 1.5,
              offset: new Cesium.HeadingPitchRange(
                0,
                Cesium.Math.toRadians(-60),
                bs.radius * 3.0
              ),
            });
          }
        }

        // 시군구 클릭 시 DOM 오버레이로 이름 표시
        if (!viewer.__admin2ClickHandlerInstalled) {
          viewer.__admin2ClickHandlerInstalled = true;

          viewer.screenSpaceEventHandler.setInputAction(
            (movement) => {
              if (!overlay) return;

              const picked = viewer.scene.pick(movement.position);
              if (!Cesium.defined(picked) || !picked.id) return;

              const ent = picked.id;
              if (!ent.polygon || !ent.properties) return;

              const timeNow = viewer.clock.currentTime;
              const regionName = readRegionName(ent.properties, timeNow);
              if (!regionName) {
                console.warn(
                  "[DENSITY] 클릭된 admin2 엔티티에서 이름을 읽지 못함:",
                  ent.properties
                );
                return;
              }

              let hierarchy = ent.polygon.hierarchy;
              if (!hierarchy) return;
              if (typeof hierarchy.getValue === "function") {
                hierarchy = hierarchy.getValue(timeNow);
              }
              const posArray = hierarchy.positions || hierarchy;
              if (!posArray || posArray.length < 3) return;

              const bs = Cesium.BoundingSphere.fromPoints(posArray);
              if (!Cesium.defined(bs)) return;

              // 세부 지역은 글자 크기 작게 (예: 18px)
              overlay.show(bs.center, regionName, 18);
            },
            Cesium.ScreenSpaceEventType.LEFT_CLICK
          );
        }
      } catch (err) {
        console.error("밀집도 모드 처리 중 오류:", err);
      }
    })();
  }

  // 3D 모델 모드
  if (admin3DMode === "model") {
    (async () => {
      try {
        console.log("[MODEL] 선택된 광역:", selectedAdmin1);

        clearAdmin1Layer(viewer, admin1SourceRef);
        clearAdmin2Layer(viewer, admin2SourceRef);
        clearHeritageLayer(viewer, heritageSourceRef);
        overlay?.clear();

        // 1단계: kr_admin1에서 bjcd prefix 가져와서
        //        해당 광역의 kr_admin2 전체를 밑 레이어로 띄움
        const admin1Url = buildAdmin1WfsUrl(selectedAdmin1);
        const admin1Json = await fetchGeoJson(admin1Url);
        if (cancelled) return;

        const admin1Features = admin1Json.features || [];
        if (!admin1Features.length) {
          console.warn(
            "[MODEL] kr_admin1에서 광역을 찾지 못함:",
            selectedAdmin1
          );
        } else {
          const admin1Props = admin1Features[0].properties || {};
          const admin1BjcdRaw = admin1Props.bjcd;
          const admin1Bjcd = String(admin1BjcdRaw || "");
          const bjcdPrefix = admin1Bjcd.slice(0, 2);

          console.log(
            "[MODEL] kr_admin1 bjcd=",
            admin1Bjcd,
            "prefix=",
            bjcdPrefix
          );

          const admin2Url = buildAdmin2ByBjcdPrefix(bjcdPrefix);
          const admin2Ds = await Cesium.GeoJsonDataSource.load(admin2Url, {
            clampToGround: false,
          });
          if (!cancelled) {
            viewer.dataSources.add(admin2Ds);
            admin2SourceRef.current = admin2Ds;

            const entities2 = admin2Ds.entities.values;
            const time2 = viewer.clock.currentTime;

            const baseColor2 = Cesium.Color.fromCssColorString("#1d4ed8");
            const fillColor2 = new Cesium.Color(
              baseColor2.red,
              baseColor2.green,
              baseColor2.blue,
              0.22 // 밑 레이어용, 연하고 투명
            );

            for (let i = 0; i < entities2.length; i++) {
              const ent = entities2[i];
              const poly = ent.polygon;
              if (!poly) continue;

              let hierarchy = poly.hierarchy;
              if (!hierarchy) continue;
              if (typeof hierarchy.getValue === "function") {
                hierarchy = hierarchy.getValue(time2);
              }
              const posArray = hierarchy.positions || hierarchy;
              if (!posArray || posArray.length < 3) {
                ent.show = false;
                continue;
              }

              poly.material = fillColor2;
              poly.outline = true;
              poly.outlineColor = baseColor2;
              poly.height = 0;
              poly.extrudedHeight = 0;
            }
          }
        }

        // 2단계: Heritage_ALL 포인트
        const heritageUrl = buildHeritageInAdmin1WfsUrl(selectedAdmin1);
        const heritageDs = await Cesium.GeoJsonDataSource.load(heritageUrl, {
          clampToGround: false,
        });
        if (cancelled) return;

        viewer.dataSources.add(heritageDs);
        heritageSourceRef.current = heritageDs;

        const entities = heritageDs.entities.values;
        const time = viewer.clock.currentTime;
        const positions = [];

        console.log("[MODEL] Heritage_ALL 엔티티 개수:", entities.length);

        for (let i = 0; i < entities.length; i++) {
          const ent = entities[i];
          const props = ent.properties;
          if (!ent.position) continue;

          // 기본으로 올라오는 파란 풍선/라벨 제거
          ent.billboard = undefined;
          ent.label = undefined;

          const pos =
            typeof ent.position.getValue === "function"
              ? ent.position.getValue(time)
              : ent.position;
          if (pos) positions.push(pos);

          let nm = null;
          if (props) {
            const nmProp = props["국가유산명"] || props.name;
            nm =
              nmProp && typeof nmProp.getValue === "function"
                ? nmProp.getValue(time)
                : nmProp;
          }

          // 포인트 스타일
          ent.point = new Cesium.PointGraphics({
            pixelSize: 10,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
          });

          if (i < 5 && nm) {
            console.log("[MODEL] 샘플 문화재:", nm);
          }
        }

        if (positions.length > 0) {
          const bs = Cesium.BoundingSphere.fromPoints(positions);
          if (Cesium.defined(bs) && bs.radius > 0) {
            viewer.camera.flyToBoundingSphere(bs, {
              duration: 1.5,
              offset: new Cesium.HeadingPitchRange(
                0,
                Cesium.Math.toRadians(-60),
                bs.radius * 4.0
              ),
            });
          }
        }

        // 문화재 클릭 시 DOM 말풍선으로 이름 표시
        if (!viewer.__heritageClickHandlerInstalled) {
          viewer.__heritageClickHandlerInstalled = true;

          viewer.screenSpaceEventHandler.setInputAction(
            (movement) => {
              if (!overlay) return;

              const picked = viewer.scene.pick(movement.position);
              if (!Cesium.defined(picked) || !picked.id) return;

              const ent = picked.id;
              const props = ent.properties;
              if (!props) return;

              const labelProp = props["국가유산명"] || props.name;
              const name =
                labelProp && typeof labelProp.getValue === "function"
                  ? labelProp.getValue(viewer.clock.currentTime)
                  : labelProp;

              const pos =
                ent.position &&
                typeof ent.position.getValue === "function"
                  ? ent.position.getValue(viewer.clock.currentTime)
                  : ent.position;

              if (!name || !pos) return;

              console.log("[MODEL] 클릭된 문화재:", name);

              // 작은 포인트용이라 글자 크기를 줄여서 사용
              overlay.show(pos, name, 16);
            },
            Cesium.ScreenSpaceEventType.LEFT_CLICK
          );
        }
      } catch (err) {
        console.error("3D 모델 모드 처리 중 오류:", err);
      }
    })();
  }

  return () => {
    cancelled = true;
  };
}

/**
 * Cartesian3[] 폴리곤 면적 m^2 근사 계산 (섬 필터링용)
 */
function polygonAreaMeters2(positions) {
  const n = positions.length;
  if (n < 3) return 0;

  let cx = 0,
    cy = 0,
    cz = 0;
  for (let i = 0; i < n; i++) {
    const p = positions[i];
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  cx /= n;
  cy /= n;
  cz /= n;

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
