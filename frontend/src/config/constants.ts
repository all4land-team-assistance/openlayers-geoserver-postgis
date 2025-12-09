/**
 * 애플리케이션 설정 상수
 * 환경변수와 기본값을 관리하는 중앙 설정 파일
 */

// GeoServer 연결 설정
// CORS 문제를 피하기 위해 항상 로컬 프록시(/api/geoserver) 사용
// 백엔드 서버(backend/server.js)가 배포 서버로 프록시함
// 배포 서버: http://34.47.92.35/geoserver (백엔드 프록시를 통해 접근)
export const GEOSERVER_URL = import.meta.env.VITE_GEOSERVER_URL || "/api/geoserver";
export const WORKSPACE = import.meta.env.VITE_GEOSERVER_WORKSPACE || "sbsj";

// 시명 한글화 매핑 (이슈 #2 컨벤션 기반)
export const CITY_NAME_MAP: Record<string, string> = {
  Busan: "부산",
  Chungbuk: "충북",
  Chungnam: "충남",
  Daegu: "대구",
  Daejeon: "대전",
  Gangwon: "강원",
  Gwangju: "광주",
  Gyeongbuk: "경북",
  Gyeonggi: "경기",
  Gyeongnam: "경남",
  Incheon: "인천",
  Jeju: "제주",
  Jeonbuk: "전북",
  Jeonnam: "전남",
  Sejong: "세종",
  Seoul: "서울",
  Ulsan: "울산",
};

// 카테고리 한글화 매핑 (이슈 #2 컨벤션 기반)
export const CATEGORY_MAP: Record<string, string> = {
  Bomul: "보물",
  Treasure: "보물", // 레이어 이름에 Treasure 사용
  Folk: "민속",
  Kookbo: "국보",
  Sajeok: "사적",
};

// 레이어 그룹 이름 한국어 매핑
export const LAYER_GROUP_NAME_MAP: Record<string, string> = {
  Kookbo_Group: "국보",
  Treasure_Group: "보물",
  Folk_Group: "민속",
  Sajeok_Group: "사적",
};

// 표시할 레이어 그룹 목록 (한국어 이름)
export const TARGET_LAYER_GROUPS = ["국보", "민속", "사적", "보물"];

// 지도 초기 설정
export const MAP_CONFIG = {
  center: [126.978, 37.5665] as [number, number], // 서울 중심 좌표 (경도, 위도)
  zoom: 8, // 초기 줌 레벨
};

// 레이어 기본 스타일 (모든 레이어에 적용)
export const LAYER_STYLE = {
  fill: "rgba(100, 149, 237, 0.3)", // 반투명 파란색
  stroke: "#4169E1", // 파란색 테두리
  strokeWidth: 1.5,
} as const;

// 마우스 호버 시 하이라이트 스타일
export const STYLES = {
  highlight: {
    fill: "rgba(255, 255, 0, 0.6)", // 반투명 노란색
    stroke: "yellow", // 노란색 테두리
    strokeWidth: 3, // 테두리 두께
  },
} as const;
