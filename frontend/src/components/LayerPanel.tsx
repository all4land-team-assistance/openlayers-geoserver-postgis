/**
 * 레이어 토글 패널 컴포넌트
 * 유형별/소재지별 탭으로 레이어를 분류하여 표시
 */
import React, { useState } from "react";
import type { LayerPanelProps, LayerCategory } from "../types";
import styles from "./LayerPanel.module.css";
import commonStyles from "../styles/common.module.css";

const LayerPanel: React.FC<LayerPanelProps> = ({
  isOpen,
  typeLayers,
  locationLayers,
  visibleLayers,
  onToggleLayer,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<LayerCategory>("type");

  if (!isOpen) return null;

  const currentLayers = activeTab === "type" ? typeLayers : locationLayers;

  return (
    <>
      {/* 배경 오버레이 */}
      <div onClick={onClose} className={styles.overlay} />

      {/* 레이어 패널 */}
      <div className={`${commonStyles.glassmorphism} ${commonStyles.panel} ${styles.panel}`}>
        {/* 제목 */}
        <div className={styles.header}>
          <h3 className={commonStyles.panelTitle}>
            🗺️ 레이어 목록
          </h3>
          <button onClick={onClose} className={styles.closeButton}>
            ✕
          </button>
        </div>

        {/* 탭 버튼 */}
        <div className={styles.tabContainer}>
          <button
            className={`${styles.tabButton} ${activeTab === "type" ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab("type")}
          >
            유형별
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === "location" ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab("location")}
          >
            소재지별
          </button>
        </div>

        {/* 레이어 목록 */}
        {currentLayers.length === 0 ? (
          <div className={styles.emptyState}>
            레이어를 불러오는 중...
          </div>
        ) : (
          <div className={styles.layerList}>
            {currentLayers.map((layer) => {
              const isVisible = visibleLayers.has(layer.name);
              return (
                <label
                  key={layer.name}
                  className={`${styles.layerItem} ${isVisible ? styles.active : ""}`}
                >
                  {/* 체크박스 */}
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => onToggleLayer(layer.name)}
                    className={styles.checkbox}
                  />

                  {/* 색상 표시 */}
                  <div
                    className={styles.colorIndicator}
                    style={{ backgroundColor: layer.color }}
                  />

                  {/* 레이어 이름 */}
                  <span className={styles.layerName}>
                    {layer.displayName}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {/* 안내 문구 */}
        <div className={commonStyles.infoBox}>
          💡 레이어를 선택하여 지도에 표시하거나 숨길 수 있습니다
        </div>
      </div>
    </>
  );
};

export default React.memo(LayerPanel);
