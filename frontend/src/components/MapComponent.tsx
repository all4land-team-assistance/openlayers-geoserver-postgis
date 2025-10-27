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
import { defaults as defaultControls } from "ol/control";
import SearchPanel from "./SearchPanel";
import MapControls from "./MapControls";
import LayerPanel from "./LayerPanel";
import { GEOSERVER_URL, WORKSPACE, STYLES } from "../config/constants";
import { useMap } from "../hooks/useMap";
import { useLayers } from "../hooks/useLayers";
import type { LayerInfo } from "../types";

// LayerInfo 타입을 컴포넌트에 export
export type { LayerInfo };

const MapComponent: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const { mapInstanceRef, highlightedFeatureRef, handleZoomIn, handleZoomOut } = useMap();
  const { layersMapRef } = useLayers();

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
    if (layer) {
      const newVisibleLayers = new Set(visibleLayers);
      if (visibleLayers.has(layerName)) {
        newVisibleLayers.delete(layerName);
        layer.setVisible(false);
      } else {
        newVisibleLayers.add(layerName);
        layer.setVisible(true);
      }
      setVisibleLayers(newVisibleLayers);
    }
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
            color: "rgba(100, 149, 237, 0.3)",
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
            format: new GeoJSON(),
          });

          const vectorLayer = new VectorLayer({
            source: vectorSource,
            style: new Style({
              fill: new Fill({ color: layerInfo.color }),
              stroke: new Stroke({
                color: "#4169E1",
                width: 1.5,
              }),
            }),
          });

          layersMapRef.current.set(layerInfo.name, vectorLayer);
          vectorLayers.push(vectorLayer);

          // 에러 핸들링
          vectorSource.on("featuresloaderror", (event) => {
            console.error(`${layerInfo.displayName} 데이터 로딩 실패:`, event);
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
        controls: defaultControls({
          attribution: false, // 저작권 표시 제거
          zoom: false, // 줌 컨트롤 제거 (나중에 커스텀으로 추가 예정)
          rotate: false, // 회전 컨트롤 제거
        }),
      });

      mapInstanceRef.current = map;

      // 레이어 목록 및 가시성 상태 초기화
      setAvailableLayers(layers);
      setVisibleLayers(new Set(layers.map((l) => l.name)));

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

            console.log("호버된 피처:", feature.getProperties()); // 디버깅용 로그
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
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setTarget(undefined);
        }
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
      <MapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onToggleLayerPanel={handleToggleLayerPanel}
      />
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
