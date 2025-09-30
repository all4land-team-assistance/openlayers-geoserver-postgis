/**
 * 지도 범례 컴포넌트
 * 각 행정구역별 색상을 표시하는 범례 UI
 */
import React from "react";
import { REGION_CONFIGS } from "../config/constants";

const MapLegend: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        top: "20px",
        left: "20px",
        zIndex: 1000, // 다른 요소들 위에 표시
        display: "flex",
        gap: "15px",
        flexWrap: "wrap",
        padding: "10px 15px",
        backgroundColor: "rgba(248, 249, 250, 0.95)", // 반투명 배경
        borderRadius: "8px",
        border: "1px solid #e9ecef",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)", // 그림자 효과
      }}
    >
      {/* 각 행정구역별 색상 표시 */}
      {Object.values(REGION_CONFIGS).map((config) => (
        <div
          key={config.name}
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          {/* 색상 표시 박스 */}
          <div
            style={{
              width: "16px",
              height: "16px",
              backgroundColor: config.color.fill,
              border: `2px solid ${config.color.stroke}`,
              borderRadius: "3px",
            }}
          />
          {/* 행정구역 이름 */}
          <span
            style={{ fontSize: "12px", fontWeight: "500", color: "#495057" }}
          >
            {config.displayName}
          </span>
        </div>
      ))}
    </div>
  );
};

export default MapLegend;
