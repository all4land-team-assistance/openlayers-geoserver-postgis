/**
 * 애플리케이션 설정 상수
 * 환경변수와 기본값을 관리하는 중앙 설정 파일
 */

// GeoServer 연결 설정
export const GEOSERVER_URL =
  import.meta.env.VITE_GEOSERVER_URL || "http://localhost:8080/geoserver";
export const WORKSPACE = "test"; // GeoServer 워크스페이스명

// 지도 초기 설정
export const MAP_CONFIG = {
  center: [126.978, 37.5665] as [number, number], // 서울 중심 좌표 (경도, 위도)
  zoom: 8, // 초기 줌 레벨
};

// 레이어 기본 스타일 (모든 레이어에 적용)
export const LAYER_STYLE = {
  fill: "rgba(100, 149, 237, 0.3)", // 반투명 파란색 채우기
  stroke: "#4169E1", // 파란색 테두리
  strokeWidth: 1.5,
} as const;

// 마우스 호버 시 하이라이트 스타일
export const STYLES = {
  highlight: {
    fill: "rgba(255, 255, 0, 0.6)", // 반투명 노란색 채우기
    stroke: "yellow", // 노란색 테두리
    strokeWidth: 3, // 테두리 두께
  },
} as const;
