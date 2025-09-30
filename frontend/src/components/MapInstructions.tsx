/**
 * 지도 사용법 안내 컴포넌트
 * 사용자에게 지도 조작 방법과 GeoServer 정보를 제공
 */
import React from "react";
import { GEOSERVER_URL } from "../config/constants";

const MapInstructions: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "20px",
        left: "20px",
        right: "20px",
        zIndex: 1000, // 다른 요소들 위에 표시
        fontSize: "12px",
        color: "#666",
        padding: "10px 15px",
        backgroundColor: "rgba(248, 249, 250, 0.95)", // 반투명 배경
        borderRadius: "8px",
        border: "1px solid #e9ecef",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)", // 그림자 효과
      }}
    >
      <div>
        {/* 사용법 안내 */}
        <p style={{ margin: "0 0 5px 0", fontWeight: "600" }}>
          사용법: 행정구역에 마우스를 올리면 노란색으로 하이라이트됩니다
        </p>
        {/* GeoServer 연결 정보 */}
        <p style={{ margin: "0", fontSize: "11px" }}>
          GeoServer:{" "}
          <a
            href={GEOSERVER_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#007bff", textDecoration: "none" }}
          >
            {GEOSERVER_URL}
          </a>
        </p>
      </div>
    </div>
  );
};

export default MapInstructions;
