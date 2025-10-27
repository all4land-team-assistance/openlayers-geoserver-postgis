/**
 * 좌측 검색 필터 패널 컴포넌트
 * 국가유산명, 소재지 등으로 필터링할 수 있는 검색 패널
 */
import React, { useState } from "react";
import type { SearchPanelProps } from "../types";
import styles from "./SearchPanel.module.css";
import commonStyles from "../styles/common.module.css";

const SearchPanel: React.FC<SearchPanelProps> = ({ onSearch }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [searchLocation, setSearchLocation] = useState("");

  const handleSearch = () => {
    if (onSearch) {
      onSearch({ name: searchName, location: searchLocation });
    }
    console.log("검색:", { name: searchName, location: searchLocation });
  };

  const handleReset = () => {
    setSearchName("");
    setSearchLocation("");
  };

  return (
    <>
      {/* 패널 토글 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${commonStyles.glassmorphism} ${styles.toggleButton}`}
        style={{ left: isOpen ? "340px" : "20px" }}
      >
        {isOpen ? "◀" : "▶"}
      </button>

      {/* 검색 패널 */}
      <div
        className={`${commonStyles.glassmorphism} ${commonStyles.panel} ${styles.panel}`}
        style={{ left: isOpen ? "20px" : "-320px" }}
      >
        {/* 제목 */}
        <h3 className={commonStyles.panelTitle}>
          🔍 검색 필터
        </h3>

        {/* 국가유산명 검색 */}
        <div className={styles.formGroup}>
          <label className={commonStyles.formLabel}>
            국가유산명
          </label>
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="예: 경복궁, 숭례문..."
            className={commonStyles.inputField}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#3b82f6";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(59, 130, 246, 0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* 소재지 검색 */}
        <div style={{ marginBottom: "24px" }}>
          <label className={commonStyles.formLabel}>
            소재지
          </label>
          <select
            value={searchLocation}
            onChange={(e) => setSearchLocation(e.target.value)}
            className={`${styles.select} ${commonStyles.inputField}`}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#3b82f6";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(59, 130, 246, 0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <option value="">전체</option>
            <option value="서울">서울특별시</option>
            <option value="인천">인천광역시</option>
            <option value="경기">경기도</option>
          </select>
        </div>

        {/* 버튼 그룹 */}
        <div className={commonStyles.buttonGroup}>
          <button onClick={handleSearch} className={commonStyles.primaryButton}>
            검색
          </button>
          <button onClick={handleReset} className={commonStyles.secondaryButton}>
            초기화
          </button>
        </div>

        {/* 안내 문구 */}
        <div className={commonStyles.infoBox}>
          💡 검색 조건을 입력하고 검색 버튼을 클릭하세요
        </div>
      </div>
    </>
  );
};

export default React.memo(SearchPanel);
