/**
 * 메인 지도 컴포넌트
 * OpenLayers + GeoServer WFS
 * 포인트 클릭 → (목록→상세) → 좌측 패널 렌더 + 클러스터링 + 아이콘(줌 임계)
 */
import React, { useEffect, useRef, useState } from "react";
import OLMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import { fromLonLat, toLonLat } from "ol/proj";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Fill, Stroke } from "ol/style";
import { Zoom } from "ol/control";
import SearchPanel from "./SearchPanel";
import LayerPanel from "./LayerPanel";
import {
  GEOSERVER_URL,
  WORKSPACE,
  LAYER_STYLE,
  CITY_NAME_MAP,
} from "../config/constants";
import { useMap } from "../hooks/useMap";
import { useLayers } from "../hooks/useLayers";
import type { LayerInfo, SearchResultItem, MapMode } from "../types";
import Point from "ol/geom/Point";
import Feature from "ol/Feature";
import CircleStyle from "ol/style/Circle";
import Overlay from "ol/Overlay";
import CesiumPage from "../cesium/CesiumPage";

// 클러스터링/텍스트/아이콘
import Cluster from "ol/source/Cluster";
import Text from "ol/style/Text";
import Icon from "ol/style/Icon";

// 상세 API
import { findBestDetail, ctcdBySidoName, type Detail } from "../api/heritage";

// ---- 설정값 ----
const SCALE_CLUSTER = 18000; // 1:18,000보다 멀리서 보면 클러스터
const ICON_ZOOM_THRESHOLD = 10; // 줌 10 이상에서만 아이콘 표시
const ICON_SCALE = 0.1; // 아이콘 크기

// 스케일 계산 유틸
const DPI = 96;
const INCH_PER_M = 39.37;
function resolutionToScale(map: OLMap) {
  const res = map.getView().getResolution();
  if (res == null) return Infinity;
  const metersPerUnit = map.getView().getProjection().getMetersPerUnit() || 1;
  return res * metersPerUnit * DPI * INCH_PER_M;
}

// 문화재 유형 → 아이콘 파일 매핑
function getIconByType(rawType?: string): string {
  const t = String(rawType || "");
  if (t.includes("국보")) return "/icons/국보.svg";
  if (t.includes("보물")) return "/icons/보물.svg";
  if (t.includes("민속")) return "/icons/민속.svg";
  if (t.includes("사적")) return "/icons/사적.svg";
  return "/icons/보물.svg";
}

// <b> 태그만 제거 (내용은 유지)
function removeBoldTags(text?: string) {
  if (!text) return "";
  return text.replace(/<\/?b>/gi, "");
}

// 현재 줌 기준 단일 피처 스타일(아이콘/점 전환)
function makeSinglePointStyle(props: any, map?: OLMap): Style {
  const zoom = map?.getView().getZoom?.() ?? 0;

  if (zoom < ICON_ZOOM_THRESHOLD) {
    return new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: "#ff7b00" }),
        stroke: new Stroke({ color: "#fff", width: 2 }),
      }),
    });
  }

  const type =
    props["종목명"] ??
    props["ccmaName"] ??
    props["종목"] ??
    props["type"] ??
    "";
  const src = getIconByType(String(type));
  return new Style({
    image: new Icon({
      src,
      anchor: [0.5, 1],
      scale: ICON_SCALE,
      crossOrigin: "anonymous",
    }),
  });
}

