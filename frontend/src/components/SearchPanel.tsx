/**
 * 좌측 검색 필터 패널 컴포넌트
 * 국가유산명, 소재지 등으로 필터링할 수 있는 검색 패널
 */
import React, { useState } from "react";
import type { SearchPanelProps, SearchResultItem } from "../types";
import styles from "./SearchPanel.module.css";
import commonStyles from "../styles/common.module.css";

// 백엔드 API 베이스 URL은 Vite 환경변수로 설정 (없으면 기본 '/api')
// 예: VITE_API_BASE_URL="http://localhost:3000/api" 또는 "/api"
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const SearchPanel: React.FC<SearchPanelProps> = ({
  onSearch,
  onLocationClick,
  onSearchResults,
  mapMode = "2d",
  onChangeMapMode,
  admin1Options,
  selectedAdmin1,
  onChangeAdmin1,
  locationList = [],
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchName, setSearchName] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // 국가유산명 검색 함수
  const searchHeritageByName = async (keyword: string) => {
    setIsLoading(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/search/heritage?keyword=${encodeURIComponent(keyword)}`
      );

      if (!response.ok) {
        throw new Error("검색에 실패했습니다");
      }

      const data = await response.json();
      const results = data.results || [];
      setSearchResults(results);

      // 검색 결과를 MapComponent에 전달하여 지도에 마커로 표시
      if (onSearchResults) {
        onSearchResults(results);
      }
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "검색 중 오류가 발생했습니다"
      );
      setSearchResults([]);
      // 검색 실패 시 마커도 제거
      if (onSearchResults) {
        onSearchResults([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    const keyword = searchName.trim();

    // 검색어가 비어 있으면 결과/마커 초기화만 수행
    if (!keyword) {
      setSearchResults([]);
      setSearchError(null);
      setHasSearched(false);
      if (onSearchResults) {
        onSearchResults([]);
      }
    } else {
      // 검색 버튼 클릭 시에만 실제 검색 수행
      setHasSearched(true);
      searchHeritageByName(keyword);
    }

    if (onSearch) {
      onSearch({ name: searchName, location: searchLocation });
    }
  };

  const handleReset = () => {
    setSearchName("");
    setSearchLocation("");
    setSearchResults([]);
    setSearchError(null);
    setHasSearched(false);
    // 초기화 시 마커도 제거
    if (onSearchResults) {
      onSearchResults([]);
    }
  };

  // 검색 결과 클릭 핸들러 - geom에서 좌표 추출하여 지도 이동
  const handleResultClick = (item: SearchResultItem) => {
    if (!onLocationClick) return;

    let coordinates: [number, number] | null = null;

    // 방법 1: 직접 추출된 lat, lon 사용 (POINT의 경우)
    if (
      item.lat !== null &&
      item.lat !== undefined &&
      item.lon !== null &&
      item.lon !== undefined
    ) {
      // lat, lon은 POINT(위도, 경도) 형식이므로 [경도, 위도] 순서로 변환
      coordinates = [Number(item.lon), Number(item.lat)];
    }
    // 방법 2: geom_json에서 좌표 추출 (GeoJSON 형식)
    else if (item.geom_json) {
      const geomJson = item.geom_json;

      // GeoJSON 형식 처리
      if (geomJson.type === "Point") {
        // Point: [경도, 위도]
        coordinates = [geomJson.coordinates[0], geomJson.coordinates[1]];
      } else if (
        geomJson.type === "Polygon" ||
        geomJson.type === "MultiPolygon"
      ) {
        // Polygon/MultiPolygon: 첫 번째 좌표의 중심점 사용
        const coords =
          geomJson.type === "Polygon"
            ? geomJson.coordinates[0]
            : geomJson.coordinates[0][0];

        // 중심점 계산
        const centerLon =
          coords.reduce((sum: number, coord: number[]) => sum + coord[0], 0) /
          coords.length;
        const centerLat =
          coords.reduce((sum: number, coord: number[]) => sum + coord[1], 0) /
          coords.length;
        coordinates = [centerLon, centerLat];
      } else if (
        geomJson.type === "LineString" ||
        geomJson.type === "MultiLineString"
      ) {
        // LineString: 첫 번째 좌표 사용
        const coords =
          geomJson.type === "LineString"
            ? geomJson.coordinates[0]
            : geomJson.coordinates[0][0];
        coordinates = [coords[0], coords[1]];
      }
    }

    if (coordinates) {
      onLocationClick(coordinates);
    }
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
        <h3 className={commonStyles.panelTitle}>🔍 검색 필터</h3>

        {/* 국가유산명 검색 */}
        <div className={styles.formGroup}>
          <label className={commonStyles.formLabel}>국가유산명</label>
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
          <label className={commonStyles.formLabel}>소재지</label>
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
            {locationList.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>

        {/* 버튼 그룹 */}
        <div className={commonStyles.buttonGroup}>
          <button onClick={handleSearch} className={commonStyles.primaryButton}>
            검색
          </button>
          <button
            onClick={handleReset}
            className={commonStyles.secondaryButton}
          >
            초기화
          </button>
        </div>

        {/* 안내 문구 */}
        <div className={commonStyles.infoBox}>
          💡 국가유산명을 입력한 후 <strong>검색</strong> 버튼을 클릭하세요
        </div>

        {/* 검색 결과 리스트 */}
        {hasSearched && (
          <div className={styles.searchResultsContainer}>
            <h4 className={styles.resultsTitle}>
              검색 결과{" "}
              {searchResults.length > 0 && `(${searchResults.length}개)`}
            </h4>

            {isLoading && <div className={styles.loading}>검색 중...</div>}

            {searchError && <div className={styles.error}>{searchError}</div>}

            {!isLoading && !searchError && searchResults.length === 0 && (
              <div className={styles.noResults}>검색 결과가 없습니다</div>
            )}

            {!isLoading && !searchError && searchResults.length > 0 && (
              <div className={styles.resultsList}>
                {searchResults.map((item, index) => (
                  <div
                    key={index}
                    className={styles.resultItem}
                    onClick={() => handleResultClick(item)}
                    title={
                      item.geom_json ||
                      (item.lat !== null &&
                        item.lat !== undefined &&
                        item.lon !== null &&
                        item.lon !== undefined)
                        ? "클릭하여 지도에서 위치 확인"
                        : "위치 정보 없음"
                    }
                  >
                    {(() => {
                      const heritageName = item["국가유산명"] || "이름 없음";
                      const kind =
                        item["종목명"] ||
                        item["ccmaName"] ||
                        item["종목"] ||
                        "";
                      const sido =
                        item["시도명"] ||
                        item["sido"] ||
                        item["ccbaCtcdNm"] ||
                        "";
                      const sigungu =
                        item["시군구명"] ||
                        item["시군구"] ||
                        item["ccbaLctoNm"] ||
                        "";
                      const locationText = [sido, sigungu]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <>
                          <div className={styles.resultHeader}>
                            {/* 국가유산명 (좌측) */}
                            <span className={styles.heritageName}>
                              {heritageName}
                            </span>

                            {/* 종목명 (우측 상단 배지) */}
                            {kind && (
                              <span className={styles.tableName}>{kind}</span>
                            )}

                            {/* 위치 정보가 있는 경우 위치 아이콘 */}
                            {(item.geom_json ||
                              (item.lat !== null &&
                                item.lat !== undefined &&
                                item.lon !== null &&
                                item.lon !== undefined)) && (
                              <span className={styles.locationIcon}>📍</span>
                            )}
                          </div>

                          {/* 하단: 시도명 + 시군구명 */}
                          <div className={styles.resultDetails}>
                            <div className={styles.resultField}>
                              <span className={styles.fieldName}>위치</span>
                              <span className={styles.fieldValue}>
                                {locationText || "-"}
                              </span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2D / 3D 지도 토글 */}
        <div className={styles.mapToggleContainer}>
          <span className={styles.mapToggleLabel}>지도 모드</span>
          <div className={styles.mapToggleButtons}>
            <button
              type="button"
              className={`${styles.mapToggleButton} ${
                mapMode === "2d" ? styles.mapToggleButtonActive : ""
              }`}
              onClick={() => onChangeMapMode && onChangeMapMode("2d")}
            >
              2D
            </button>
            <button
              type="button"
              className={`${styles.mapToggleButton} ${
                mapMode === "3d" ? styles.mapToggleButtonActive : ""
              }`}
              onClick={() => onChangeMapMode && onChangeMapMode("3d")}
            >
              3D
            </button>
          </div>
        </div>
        {/* 3D 모드 전용 kr_admin1 선택 (광역 행정구역) */}
        {mapMode === "3d" && (
          <div className={styles.mapToggleContainer}>
            <div style={{ marginBottom: "24px" }}>
              <label className={commonStyles.formLabel}>3D 행정구역(광역)</label>
              <select
                value={selectedAdmin1 ?? ""}
                onChange={(e) =>
                  onChangeAdmin1 && onChangeAdmin1(e.target.value || null)
                }
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
                <option value="">행정구역 선택</option>
                {admin1Options?.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default React.memo(SearchPanel);
