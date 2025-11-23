// src/cesium/CesiumPage.jsx
import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

export default function CesiumPage({ style = { width: "100%", height: "100%" } }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return;

    const osm = new Cesium.OpenStreetMapImageryProvider({
        url : 'https://tile.openstreetmap.org/'
    });

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

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(126.978, 37.5665, 600000.0),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-90.0),
        roll: 0,
      },
    });

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} style={style} />;
}
