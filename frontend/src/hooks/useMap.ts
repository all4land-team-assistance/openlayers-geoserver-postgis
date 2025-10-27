/**
 * OpenLayers 맵 인스턴스 관리 커스텀 훅
 */
import { useRef, useCallback } from "react";
import OLMap from "ol/Map";
import type { FeatureLike } from "ol/Feature";

export const useMap = () => {
  const mapInstanceRef = useRef<OLMap | null>(null);
  const highlightedFeatureRef = useRef<FeatureLike | null>(null);

  const handleZoomIn = useCallback(() => {
    if (mapInstanceRef.current) {
      const view = mapInstanceRef.current.getView();
      const currentZoom = view.getZoom();
      if (currentZoom !== undefined) {
        view.animate({
          zoom: currentZoom + 1,
          duration: 250,
        });
      }
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mapInstanceRef.current) {
      const view = mapInstanceRef.current.getView();
      const currentZoom = view.getZoom();
      if (currentZoom !== undefined) {
        view.animate({
          zoom: currentZoom - 1,
          duration: 250,
        });
      }
    }
  }, []);

  return {
    mapInstanceRef,
    highlightedFeatureRef,
    handleZoomIn,
    handleZoomOut,
  };
};

