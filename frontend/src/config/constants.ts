/**
 * 애플리케이션 설정 상수
 * 환경변수와 기본값을 관리하는 중앙 설정 파일
 */

// GeoServer 연결 설정
export const GEOSERVER_URL =
  import.meta.env.VITE_GEOSERVER_URL || "http://localhost:8080/geoserver";
export const WORKSPACE = "korea"; // GeoServer 워크스페이스명

// 지도 초기 설정
export const MAP_CONFIG = {
  center: [126.978, 37.5665] as [number, number], // 서울 중심 좌표 (경도, 위도)
  zoom: 8, // 초기 줌 레벨
};

// 각 행정구역별 레이어 및 스타일 설정
export const REGION_CONFIGS = {
  seoul: {
    name: "seoul",
    layerName: "seoul_districts", // GeoServer 레이어명
    color: {
      fill: "rgba(255, 0, 0, 0.3)", // 반투명 빨간색 채우기
      stroke: "red", // 빨간색 테두리
    },
    displayName: "서울",
  },
  incheon: {
    name: "incheon",
    layerName: "incheon_districts",
    color: {
      fill: "rgba(0, 255, 0, 0.3)", // 반투명 초록색 채우기
      stroke: "green",
    },
    displayName: "인천",
  },
  gyeonggi: {
    name: "gyeonggi",
    layerName: "gyeonggi_districts",
    color: {
      fill: "rgba(0, 0, 255, 0.3)", // 반투명 파란색 채우기
      stroke: "blue",
    },
    displayName: "경기도",
  },
} as const;

// 마우스 호버 시 하이라이트 스타일
export const STYLES = {
  highlight: {
    fill: "rgba(255, 255, 0, 0.6)", // 반투명 노란색 채우기
    stroke: "yellow", // 노란색 테두리
    strokeWidth: 3, // 테두리 두께
  },
} as const;
