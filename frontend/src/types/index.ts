/**
 * 전역 타입 정의
 */

import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";

// 레이어 정보
export interface LayerInfo {
  name: string;
  displayName: string;
  color: string;
}

// 검색 파라미터
export interface SearchParams {
  name: string;
  location: string;
}

// 레이어 패널 카테고리 타입
export type LayerCategory = "type" | "location";

// 레이어 패널 Props
export interface LayerPanelProps {
  isOpen: boolean;
  typeLayers: LayerInfo[]; // 유형별 레이어 (국보, 민속, 사적, 보물)
  locationLayers: LayerInfo[]; // 소재지별 레이어 (서울, 부산, 경기 등)
  visibleLayers: Set<string>;
  onToggleLayer: (layerName: string) => void;
  onClose: () => void;
}

// GeoJSON 형식
export interface GeoJSONGeometry {
  type: "Point" | "Polygon" | "MultiPolygon" | "LineString" | "MultiLineString";
  coordinates: any;
}

// 검색 결과 아이템
export interface SearchResultItem {
  [key: string]: any;
  source_table: string;
  국가유산명?: string;
  geom_json?: GeoJSONGeometry;
  lat?: number | null; // POINT의 위도 (ST_Y)
  lon?: number | null; // POINT의 경도 (ST_X)
}

// 검색 결과
export interface SearchResults {
  results: SearchResultItem[];
  total: number;
}

// 지도 모드
export type MapMode = "2d" | "3d";

// 검색 패널 Props
export interface SearchPanelProps {
  onSearch?: (searchParams: SearchParams) => void;
  onLocationClick?: (coordinates: [number, number]) => void;
  onSearchResults?: (results: SearchResultItem[]) => void;
  mapMode?: MapMode;
  onChangeMapMode?: (mode: MapMode) => void;
  admin1Options?: string[];
  selectedAdmin1?: string | null;
  onChangeAdmin1?: (value: string | null) => void;
}

// 맵 인스턴스 및 레이어 맵
export type VectorLayerMap = Map<string, VectorLayer<VectorSource>>;
