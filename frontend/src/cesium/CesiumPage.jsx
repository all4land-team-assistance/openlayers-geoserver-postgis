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
 */
export default function CesiumPage({
  style = { width: "100%", height: "100%" },
  selectedAdmin1,
  admin3DMode, // "density" | "model" | null
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const admin1SourceRef = useRef(null); // kr_admin1 광역
  const admin2SourceRef = useRef(null); // kr_admin2 시군구
  const heritageSourceRef = useRef(null); // Heritage_ALL
  const adminNameOverlayRef = useRef(null); // DOM 말풍선(광역 / 클릭용)

  // Viewer 초기화
  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return;

    // cesium ion token 설정
    // Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

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
    // 기본 폰트 35px, 포인트/작은 지역은 show(..., 글자크기)로 조절
    adminNameOverlayRef.current = createAdminNameOverlay(viewer, 35);

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

  return <div ref={containerRef} style={style} />;
}
