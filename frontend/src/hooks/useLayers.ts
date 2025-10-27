/**
 * 레이어 관리 커스텀 훅
 */
import { useRef } from "react";
import type { VectorLayerMap } from "../types";

export const useLayers = () => {
  const layersMapRef = useRef<VectorLayerMap>(
    new Map()
  );

  return {
    layersMapRef,
  };
};

