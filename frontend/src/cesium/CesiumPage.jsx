import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { buildAdmin1WfsUrl } from "./services/WfsUtil";
import { styleAndFlyToAdmin1 } from "./core/adminHighlight";
import { createAdminNameOverlay } from "./hooks/useAdminNameOverlay";

export default function CesiumPage({
  style = { width: "100%", height: "100%" },
  selectedAdmin1,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const adminSourceRef = useRef(null);       // 하이라이트용 GeoJsonDataSource
  const adminNameOverlayRef = useRef(null);  // DOM 말풍선 오버레이

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return;

    const osm = new Cesium.OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
    });

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

    const viewer = new Cesium.Viewer(containerRef.current, {
      geocoder: false,              // 검색창
      homeButton: false,            // 집 모양 버튼
      sceneModePicker: false,       // 2D/3D 모든 변환
      baseLayerPicker: false,       // 베이스 맴 선택
      navigationHelpButton: false,  // 도움말 버튼
      timeline: false,              // 하단 타임라인 버튼
      animation: false,             // 애니메이션 컨롤러
      fullscreenButton: false,      // 전체 화면
      infoBox: false,               // 픽셀 정보 박스 제거
      selectionIndicator: false,    // 클릭 테두리 제거
      
      // 실제 월드 지형 terrain 활성화(rough data)
      // terrain: Cesium.Terrain.fromWorldTerrain(),

      // osm를 base로 할 경우 활성화
      // baseLayer: Cesium.ImageryLayer.fromProviderAsync(osm),
    });
    viewerRef.current = viewer;

    // 말풍선 레이어 초기화
    adminNameOverlayRef.current = createAdminNameOverlay(viewer);

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

      if (adminSourceRef.current) {
        v.dataSources.remove(adminSourceRef.current, true);
        adminSourceRef.current = null;
      }

      if (adminNameOverlayRef.current) {
        adminNameOverlayRef.current.clear();
        adminNameOverlayRef.current = null;
      }

      v.destroy();
      viewerRef.current = null;
    };
  }, []);

  // selectedAdmin1 변경 시, WFS 로딩 + 하이라이트 + DOM 라벨
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const overlay = adminNameOverlayRef.current;

    // 선택 해제되면 하이라이트/라벨 제거
    if (!selectedAdmin1) {
      if (adminSourceRef.current) {
        viewer.dataSources.remove(adminSourceRef.current, true);
        adminSourceRef.current = null;
      }
      overlay?.clear();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const url = buildAdmin1WfsUrl(selectedAdmin1);

        // GeoServer -> GeoJSON -> Cesium 엔티티
        const ds = await Cesium.GeoJsonDataSource.load(url, {
          clampToGround: false,
        });
        if (cancelled) return;

        // 이전 하이라이트 제거
        if (adminSourceRef.current) {
          viewer.dataSources.remove(adminSourceRef.current, true);
        }
        adminSourceRef.current = ds;
        viewer.dataSources.add(ds);

        // 폴리곤 extrude + 카메라 이동 + 중심 위치 계산
        const { labelPosition } = styleAndFlyToAdmin1({
          viewer,
          dataSource: ds,
          name: selectedAdmin1,
          extrudedHeight: 3000.0, // 강조 높이
          minAreaM2: 8_000_000, //최소 면적
        });

        // DOM 말풍선 표시 (글자만)
        if (labelPosition && overlay) {
          overlay.show(labelPosition, selectedAdmin1);
        }
      } catch (err) {
        console.error("Admin1 하이라이트 실패:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedAdmin1]);

  return <div ref={containerRef} style={style} />;
}
