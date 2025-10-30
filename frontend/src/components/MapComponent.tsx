/**
 * 메인 지도 컴포넌트
 * OpenLayers를 사용하여 한국 행정구역 지도를 표시하고 호버 효과를 제공
 */
import React, { useEffect, useRef, useState } from "react";
import OLMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Fill, Stroke } from "ol/style";
import { Zoom } from "ol/control";
import SearchPanel from "./SearchPanel";
import LayerPanel from "./LayerPanel";
import {
  GEOSERVER_URL,
  WORKSPACE,
  STYLES,
  LAYER_STYLE,
} from "../config/constants";
import { useMap } from "../hooks/useMap";
import { useLayers } from "../hooks/useLayers";
import type { LayerInfo } from "../types";

const MapComponent: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const { mapInstanceRef, highlightedFeatureRef } = useMap();
  const { layersMapRef } = useLayers();
  const isMapInitialized = useRef(false); // 맵 초기화 플래그

  // 레이어 패널 상태
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [availableLayers, setAvailableLayers] = useState<LayerInfo[]>([]);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());

  // 레이어 패널 토글 핸들러
  const handleToggleLayerPanel = () => {
    setIsLayerPanelOpen(!isLayerPanelOpen);
  };

  // 레이어 표시/숨김 토글 핸들러
  const handleToggleLayer = (layerName: string) => {
    const layer = layersMapRef.current.get(layerName);
    if (!layer) {
      console.error("❌ 레이어를 찾을 수 없습니다:", layerName);
      return;
    }

    const newVisibleLayers = new Set(visibleLayers);
    if (visibleLayers.has(layerName)) {
      newVisibleLayers.delete(layerName);
      layer.setVisible(false);
    } else {
      newVisibleLayers.add(layerName);
      layer.setVisible(true);

      // 강제로 맵 재렌더링 및 업데이트
      if (mapInstanceRef.current) {
        mapInstanceRef.current.updateSize();
        mapInstanceRef.current.renderSync();
      }
    }
    setVisibleLayers(newVisibleLayers);
  };

  // GeoServer에서 레이어 목록을 동적으로 가져오는 함수
  const fetchLayersFromGeoServer = async () => {
    try {
      const response = await fetch(
        `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`
      );
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "text/xml");

      // FeatureType 목록 추출
      const featureTypes = xml.getElementsByTagName("FeatureType");
      const layers: LayerInfo[] = [];

      for (let i = 0; i < featureTypes.length; i++) {
        const nameElement = featureTypes[i].getElementsByTagName("Name")[0];
        const titleElement = featureTypes[i].getElementsByTagName("Title")[0];

        if (nameElement && titleElement) {
          const fullName = nameElement.textContent || "";
          const title = titleElement.textContent || "";

          // workspace:layername 형식에서 layername만 추출
          const layerName = fullName.includes(":")
            ? fullName.split(":")[1]
            : fullName;

          layers.push({
            name: layerName,
            displayName: title || layerName,
            color: LAYER_STYLE.fill,
          });
        }
      }

      return layers;
    } catch (error) {
      console.error("GeoServer 레이어 목록 로딩 실패:", error);
      return [];
    }
  };

  useEffect(() => {
    if (!mapRef.current) return;

    // React Strict Mode로 인한 중복 실행 방지
    if (isMapInitialized.current) {
      return;
    }

    // 플래그를 즉시 설정하여 중복 실행 방지
    isMapInitialized.current = true;

    // layersMapRef 초기화
    layersMapRef.current.clear();

    const initMap = async () => {
      // 기본 배경 지도 레이어 (OpenStreetMap)
      const osmLayer = new TileLayer({
        source: new OSM(),
      });

      // GeoServer에서 레이어 목록 가져오기
      const layers = await fetchLayersFromGeoServer();

      if (layers.length === 0) {
        console.warn(
          "GeoServer에서 레이어를 찾을 수 없습니다. 배경 지도만 표시합니다."
        );
      }

      // 동적으로 벡터 레이어 생성
      const vectorLayers: VectorLayer<VectorSource>[] = [];

      if (layers.length > 0) {
        layers.forEach((layerInfo) => {
          const vectorSource = new VectorSource({
            url: `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${WORKSPACE}:${layerInfo.name}&outputFormat=application/json`,
            format: new GeoJSON({
              dataProjection: "EPSG:4326", // GeoServer에서 오는 데이터 좌표계
              featureProjection: "EPSG:3857", // OpenLayers 맵 좌표계
            }),
          });

          const vectorLayer = new VectorLayer({
            source: vectorSource,
            visible: false, // 초기에는 숨김 상태 (체크박스 선택 시에만 표시)
            style: new Style({
              fill: new Fill({ color: LAYER_STYLE.fill }),
              stroke: new Stroke({
                color: LAYER_STYLE.stroke,
                width: LAYER_STYLE.strokeWidth,
              }),
            }),
          });

          layersMapRef.current.set(layerInfo.name, vectorLayer);
          vectorLayers.push(vectorLayer);

          // 에러 핸들링
          vectorSource.on("featuresloaderror", (event) => {
            console.error(
              `❌ ${layerInfo.displayName} 데이터 로딩 실패:`,
              event
            );
          });
        });
      }

      // OpenLayers 지도 인스턴스 생성 및 설정
      const map = new OLMap({
        target: mapRef.current!,
        layers: [osmLayer, ...vectorLayers],
        view: new View({
          center: fromLonLat([126.978, 37.5665]), // 서울 중심 좌표로 변환
          zoom: 8, // 초기 줌 레벨
        }),
        controls: [
          new Zoom({
            target: "zoom-controls", // 커스텀 위치에 줌 컨트롤 추가
          }),
        ],
      });

      mapInstanceRef.current = map;

      // 레이어 목록 및 가시성 상태 초기화 (초기에는 아무 레이어도 표시하지 않음)
      setAvailableLayers(layers);
      setVisibleLayers(new Set()); // 빈 Set으로 초기화 (선택한 레이어만 표시)

      // 마우스 호버 이벤트 핸들러 - 행정구역에 마우스를 올리면 하이라이트
      const handlePointerMove = (event: { pixel: number[] }) => {
        const features = map.getFeaturesAtPixel(event.pixel);

        if (features.length > 0) {
          const feature = features[0]; // 첫 번째 피처 선택

          // 이전에 하이라이트된 피처가 다르다면 원래 스타일로 복원
          if (
            highlightedFeatureRef.current &&
            highlightedFeatureRef.current !== feature
          ) {
            if ("setStyle" in highlightedFeatureRef.current) {
              highlightedFeatureRef.current.setStyle(undefined);
            }
          }

          // 현재 피처가 이전과 다르다면 하이라이트 스타일 적용
          if (highlightedFeatureRef.current !== feature) {
            const highlightStyle = new Style({
              fill: new Fill({ color: STYLES.highlight.fill }),
              stroke: new Stroke({
                color: STYLES.highlight.stroke,
                width: STYLES.highlight.strokeWidth,
              }),
            });
            if ("setStyle" in feature) {
              feature.setStyle(highlightStyle);
            }
            highlightedFeatureRef.current = feature;
          }
        } else {
          // 피처가 없으면 하이라이트 제거
          if (highlightedFeatureRef.current) {
            if ("setStyle" in highlightedFeatureRef.current) {
              highlightedFeatureRef.current.setStyle(undefined);
            }
            highlightedFeatureRef.current = null;
          }
        }
      };

      // 마우스 이동 이벤트 리스너 등록
      map.on("pointermove", handlePointerMove);

      // 클린업
      return () => {
        isMapInitialized.current = false; // 플래그 리셋
        if (mapInstanceRef.current) {
          // 이벤트 리스너 제거
          mapInstanceRef.current.un("pointermove", handlePointerMove);
          // 모든 레이어 제거
          mapInstanceRef.current.getLayers().clear();
          // 모든 컨트롤 제거
          mapInstanceRef.current.getControls().clear();
          // 맵 타겟 해제
          mapInstanceRef.current.setTarget(undefined);
          mapInstanceRef.current = null;
        }
        // 레이어 맵도 초기화
        layersMapRef.current.clear();
      };
    };

    initMap();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
      }}
    >
      <SearchPanel />

      {/* OpenLayers 기본 줌 컨트롤 */}
      <div
        id="zoom-controls"
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          zIndex: 1000,
        }}
      />

      {/* 햄버거 버튼 (레이어 토글) */}
      <button
        onClick={handleToggleLayerPanel}
        style={{
          position: "absolute",
          top: "80px", // 줌 버튼 아래로
          right: "20px",
          zIndex: 1000,
          background: "rgba(255, 255, 255, 0.9)",
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "18px",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
        title="레이어 목록"
      >
        ☰
      </button>

      <LayerPanel
        isOpen={isLayerPanelOpen}
        layers={availableLayers}
        visibleLayers={visibleLayers}
        onToggleLayer={handleToggleLayer}
        onClose={() => setIsLayerPanelOpen(false)}
      />

      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "100%",
          flex: 1,
        }}
      />
    </div>
  );
};

export default MapComponent;
