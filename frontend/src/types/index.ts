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

// 레이어 패널 Props
export interface LayerPanelProps {
  isOpen: boolean;
  layers: LayerInfo[];
  visibleLayers: Set<string>;
  onToggleLayer: (layerName: string) => void;
  onClose: () => void;
}

// 맵 컨트롤 Props
export interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleLayerPanel: () => void;
}

// 검색 패널 Props
export interface SearchPanelProps {
  onSearch?: (searchParams: SearchParams) => void;
}

// 맵 인스턴스 및 레이어 맵
export type VectorLayerMap = Map<string, VectorLayer<VectorSource>>;

