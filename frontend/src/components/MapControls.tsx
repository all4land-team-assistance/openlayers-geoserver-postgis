/**
 * 우측 지도 컨트롤 패널 컴포넌트
 * 줌 인/아웃 버튼 및 레이어 토글 버튼 제공
 */
import React from "react";
import type { MapControlsProps } from "../types";
import styles from "./MapControls.module.css";
import commonStyles from "../styles/common.module.css";

const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onToggleLayerPanel,
}) => {
  return (
    <div className={styles.container}>
      {/* 레이어 토글 버튼 */}
      <button
        onClick={onToggleLayerPanel}
        className={`${commonStyles.glassmorphism} ${commonStyles.controlButton}`}
        title="레이어 목록"
        style={{ fontSize: "18px" }}
      >
        ☰
      </button>

      {/* 줌 인 버튼 */}
      <button
        onClick={onZoomIn}
        className={`${commonStyles.glassmorphism} ${commonStyles.controlButton}`}
        title="확대"
      >
        +
      </button>

      {/* 줌 아웃 버튼 */}
      <button
        onClick={onZoomOut}
        className={`${commonStyles.glassmorphism} ${commonStyles.controlButton}`}
        title="축소"
      >
        −
      </button>
    </div>
  );
};

export default React.memo(MapControls);
