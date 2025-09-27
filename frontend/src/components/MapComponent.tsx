/**
 * 메인 지도 컴포넌트
 * OpenLayers를 사용하여 한국 행정구역 지도를 표시하고 호버 효과를 제공
 */
import React, { useEffect, useRef } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Fill, Stroke } from "ol/style";
import { defaults as defaultControls } from "ol/control";
import MapLegend from "./MapLegend";
import MapInstructions from "./MapInstructions";
import {
  GEOSERVER_URL,
  WORKSPACE,
  REGION_CONFIGS,
  STYLES,
} from "../config/constants";

const MapComponent: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const highlightedFeatureRef = useRef<any>(null); // 현재 하이라이트된 피처 추적

  useEffect(() => {
    if (!mapRef.current) return;

    // 기본 배경 지도 레이어 (OpenStreetMap)
    const osmLayer = new TileLayer({
      source: new OSM(),
    });

    // 서울 행정구역 벡터 레이어 (WFS를 통해 GeoServer에서 데이터 로드)
    const seoulVectorSource = new VectorSource({
      url: `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${WORKSPACE}:seoul_districts&outputFormat=application/json`,
      format: new GeoJSON(),
    });

    const seoulVectorLayer = new VectorLayer({
      source: seoulVectorSource,
      style: new Style({
        fill: new Fill({ color: REGION_CONFIGS.seoul.color.fill }),
        stroke: new Stroke({
          color: REGION_CONFIGS.seoul.color.stroke,
          width: 2,
        }),
      }),
    });

    // 인천 행정구역 벡터 레이어
    const incheonVectorSource = new VectorSource({
      url: `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${WORKSPACE}:incheon_districts&outputFormat=application/json`,
      format: new GeoJSON(),
    });

    const incheonVectorLayer = new VectorLayer({
      source: incheonVectorSource,
      style: new Style({
        fill: new Fill({ color: REGION_CONFIGS.incheon.color.fill }),
        stroke: new Stroke({
          color: REGION_CONFIGS.incheon.color.stroke,
          width: 2,
        }),
      }),
    });

    // 경기도 행정구역 벡터 레이어
    const gyeonggiVectorSource = new VectorSource({
      url: `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=${WORKSPACE}:gyeonggi_districts&outputFormat=application/json`,
      format: new GeoJSON(),
    });

    const gyeonggiVectorLayer = new VectorLayer({
      source: gyeonggiVectorSource,
      style: new Style({
        fill: new Fill({ color: REGION_CONFIGS.gyeonggi.color.fill }),
        stroke: new Stroke({
          color: REGION_CONFIGS.gyeonggi.color.stroke,
          width: 2,
        }),
      }),
    });

    // OpenLayers 지도 인스턴스 생성 및 설정
    const map = new Map({
      target: mapRef.current,
      layers: [
        osmLayer, // 배경 지도 (OpenStreetMap)
        gyeonggiVectorLayer, // 경기도 (파란색)
        incheonVectorLayer, // 인천 (초록색)
        seoulVectorLayer, // 서울 (빨간색)
      ],
      view: new View({
        center: fromLonLat([126.978, 37.5665]), // 서울 중심 좌표로 변환
        zoom: 8, // 초기 줌 레벨
      }),
      controls: defaultControls({
        attribution: false, // 저작권 표시 제거
        zoom: true, // 줌 컨트롤 유지
        fullScreen: false, // 전체화면 버튼 제거
        rotate: false, // 회전 컨트롤 제거
        mouseWheelZoom: true, // 마우스 휠 줌 허용
      }),
    });

    mapInstanceRef.current = map;

    // 마우스 호버 이벤트 핸들러 - 행정구역에 마우스를 올리면 하이라이트
    const handlePointerMove = (event: any) => {
      const features = map.getFeaturesAtPixel(event.pixel);

      if (features.length > 0) {
        const feature = features[0]; // 첫 번째 피처 선택

        // 이전에 하이라이트된 피처가 다르다면 원래 스타일로 복원
        if (
          highlightedFeatureRef.current &&
          highlightedFeatureRef.current !== feature
        ) {
          highlightedFeatureRef.current.setStyle(undefined);
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
          feature.setStyle(highlightStyle);
          highlightedFeatureRef.current = feature;

          console.log("호버된 피처:", feature.getProperties()); // 디버깅용 로그
        }
      } else {
        // 피처가 없으면 하이라이트 제거
        if (highlightedFeatureRef.current) {
          highlightedFeatureRef.current.setStyle(undefined);
          highlightedFeatureRef.current = null;
        }
      }
    };

    // 마우스 이동 이벤트 리스너 등록
    map.on("pointermove", handlePointerMove);

    // 각 레이어 데이터 로딩 완료 이벤트 (디버깅용)
    seoulVectorSource.on("featuresloadend", () => {
      console.log("서울 데이터 로딩 완료");
    });

    incheonVectorSource.on("featuresloadend", () => {
      console.log("인천 데이터 로딩 완료");
    });

    gyeonggiVectorSource.on("featuresloadend", () => {
      console.log("경기도 데이터 로딩 완료");
    });

    // 에러 핸들링
    [seoulVectorSource, incheonVectorSource, gyeonggiVectorSource].forEach(
      (source) => {
        source.on("featuresloaderror", (event) => {
          console.error("GeoServer 데이터 로딩 실패:", event);
        });
      }
    );

    // 클린업
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
      }
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "relative",
      }}
    >
      <MapLegend />

      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "100%",
          flex: 1,
        }}
      />

      <MapInstructions />
    </div>
  );
};

export default MapComponent;
