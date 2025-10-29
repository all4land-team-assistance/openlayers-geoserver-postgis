/**
 * OpenLayers 맵 인스턴스 관리 커스텀 훅
 */
import { useRef } from "react";
import OLMap from "ol/Map";
import type { FeatureLike } from "ol/Feature";

export const useMap = () => {
  const mapInstanceRef = useRef<OLMap | null>(null);
  const highlightedFeatureRef = useRef<FeatureLike | null>(null);

  return {
    mapInstanceRef,
    highlightedFeatureRef,
  };
};
