// src/cesium/core/adminHighlight.js
import * as Cesium from "cesium";
import {
  buildAdmin1WfsUrl,
  buildAdmin2ByBjcdPrefix,
  buildHeritageInAdmin1WfsUrl,
  fetchGeoJson,
} from "../services/WfsUtil";
import { getHeritageModelConfig, HERITAGE_MODEL } from "./heritageModelConfig";

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
 * Heritage 포인트 위 glb 모델 관리 시스템 제거
 */
function clearHeritageModelSystem(viewer) {
  if (!viewer) return;

  const ds = viewer.__heritageModelDataSource;
  if (ds) {
    viewer.dataSources.remove(ds, true);
    viewer.__heritageModelDataSource = undefined;
  }

  const cb = viewer.__heritageModelPostRenderCallback;
  if (cb) {
    viewer.scene.postRender.removeEventListener(cb);
    viewer.__heritageModelPostRenderCallback = undefined;
  }

  // overlay 는 다음 모드에서 다시 세팅
  viewer.__heritageModelOptions = undefined;
}

/** kr_admin2 시군구 이름 읽기 */
function readRegionName(props, time) {
  if (!props) return null;

  let v = props.name;
  if (v != null) {
    if (typeof v.getValue === "function") {
      const val = v.getValue(time);
      if (val) return String(val);
    } else if (v) {
      return String(v);
    }
  }

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

/** 밀집도 라벨용: extrudedHeight 만큼 위로 올린 위치 */
function raiseLabelPosition(basePos, extrudedHeight) {
  if (!basePos || !Cesium.defined(basePos)) return basePos;

  const carto = Cesium.Cartographic.fromCartesian(basePos);
  const offset = (extrudedHeight || 0) + 500.0;
  carto.height += offset;

  return Cesium.Cartesian3.fromRadians(
    carto.longitude,
    carto.latitude,
    carto.height
  );
}

/** 포인트 위치에서 heightOffset 만큼 위로 올린 위치 */
function raisePositionByHeightOffset(basePos, heightOffset) {
  if (!basePos || !Cesium.defined(basePos)) return basePos;

  const offset = heightOffset || 0;
  if (offset === 0) return basePos;

  const carto = Cesium.Cartographic.fromCartesian(basePos);
  carto.height += offset;

  return Cesium.Cartesian3.fromRadians(
    carto.longitude,
    carto.latitude,
    carto.height
  );
}

/** Cartesian3[] 폴리곤 면적 m^2 근사 계산 (섬/자잘한 필터링용) */
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

/* ---------------- Heritage glb + 자동 라벨 시스템 ---------------- */

/**
 * Heritage 포인트용 glb 모델 매니저
 * - Heritage_ALL GeoJSON 기준
 * - 종목명(국보/민속/보물/사적)에 따라 glb uri 결정
 * - 카메라 거리 기반 glb 생성/삭제
 * - glb 가 있는 포인트 전부에 이름 라벨 표시
 * - 클릭한 포인트는 폰트 조금 키워서 강조
 */
function setupHeritageModelSystem(viewer, heritageDs, overlay) {
  if (!viewer || !heritageDs) return;

  clearHeritageModelSystem(viewer);

  const modelDs = new Cesium.CustomDataSource("HeritageModels");
  viewer.dataSources.add(modelDs);
  viewer.__heritageModelDataSource = modelDs;

  const entities = heritageDs.entities.values;
  const time = viewer.clock.currentTime;
  const items = [];

  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    const props = ent.properties;
    if (!props || !ent.position) continue;

    const pos =
      typeof ent.position.getValue === "function"
        ? ent.position.getValue(time)
        : ent.position;
    if (!pos) continue;

    const rawCategoryProp = props["종목명"];
    if (!rawCategoryProp) continue;

    const rawCategory =
      typeof rawCategoryProp.getValue === "function"
        ? rawCategoryProp.getValue(time)
        : rawCategoryProp;

    const cfg = getHeritageModelConfig(rawCategory);
    if (!cfg) continue;

    let nmProp = props["국가유산명"] || props["ccbaMnm1"] || props.name;
    if (nmProp && typeof nmProp.getValue === "function") {
      nmProp = nmProp.getValue(time);
    }
    const name = nmProp ? String(nmProp) : null;

    items.push({
      basePosition: pos,           // 포인트 위치
      modelPosition: null,         // glb 위치 (heightOffset 반영)
      config: cfg,
      modelEntity: null,
      heritageEntity: ent,
      name,
    });
  }

  viewer.__heritageModelOptions = {
    items,
    dataSource: modelDs,
    nearDistance: HERITAGE_MODEL.NEAR_DISTANCE,
    farDistance: HERITAGE_MODEL.FAR_DISTANCE,
    overlay,
    clickedIds: new Set(), // 클릭 강조용
  };

  const cb = function () {
    const opts = viewer.__heritageModelOptions;
    if (!opts || !opts.items || opts.items.length === 0) return;

    const cameraPos = viewer.camera.positionWC;
    if (!cameraPos) return;

    const { items, dataSource, nearDistance, farDistance, overlay, clickedIds } =
      opts;

    // 1) 거리 기반으로 glb 생성/삭제 + modelPosition 업데이트
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const pos = item.basePosition;
      if (!pos) continue;

      const dist = Cesium.Cartesian3.distance(cameraPos, pos);
      let modelEnt = item.modelEntity;

      if (modelEnt) {
        if (dist > farDistance) {
          dataSource.entities.remove(modelEnt);
          item.modelEntity = null;
          item.modelPosition = null;
          modelEnt = null;
        }
      }

      if (!modelEnt && dist < nearDistance) {
        const cfg = item.config;
        const modelPos = raisePositionByHeightOffset(
          pos,
          cfg.heightOffset ?? 0
        );

        const heading = Cesium.Math.toRadians(cfg.headingDeg ?? 0);
        const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0);
        const orientation =
          Cesium.Transforms.headingPitchRollQuaternion(modelPos, hpr);

        modelEnt = dataSource.entities.add({
          position: modelPos,
          orientation,
          model: {
            uri: cfg.uri,
            scale: cfg.scale ?? 1.0,
          },
        });

        item.modelEntity = modelEnt;
        item.modelPosition = modelPos;
      }
    }

    if (!overlay) return;

    // 2) glb 가 떠 있는 포인트들 전부에 라벨 표시
    const labels = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.modelEntity || !item.modelPosition || !item.name) continue;

      const id = item.heritageEntity.id;
      const isClicked = clickedIds && id != null && clickedIds.has(id);

      labels.push({
        worldPosition: item.modelPosition,
        text: item.name,
        fontSizePx: isClicked ? 18 : 16,
      });
    }

    if (labels.length === 0) {
      if (typeof overlay.clear === "function") overlay.clear();
    } else if (typeof overlay.showRegions === "function") {
      overlay.showRegions(labels, 16);
    } else if (typeof overlay.show === "function") {
      // showRegions 가 없다면, 일단 첫 것만이라도 표시 (fallback)
      const first = labels[0];
      overlay.show(first.worldPosition, first.text, first.fontSizePx || 16);
    }
  };

  viewer.scene.postRender.addEventListener(cb);
  viewer.__heritageModelPostRenderCallback = cb;
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
    clearHeritageModelSystem(viewer);
    overlay?.clear();
    return;
  }

  // 3D 모드가 꺼졌으면 admin2 / heritage / glb 모델 정리
  if (!admin3DMode) {
    clearAdmin2Layer(viewer, admin2SourceRef);
    clearHeritageLayer(viewer, heritageSourceRef);
    clearHeritageModelSystem(viewer);
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
        clearHeritageModelSystem(viewer);
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

          const cnt = countsByRegion[regionName] || 0;
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

        console.log("[DENSITY] extrudedHeight 매핑:", countToHeight);

        const color = Cesium.Color.fromCssColorString("#2563eb");
        const bigPositions = [];
        const minAreaM2 = 8_000_000;
        const labelInfos = [];

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

          if (regionName && overlay && typeof overlay.showRegions === "function") {
            let labelPos =
              ent.position && typeof ent.position.getValue === "function"
                ? ent.position.getValue(time)
                : ent.position;

            if (!labelPos) {
              const bs = Cesium.BoundingSphere.fromPoints(posArray);
              if (Cesium.defined(bs)) {
                labelPos = bs.center;
              }
            }

            if (labelPos) {
              const lifted = raiseLabelPosition(labelPos, height);
              labelInfos.push({
                worldPosition: lifted,
                text: regionName,
                fontSizePx: 14,
              });
            }
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
          }
        }

        if (overlay && typeof overlay.showRegions === "function") {
          overlay.showRegions(labelInfos, 14);
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
        clearHeritageModelSystem(viewer);
        overlay?.clear();

        // 1단계: kr_admin1에서 bjcd prefix 가져와서 해당 광역의 kr_admin2 전체를 밑 레이어로 띄움
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
              0.22
            );

            const regionLabelTargets = new Map();

            for (let i = 0; i < entities2.length; i++) {
              const ent = entities2[i];
              const poly = ent.polygon;
              const props = ent.properties;
              if (!poly || !props) continue;

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

              const regionName = readRegionName(props, time2);
              if (!regionName) continue;

              const area = polygonAreaMeters2(posArray);
              const bs = Cesium.BoundingSphere.fromPoints(posArray);
              if (!Cesium.defined(bs)) continue;

              const prev = regionLabelTargets.get(regionName);
              if (!prev || area > prev.area) {
                regionLabelTargets.set(regionName, {
                  ent,
                  center: bs.center,
                  area,
                });
              }
            }

            for (const [regionName, info] of regionLabelTargets.entries()) {
              const { ent, center } = info;

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

              ent.position = center;
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

        // 클릭 핸들러 (포인트 클릭 시 강조용)
        if (!viewer.__heritageClickHandlerInstalled) {
          viewer.__heritageClickHandlerInstalled = true;

          viewer.screenSpaceEventHandler.setInputAction(
            (movement) => {
              if (!overlay) return;

              const picked = viewer.scene.pick(movement.position);
              if (!Cesium.defined(picked) || !picked.id) return;

              const ent = picked.id;

              // kr_admin2 폴리곤은 제외하고 Heritage 포인트만
              if (!ent.point || ent.polygon) return;

              const props = ent.properties;
              if (!props) return;

              const rawLabelProp = props["국가유산명"] || props.name;
              const labelProp =
                rawLabelProp &&
                typeof rawLabelProp.getValue === "function"
                  ? rawLabelProp.getValue(viewer.clock.currentTime)
                  : rawLabelProp;

              const name = labelProp ? String(labelProp) : null;

              const pos =
                ent.position &&
                typeof ent.position.getValue === "function"
                  ? ent.position.getValue(viewer.clock.currentTime)
                  : ent.position;

              if (!name || !pos) return;

              // 클릭 시 바로 이름 한 번 보여주는 효과는 유지
              overlay.show(pos, name, 16);

              // glb 자동 라벨 시스템이 있다면, 클릭된 포인트는 폰트를 조금 키워서 강조
              const opts = viewer.__heritageModelOptions;
              if (opts && opts.clickedIds && ent.id != null) {
                if (opts.clickedIds.has(ent.id)) {
                  opts.clickedIds.delete(ent.id);
                } else {
                  opts.clickedIds.add(ent.id);
                }
              }
            },
            Cesium.ScreenSpaceEventType.LEFT_CLICK
          );
        }

        if (cancelled) return;

        // 카메라 거리 기반 glb + 이름 라벨 시스템
        setupHeritageModelSystem(viewer, heritageDs, overlay);
      } catch (err) {
        console.error("3D 모델 모드 처리 중 오류:", err);
      }
    })();
  }

  return () => {
    cancelled = true;
  };
}
