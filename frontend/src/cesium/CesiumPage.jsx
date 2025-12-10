// src/cesium/CesiumPage.jsx
import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { createAdminNameOverlay } from "./hooks/useAdminNameOverlay";
import {
  runAdmin1BasicEffect,
  runAdmin3DModeEffect,
} from "./core/adminHighlight";

/**
 * props
 *  - selectedAdmin1: "경기도" 같은 광역 이름
 *  - admin3DMode: "density" | "model" | null
 *  - searchResults: 검색 패널 결과 (3D에서도 마커/클러스터로 표출)
 *  - onSearchResultClick: 3D 마커 클릭 시 상위로 전달 (상세 패널 열기)
 *  - flyToLocation: 검색 리스트 클릭 등으로 전달되는 좌표 [lon, lat]
 */
export default function CesiumPage({
  style = { width: "100%", height: "100%" },
  selectedAdmin1,
  admin3DMode, // "density" | "model" | null
  searchResults = [],
  onSearchResultClick,
  flyToLocation = null,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const admin1SourceRef = useRef(null); // kr_admin1 광역
  const admin2SourceRef = useRef(null); // kr_admin2 시군구
  const heritageSourceRef = useRef(null); // Heritage_ALL
  const adminNameOverlayRef = useRef(null); // DOM 말풍선(광역 / 클릭용)
  const searchResultDsRef = useRef(null); // 3D 검색 결과 전용 데이터소스

  // Viewer 초기화
  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      timeline: false,
      animation: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      // terrain / baseLayer 필요하면 여기서 설정
    });
    viewerRef.current = viewer;

    // 지형에 가리지 않도록
    viewer.scene.globe.depthTestAgainstTerrain = false;
    if (viewer.scene.postProcessStages?.fxaa) {
      viewer.scene.postProcessStages.fxaa.enabled = true;
    }

    // 광역 이름 오버레이
    adminNameOverlayRef.current = createAdminNameOverlay(viewer, 35);

    // 초기 카메라 위치 (대한민국 전체)
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(126.978, 37.5665, 600000.0),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-90.0),
        roll: 0,
      },
    });

    return () => {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;

      if (admin1SourceRef.current) {
        v.dataSources.remove(admin1SourceRef.current, true);
        admin1SourceRef.current = null;
      }
      if (admin2SourceRef.current) {
        v.dataSources.remove(admin2SourceRef.current, true);
        admin2SourceRef.current = null;
      }
      if (heritageSourceRef.current) {
        v.dataSources.remove(heritageSourceRef.current, true);
        heritageSourceRef.current = null;
      }
      if (searchResultDsRef.current) {
        v.dataSources.remove(searchResultDsRef.current, true);
        searchResultDsRef.current = null;
      }
      if (adminNameOverlayRef.current) {
        adminNameOverlayRef.current.clear();
        adminNameOverlayRef.current = null;
      }

      v.destroy();
      viewerRef.current = null;
    };
  }, []);

  // 기본: 광역 선택만 했을 때 (admin3DMode === null 인 경우)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const overlay = adminNameOverlayRef.current;

    return runAdmin1BasicEffect({
      viewer,
      overlay,
      selectedAdmin1,
      admin3DMode,
      admin1SourceRef,
    });
  }, [selectedAdmin1, admin3DMode]);

  // 밀집도 / 3D 모델 모드
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const overlay = adminNameOverlayRef.current;

    return runAdmin3DModeEffect({
      viewer,
      overlay,
      selectedAdmin1,
      admin3DMode,
      admin1SourceRef,
      admin2SourceRef,
      heritageSourceRef,
    });
  }, [selectedAdmin1, admin3DMode]);

  /**
   * 검색 결과를 3D에 마커 + 클러스터로 표시
   * - billboard 기반으로 entity clustering 사용
   * - 카메라 높이에 따라 클러스터 강도/ON-OFF 조절
   * - 클러스터 클릭: 다중 → 해당 영역 줌 인, 단일 → 상세 패널
   */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // 좌표 추출 (2D 로직과 동일)
    const extractCoord = (item) => {
      let coordinates = null;
      if (
        item.lat !== null &&
        item.lat !== undefined &&
        item.lon !== null &&
        item.lon !== undefined
      ) {
        coordinates = [Number(item.lon), Number(item.lat)];
      } else if (item.geom_json) {
        const geom = item.geom_json;
        if (geom.type === "Point") {
          coordinates = [geom.coordinates[0], geom.coordinates[1]];
        } else if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
          const coords =
            geom.type === "Polygon"
              ? geom.coordinates[0]
              : geom.coordinates[0][0];
          const centerLon =
            coords.reduce((sum, coord) => sum + coord[0], 0) / coords.length;
          const centerLat =
            coords.reduce((sum, coord) => sum + coord[1], 0) / coords.length;
          coordinates = [centerLon, centerLat];
        } else if (geom.type === "LineString" || geom.type === "MultiLineString") {
          const coords =
            geom.type === "LineString"
              ? geom.coordinates[0]
              : geom.coordinates[0][0];
          coordinates = [coords[0], coords[1]];
        }
      }
      return coordinates;
    };

    // 데이터소스 생성/획득
    let ds = searchResultDsRef.current;
    if (!ds) {
      ds = new Cesium.CustomDataSource("search-results");

      // 기본 클러스터 설정
      ds.clustering.enabled = true;
      ds.clustering.pixelRange = 32;
      ds.clustering.minimumClusterSize = 2;

      // 클러스터 스타일 설정
      ds.clustering.clusterEvent.addEventListener(
        (clusteredEntities, cluster) => {
          cluster.billboard.show = true;
          cluster.label.show = true;
          cluster.point.show = false;

          cluster.billboard.image = makeCircleDataUrl({
            size: 48,
            color: "rgba(59,130,246,0.95)",
            stroke: "rgba(12,53,112,0.9)",
          });
          cluster.billboard.width = 48;
          cluster.billboard.height = 48;
          cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
          cluster.billboard.disableDepthTestDistance =
            Number.POSITIVE_INFINITY;

          cluster.label.text = String(clusteredEntities.length);
          cluster.label.font =
            "700 14px 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
          cluster.label.fillColor = Cesium.Color.WHITE;
          cluster.label.outlineColor = Cesium.Color.BLACK;
          cluster.label.outlineWidth = 3;
          cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
          cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0);
          cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
          cluster.label.heightReference = Cesium.HeightReference.NONE;
        }
      );

      viewer.dataSources.add(ds);
      searchResultDsRef.current = ds;
    }

    // === 카메라 높이에 따라 클러스터 강도/ON-OFF 조절 ===
    const updateClusteringByCamera = () => {
      if (!viewer || !ds) return;
      const camera = viewer.scene.camera;
      const carto = camera.positionCartographic;
      const height = carto.height;

      if (height > 200000) {

        ds.clustering.enabled = true;
        ds.clustering.pixelRange = 40;
        ds.clustering.minimumClusterSize = 2;
      } else if (height > 80000) {

        ds.clustering.enabled = true;
        ds.clustering.pixelRange = 25;
        ds.clustering.minimumClusterSize = 2;
      } else {
        // 시/군·동 수준까지 내려오면: 클러스터 끔 → 개별 아이콘만
        ds.clustering.enabled = false;
      }
    };

    updateClusteringByCamera();
    const onCameraChanged = () => updateClusteringByCamera();
    viewer.camera.changed.addEventListener(onCameraChanged);

    ds.entities.removeAll();

    const markerImage = makeCircleDataUrl({
      size: 26,
      color: "rgba(255,123,0,0.95)",
      stroke: "rgba(255,255,255,0.9)",
    });

    const iconImageByType = (item) => {
      const t =
        item?.["종목명"] ||
        item?.["ccmaName"] ||
        item?.["종목"] ||
        item?.["type"] ||
        "";
      const s = String(t);
      if (s.includes("국보")) return "/icons/국보.svg";
      if (s.includes("보물")) return "/icons/보물.svg";
      if (s.includes("민속")) return "/icons/민속.svg";
      if (s.includes("사적")) return "/icons/사적.svg";
      return "/icons/보물.svg";
    };

    const maxResults = 500;
    const limited = searchResults.slice(0, maxResults);

    limited.forEach((item) => {
      const coord = extractCoord(item);
      if (!coord) return;
      const [lon, lat] = coord;
      const pos = Cesium.Cartesian3.fromDegrees(lon, lat);

      const name =
        item["국가유산명"] ||
        item["ccbaMnm1"] ||
        item["name"] ||
        item["title"] ||
        "문화유산";

      const ent = ds.entities.add({
        position: pos,
        billboard: {
          image: iconImageByType(item) || markerImage,
          width: 32,
          height: 32,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          show: false,
        },
        name,
      });

      ent.properties = item;
    });

    // 검색 결과 영역으로 카메라 이동
    if (limited.length > 0) {
      const positions = ds.entities.values
        .map(
          (e) =>
            e.position &&
            e.position.getValue &&
            e.position.getValue(viewer.clock.currentTime)
        )
        .filter(Boolean);
      if (positions.length > 0) {
        const bs = Cesium.BoundingSphere.fromPoints(positions);
        if (Cesium.defined(bs) && bs.radius > 0) {
          viewer.camera.flyToBoundingSphere(bs, {
            duration: 1.2,
            offset: new Cesium.HeadingPitchRange(
              0,
              Cesium.Math.toRadians(-50),
              bs.radius * 2.5
            ),
          });
        }
      }
    }

    // === 클릭 이벤트: 클러스터/단일 분기 ===
    let removeClickHandler = null;
    if (onSearchResultClick) {
      const handler = viewer.screenSpaceEventHandler;

      const clickCallback = (movement) => {
        const picked = viewer.scene.pick(movement.position);
        if (!Cesium.defined(picked) || !picked.id) return;

        const ent = picked.id;

        const isOriginalEntity = ds.entities.contains(ent);

        const clusterMembers =
          ent._clusteredEntities ||
          ent.clusteredEntities ||
          (ent.cluster && ent.cluster.clusteredEntities) ||
          null;

        if (clusterMembers && Array.isArray(clusterMembers) && clusterMembers.length > 1) {
          const positions = clusterMembers
            .map(
              (ce) =>
                ce.position &&
                ce.position.getValue &&
                ce.position.getValue(viewer.clock.currentTime)
            )
            .filter(Boolean);

          if (positions.length > 0) {
            const bs = Cesium.BoundingSphere.fromPoints(positions);
            if (Cesium.defined(bs) && bs.radius > 0) {
              const camera = viewer.camera;
              viewer.camera.flyToBoundingSphere(bs, {
                duration: 0.8,
                offset: new Cesium.HeadingPitchRange(
                  camera.heading,
                  camera.pitch,
                  bs.radius * 1.5
                ),
              });
            }
          }
          return;
        }

        if (clusterMembers && Array.isArray(clusterMembers) && clusterMembers.length === 1) {
          const single = clusterMembers[0];
          if (!single) return;
          const props = single.properties;
          if (!props) return;
          try {
            const item =
              typeof props.getValue === "function"
                ? props.getValue(viewer.clock.currentTime)
                : props;
            onSearchResultClick(item);
          } catch (e) {
            console.warn("[search-results single-cluster click] props 읽기 실패:", e);
          }
          return;
        }

        if (!isOriginalEntity) return;

        const props = ent.properties;
        if (!props) return;
        try {
          const item =
            typeof props.getValue === "function"
              ? props.getValue(viewer.clock.currentTime)
              : props;

          onSearchResultClick(item);
        } catch (e) {
          console.warn("[search-results click] props 읽기 실패:", e);
        }
      };

      handler.setInputAction(clickCallback, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      removeClickHandler = () => {
        handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
      };
    }

    return () => {
      if (removeClickHandler) removeClickHandler();
      viewer.camera.changed.removeEventListener(onCameraChanged);
    };
  }, [searchResults, onSearchResultClick]);

  /**
   * 외부에서 전달된 좌표로 카메라 이동 (검색 리스트 클릭 시 등)
   */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToLocation) return;

    const [lon, lat] = flyToLocation;
    const target = Cesium.Cartesian3.fromDegrees(lon, lat);
    const bs = new Cesium.BoundingSphere(target, 80); // 80m 반경

    viewer.camera.flyToBoundingSphere(bs, {
      duration: 1.0,
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-60),
        1200
      ),
    });
  }, [flyToLocation]);

  return <div ref={containerRef} style={style} />;
}

/**
 * 단순 원형 이미지 dataURL 생성 (billboard용)
 */
function makeCircleDataUrl({
  size = 32,
  color = "rgba(255,123,0,0.95)",
  stroke = "rgba(255,255,255,0.9)",
  strokeWidth = 2,
}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, (size - strokeWidth * 2) / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (strokeWidth > 0) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  return canvas.toDataURL();
}