const MapComponent: React.FC = () => {
  // 맵/레이어 레지스트리
  const mapRef = useRef<HTMLDivElement>(null);
  const { mapInstanceRef } = useMap();
  const { layersMapRef } = useLayers();
  const isMapInitialized = useRef(false);

  // 레이어 패널 상태
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [availableLayers, setAvailableLayers] = useState<LayerInfo[]>([]);

  // 레이어 목록에서 지역명 추출하여 소재지 목록 생성
  const getLocationListFromLayers = (layers: LayerInfo[]): string[] => {
    const regionSet = new Set<string>();

    layers.forEach((layer) => {
      // 레이어 이름에서 지역명 추출 (예: "Busan_Sajeok" -> "Busan")
      const parts = layer.name.split("_");
      if (parts.length >= 2) {
        const regionName = parts[0]; // Busan, Seoul, Chungbuk 등
        // 한글 변환 (CITY_NAME_MAP에 있으면 한글, 없으면 원본)
        const koreanName = CITY_NAME_MAP[regionName] || regionName;
        regionSet.add(koreanName);
      }
    });

    // 한글 이름으로 정렬
    return Array.from(regionSet).sort((a, b) => a.localeCompare(b, "ko"));
  };

  const [locationList, setLocationList] = useState<string[]>([]);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());

  // 지도 모드 (2D / 3D)
  const [mapMode, setMapMode] = useState<MapMode>("2d");

  // 좌측 상세 패널 상태
  const [selectedDetail, setSelectedDetail] = useState<Detail | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 3D 지도 선택 시 kr_admin1 name 항목 및 선택 항목 관리
  const [admin1Options, setAdmin1Options] = useState<string[]>([]);
  const [selectedAdmin1, setSelectedAdmin1] = useState<string | null>(null);

  // 검색 결과 레이어 관리
  const searchResultSourceRef = useRef<VectorSource | null>(null);
  const searchResultLayerRef =
    useRef<VectorLayer<VectorSource> | null>(null);

  const handleToggleLayerPanel = () => setIsLayerPanelOpen(!isLayerPanelOpen);

  // 패널 토글 시 :pin/:cluster 쌍을 함께 처리
  const handleToggleLayer = (layerName: string) => {
    const pin = layersMapRef.current.get(layerName + ":pin");
    const cluster = layersMapRef.current.get(layerName + ":cluster");
    const anyLayer = pin || cluster;
    if (!anyLayer) {
      console.error("레이어를 찾을 수 없습니다:", layerName);
      return;
    }

    const next = new Set(visibleLayers);
    const turnOn = !next.has(layerName);

    if (turnOn) {
      next.add(layerName);
      if (mapInstanceRef.current) {
        const useCluster =
          resolutionToScale(mapInstanceRef.current) > SCALE_CLUSTER;
        if (pin) pin.setVisible(!useCluster);
        if (cluster) cluster.setVisible(useCluster);
      } else {
        if (pin) pin.setVisible(true);
      }
    } else {
      next.delete(layerName);
      if (pin) pin.setVisible(false);
      if (cluster) cluster.setVisible(false);
    }
    setVisibleLayers(next);
    mapInstanceRef.current?.renderSync();
  };

  // GeoServer에서 레이어 목록 획득
  const fetchLayersFromGeoServer = async (): Promise<LayerInfo[]> => {
    try {
      const response = await fetch(
        `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`
      );
      const text = await response.text();
      const xml = new DOMParser().parseFromString(text, "text/xml");

      const featureTypes = xml.getElementsByTagName("FeatureType");
      const layers: LayerInfo[] = [];

      for (let i = 0; i < featureTypes.length; i++) {
        const nameElement = featureTypes[i].getElementsByTagName("Name")[0];
        const titleElement = featureTypes[i].getElementsByTagName("Title")[0];
        if (!nameElement) continue;

        const fullName = nameElement.textContent || ""; // 예: "sbsj:Busan_Kookbo"
        if (!fullName.startsWith(`${WORKSPACE}:`)) continue;

        const title = titleElement?.textContent || "";

        // "sbsj:Busan_Kookbo" → "Busan_Kookbo"
        const layerName = fullName.split(":")[1];

        layers.push({
          name: layerName, // Busan_Kookbo
          displayName: title || layerName,
          color: LAYER_STYLE.fill,
        });
      }

      return layers;
    } catch (e) {
      console.error("GeoServer 레이어 목록 로딩 실패:", e);
      return [];
    }
  };

  const fetchAdmin1Names = async (): Promise<string[]> => {
    try {
      const url =
        `${GEOSERVER_URL}/wfs` +
        `?service=WFS&version=1.1.0&request=GetFeature` +
        `&typeName=${WORKSPACE}:kr_admin1` +
        `&propertyName=name` +
        `&outputFormat=application/json` +
        `&srsName=EPSG:4326`;

      if (!res.ok) throw new Error("kr_admin1 WFS 요청 실패");
      const res = await fetch(url);

      const json = await res.json();
      const set = new Set<string>();

      for (const f of json.features ?? []) {
        const n = f.properties?.name;
        if (n) set.add(String(n));
      }

      return Array.from(set).sort();
    } catch (e) {
      return [];
      console.error("[fetchAdmin1Names] 실패:", e);
    }
  };
  const restoreViewRef = useRef<{ center: number[]; zoom: number } | null>(null);
  const isClosingRef = useRef(false);
  // 지도 튐 방지- 닫기 전에 저장하고 트랜지션 끝난 뒤 복원


    const map = mapInstanceRef.current;
  const closeDetailPanel = () => {
    if (map) {
      const view = map.getView();
        center: view.getCenter() ? [...view.getCenter()!] : fromLonLat([126.978, 37.5665]),
      restoreViewRef.current = {
        zoom: view.getZoom() ?? 8,
      };
      isClosingRef.current = true;
      view.cancelAnimations();
    }
  };
    setIsDetailPanelOpen(false);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (isDetailPanelOpen) {
      map.updateSize();
      const t = setTimeout(() => map.updateSize(), 260);
      return () => clearTimeout(t);
    }
  }, [isDetailPanelOpen]);

  useEffect(() => {
    if (!mapRef.current || isMapInitialized.current) return;
    isMapInitialized.current = true;

    layersMapRef.current.clear();

    const init = async () => {
      // 배경지도
      const osmLayer = new TileLayer({ source: new OSM() });

      // kr_admin1 name 목록
      const adminNames = await fetchAdmin1Names();
      setAdmin1Options(adminNames);

      // 레이어 목록
      const layers = await fetchLayersFromGeoServer();

      // 벡터/클러스터 레이어 구성
      const olLayers: VectorLayer<VectorSource | Cluster>[] = [];
      layers.forEach((layerInfo) => {
        const vectorSource = new VectorSource({
          url: `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${WORKSPACE}:${layerInfo.name}&outputFormat=application/json&srsName=EPSG:4326`,
          format: new GeoJSON({
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857",
          }),
        });

        // :pin 레이어 (포인트는 아이콘/점 전환)
        const pinLayer = new VectorLayer({
          source: vectorSource,
          visible: false,
          className: "heritage-pin",
          style: (feature) => {
            const g: any = feature.getGeometry?.();
            const t = g?.getType?.();
            if (t === "Point" || t === "MultiPoint") {
              const props = feature.getProperties?.() || {};
              return makeSinglePointStyle(
                props,
                mapInstanceRef.current || undefined
              );
            }
            // 라인/폴리곤
            return new Style({
              fill: new Fill({ color: "rgba(255,123,0,0.3)" }),
              stroke: new Stroke({ color: "#ff7b00", width: 2 }),
            });
          },
        });

        // cluster 레이어
        const clusterSource = new Cluster({ distance: 35, source: vectorSource });
        const clusterLayer = new VectorLayer({
          source: clusterSource,
          visible: false,
          className: "heritage-cluster",
          style: (feature) => {
            const members = feature.get("features") || [];
            const size = members.length;

            // 단일일 때도 줌에 따라 아이콘/점 전환
            if (size === 1) {
              const inner = members[0];
              const props = inner.getProperties?.() || {};
              return makeSinglePointStyle(
                props,
                mapInstanceRef.current || undefined
              );
            }

            // 다중 클러스터: 숫자 원형
            const r = Math.max(18, Math.min(44, 12 + Math.log(size) * 10));
            return new Style({
              image: new CircleStyle({
                radius: r,
                fill: new Fill({ color: "rgba(33,150,243,0.9)" }),
                stroke: new Stroke({ color: "#0b3d91", width: 2 }),
              }),
              text: new Text({
                text: String(size),
                font: "700 14px system-ui, -apple-system, Segoe UI, Roboto",
                fill: new Fill({ color: "#fff" }),
                stroke: new Stroke({ color: "rgba(0,0,0,0.35)", width: 3 }),
              }),
            });
          },
        });

        layersMapRef.current.set(layerInfo.name + ":pin", pinLayer);
        layersMapRef.current.set(layerInfo.name + ":cluster", clusterLayer);
        olLayers.push(clusterLayer, pinLayer);

        vectorSource.on("featuresloaderror", (e) => {
          console.error(`${layerInfo.displayName} 데이터 로딩 실패:`, e);
        });
      });

      // 검색 결과 레이어
      const searchResultSource = new VectorSource();
      const searchResultClusterSource = new Cluster({
        distance: 40,
        source: searchResultSource,
      });

      const searchResultLayer = new VectorLayer({
        source: searchResultClusterSource,
        visible: true,
        className: "search-results",
        style: (feature) => {
          const clusterFeatures = feature.get("features");
          const size = clusterFeatures?.length || 0;

          // 클러스터인 경우
          if (size > 1) {
            const r = Math.max(18, Math.min(44, 12 + Math.log(size) * 10));
            return new Style({
              image: new CircleStyle({
                radius: r,
                fill: new Fill({ color: "rgba(59, 130, 246, 0.9)" }),
                stroke: new Stroke({ color: "#1e40af", width: 2 }),
              }),
              text: new Text({
                text: String(size),
                font: "700 14px system-ui, -apple-system, Segoe UI, Roboto",
                fill: new Fill({ color: "#fff" }),
                stroke: new Stroke({
                  color: "rgba(0,0,0,0.35)",
                  width: 3,
                }),
              }),
            });
          }

          // 단일 마커인 경우
          const props = clusterFeatures?.[0]?.getProperties() || feature.getProperties();
          return makeSinglePointStyle( props, mapInstanceRef.current || undefined );
        },
      });
      searchResultSourceRef.current = searchResultSource;
      searchResultLayerRef.current = searchResultLayer;

      // 맵 생성
      const map = new OLMap({
        target: mapRef.current!,
        layers: [osmLayer, searchResultLayer, ...olLayers],
        view: new View({
          center: fromLonLat([126.978, 37.5665]),
          zoom: 8,
        }),
        controls: [new Zoom({ target: "zoom-controls" })],
      });
      mapInstanceRef.current = map;

      // 줌/스케일에 따른 클러스터 <-> 핀 전환
      const updateClusterVisibility = () => {
        const useCluster = resolutionToScale(map) > SCALE_CLUSTER;
        visibleLayers.forEach((baseName) => {
          const pin = layersMapRef.current.get(baseName + ":pin");
          const cluster = layersMapRef.current.get(baseName + ":cluster");
          if (pin) pin.setVisible(!useCluster);
          if (cluster) cluster.setVisible(useCluster);
        });
        map.renderSync();
      };
      map.getView().on("change:resolution", updateClusterVisibility);
      updateClusterVisibility();

      const handlePointerMove = (event: { pixel: number[] }) => {
        const features = map.getFeaturesAtPixel(event.pixel);
        const el = map.getTargetElement();
        if (el) el.style.cursor = features.length > 0 ? "pointer" : "";
      };
      map.on("pointermove", handlePointerMove);

      // 클릭 → 좌측 패널로 상세 표시
      const handleSingleClick = async (evt: any) => {
        let pickedFeature: any = null;
        let pickedLayer: any = null;

        map.forEachFeatureAtPixel(evt.pixel, (f: any, layer: any) => {
          if (layer?.getVisible?.()) {
            pickedFeature = f;
            pickedLayer = layer;
            return true;
          }
          return false;
        });

        if (!pickedFeature) return;

        // 클러스터 클릭 시 동작
        const layerClass = String( pickedLayer?.get("className") || pickedLayer?.getClassName?.() || "" );

        // 검색 결과 클러스터면 확대만
        if (layerClass.includes("search-results")) {
          const clusterFeatures = pickedFeature.get("features");
          if (clusterFeatures && clusterFeatures.length > 1) {
            const view = map.getView();
            view.animate({
              zoom: (view.getZoom() || 8) + 1.2,
              center: evt.coordinate,
              duration: 200,
            });
            return;
          }

          // 단일 마커인 경우 팝업 표시
          const actualFeature = clusterFeatures?.[0] || pickedFeature;
          const props = actualFeature.getProperties();
          const name = props["국가유산명"] || "이름 없음";
          const type = props["종목명"] || props["ccmaName"] || "";

          // 검색 결과 정보를 팝업으로 표시
          const html = `
            <div style="padding: 12px; max-width: 300px;">
              <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                ${name}
              </div>
              ${
                type
                  ? `<div style="color: #64748b; font-size: 14px; margin-bottom: 8px;">${type}</div>`
                  : ""
              }
              <button 
                data-action="close-card" 
                style="margin-top: 8px; padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;"
              >
                닫기
              </button>
            </div>
          `;
          setPopupHtml(html);
          overlayRef.current?.setPosition(evt.coordinate);
          return;
        }

        if (layerClass.includes("heritage-cluster")) {
          const members = pickedFeature.get("features") || [];
          if (members.length > 1) {
            const view = map.getView();
            view.animate({
              zoom: (view.getZoom() || 8) + 1.2,
              center: evt.coordinate,
              duration: 200,
            });
            return;
          }
          if (members.length === 1) pickedFeature = members[0];
        }

        // 상세 조회 파라미터
        const props = pickedFeature.getProperties();
        const kdcd = String( props["종목코드"] ?? props["ccbaKdcd"] ?? props["kdcd"] ?? "" );
        const sidoName = String( props["시도명"] ?? props["sido"] ?? props["ccbaCtcdNm"] ?? "" );
        const name = String( props["국가유산명"] ?? props["ccbaMnm1"] ?? props["name"] ?? "" );
        const ctcd = ctcdBySidoName[sidoName] ?? "";
        const [lon, lat] = toLonLat(evt.coordinate);

        setIsDetailPanelOpen(true);
        setDetailLoading(true);
        setDetailError(null);

        try {
          const d = await findBestDetail(kdcd, ctcd, name, [lon, lat]);
          setSelectedDetail(d);
        } catch (e: any) {
          setSelectedDetail(null);
          setDetailError(e?.message || "상세 조회 실패");
        } finally {
          setDetailLoading(false);
        }
      };
      map.on("singleclick", handleSingleClick);

      const onPointerDown = (e: any) => {
        // 빈 곳 클릭 시 패널 닫음
        if (!map.hasFeatureAtPixel(e.pixel as any)) {
          setIsDetailPanelOpen(false);
        }
      };
      map.on("pointerdown" as any, onPointerDown);

      setAvailableLayers(layers);

      // 레이어 목록에서 지역명 추출하여 소재지 목록 생성
      const locations = getLocationListFromLayers(layers);
      setLocationList(locations);
      setVisibleLayers(new Set());

      return () => {
        map.getView().un("change:resolution" as any, updateClusterVisibility);
        map.un("pointermove" as any, handlePointerMove);
        map.un("singleclick" as any, handleSingleClick);
        map.un("pointerdown" as any, onPointerDown);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.getLayers().clear();
          mapInstanceRef.current.getControls().clear();
          mapInstanceRef.current.setTarget(undefined);
          mapInstanceRef.current = null;
        }
        layersMapRef.current.clear();
        isMapInitialized.current = false;
      };
    };

    init();
  }, []);

  // 패널에서 토글될 때만 클러스터/핀 표시 상태 다시 계산
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const useCluster = resolutionToScale(map) > SCALE_CLUSTER;
    visibleLayers.forEach((baseName) => {
      const pin = layersMapRef.current.get(baseName + ":pin");
      const cluster = layersMapRef.current.get(baseName + ":cluster");
      if (pin) pin.setVisible(!useCluster);
      if (cluster) cluster.setVisible(useCluster);
    });
    map.renderSync();
  }, [visibleLayers, layersMapRef, mapInstanceRef]);

  // 검색 결과 클릭 시 지도 이동 및 마커 표시
  const handleLocationClick = (coordinates: [number, number]) => {
    if (!mapInstanceRef.current) return;
    const [lon, lat] = coordinates;
    const view = mapInstanceRef.current.getView();
    
    // 좌표를 OpenLayers 좌표계로 변환 (EPSG:3857)
    const center = fromLonLat([lon, lat]);
    
    // 지도 중심 이동 및 줌 조정
    view.animate({
      center: center,
      zoom: 15, // 적절한 줌 레벨로 설정
      duration: 1000, // 1초 애니메이션
    });
  };

  const handleSearchResults = (results: SearchResultItem[]) => {
    if (!searchResultSourceRef.current || !mapInstanceRef.current) return;
    searchResultSourceRef.current.clear();

    const maxResults = 500;
    const limitedResults = results.slice(0, maxResults);

    const features: Feature[] = [];
    limitedResults.forEach((item) => {
      try {
        let coordinates: [number, number] | null = null;

        if (
          item.lat !== null &&
          item.lat !== undefined &&
          item.lon !== null &&
          item.lon !== undefined
        ) {
          coordinates = [Number(item.lon), Number(item.lat)];
        } else if (item.geom_json) {
          const geomJson = item.geom_json;
          if (geomJson.type === "Point") {
            coordinates = [geomJson.coordinates[0], geomJson.coordinates[1]];
          } else if (
            geomJson.type === "Polygon" ||
            geomJson.type === "MultiPolygon"
          ) {
            const coords =
              geomJson.type === "Polygon"
                ? geomJson.coordinates[0]
                : geomJson.coordinates[0][0];
            const centerLon =
              coords.reduce(
                (sum: number, coord: number[]) => sum + coord[0],
                0
              ) / coords.length;
            const centerLat =
              coords.reduce(
                (sum: number, coord: number[]) => sum + coord[1],
                0
              ) / coords.length;
            coordinates = [centerLon, centerLat];
          }
        }

        if (coordinates) {
          const [lon, lat] = coordinates;
          const point = new Point(fromLonLat([lon, lat]));
          const feature = new Feature({
            geometry: point,
            ...item,
          });
          features.push(feature);
        }
      } catch (error) {
        console.error("검색 결과 마커 추가 실패:", error, item);
      }
    });

    if (features.length > 0) {
      searchResultSourceRef.current.addFeatures(features);
      setTimeout(() => mapInstanceRef.current?.renderSync(), 0);

      // 지도 업데이트는 한 번만
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.renderSync();
        }
      }, 0);
    }
  };

  return (
  // 전체 화면: 세로
  <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%" }}>
    
    {/* 본문 영역: 가로 */}
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      
      {/* 좌측 상세 패널 */}
      <div
        style={{
          width: isDetailPanelOpen ? 320 : 0,
          transition: "width 0.25s ease",
          overflow: "hidden",
          borderRight: isDetailPanelOpen ? "1px solid #e5e7eb" : "none",
          background: "#fff",
          color: "#000",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          flexShrink: 0
        }}
      >
        {/* 헤더(고정) */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0
          }}
        >
          <strong style={{ fontSize: 16 }}>상세 정보</strong>
          <button
            onClick={closeDetailPanel}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 20,
              cursor: "pointer",
              color: "#000",
              fontWeight: 700,
              lineHeight: 1
            }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
      }}
    >
      <SearchPanel
        onLocationClick={handleLocationClick}
        onSearchResults={handleSearchResults}
        mapMode={mapMode}
        locationList={locationList}
        onChangeMapMode={setMapMode}
      />

        {/* 본문(스크롤 영역) */}
        <div
          style={{
            padding: 14,
            overflowY: "auto",
            flex: 1,
            minHeight: 0
          }}
        >
          {detailLoading && (
            <div style={{ color: "#666", fontSize: 14 }}>
              상세 정보 불러오는 중…
            </div>
          )}

          {detailError && (
            <div style={{ color: "#c00", fontSize: 14 }}>
              상세 조회 실패: {detailError}
            </div>
          )}

          {!detailLoading && !detailError && !selectedDetail && (
            <div style={{ color: "#666", fontSize: 14 }}>
              지도에서 문화유산을 선택하세요.
            </div>
          )}

          {!detailLoading && !detailError && selectedDetail && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
                {selectedDetail.title}
              </div>
              <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
                {[selectedDetail.kind, selectedDetail.sido]
                  .filter(Boolean)
                  .join(" / ")}
              </div>

              {selectedDetail.image && (
                <img
                  src={selectedDetail.image}
                  alt=""
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    marginBottom: 10
                  }}
                />
              )}

              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-line"
                }}
              >
                {selectedDetail.desc || "상세 설명 없음"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽 지도 영역 */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <SearchPanel 
          onLocationClick={handleLocationClick} 
          onSearchResults={handleSearchResults}
          mapMode={mapMode}
          onChangeMapMode={setMapMode}
          admin1Options={admin1Options}
          selectedAdmin1={selectedAdmin1}
          onChangeAdmin1={setSelectedAdmin1}
        />

        <div
          id="zoom-controls"
          style={{ position: "absolute", top: "20px", right: "20px", zIndex: 1000 }}
        />

        <button
          onClick={handleToggleLayerPanel}
          style={{
            position: "absolute",
            top: "80px",
            right: "20px",
            zIndex: 1000,
            background: "rgba(255, 255, 255, 0.9)",
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "18px",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
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

      {/* 지도 영역(2D: OpenLayers, 3D: Cesium) */}
      <div
        id="zoom-controls"
        style={{ position: "absolute", top: "20px", right: "20px", zIndex: 1000 }}
      />

      <button
        onClick={handleToggleLayerPanel}
        style={{
          position: "absolute",
          top: "80px",
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
      >
        {/* 2D 모드: 기존 OpenLayers 캔버스 */}
        <div
          ref={mapRef}
          style={{
            width: "100%",
            height: "100%",
            display: mapMode === "2d" ? "block" : "none"
          }}
        />

        {/* 3D 모드: Cesium */}
        {mapMode === "3d" && (
          <div
            style={{
              position: "absolute",
              inset: 0
            }}
          >
            <CesiumPage selectedAdmin1={selectedAdmin1} />
          </div>
        )}
      </div>

      {/* 지도 영역 (현재는 2D OpenLayers만 사용) */}
      <div ref={mapRef} style={{ width: "100%", height: "100%", flex: 1 }} />
      {/* 범례 이미지 */}
      <img
        src="/icons/범례.png"
        alt="범례"
        style={{
          position: "absolute",
          bottom: "40px",
          right: "40px",
          width: "200px",
          borderRadius: "40px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
          background: "rgba(255,255,255,0.9)",
          zIndex: 1000
        }}
      />
      </div>
    </div>

    {/* 메인 화면 하단 고정 */}
    <footer>
      <div
        style={{
          width: "100%",
          height: 80,
          background: "#7FCBB6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <img
          src="/icons/Logo.png"
          alt="로고"
          style={{
            height: 42,
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => window.location.reload()}
        />
      </div>
    </footer>
    
  </div>
  );
};

export default MapComponent;
