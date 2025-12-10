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
  CATEGORY_MAP,
  TARGET_LAYER_GROUPS,
  CITY_NAME_MAP,
  LAYER_GROUP_NAME_MAP,
} from "../config/constants";
import { useMap } from "../hooks/useMap";
import { useLayers } from "../hooks/useLayers";
import type {
  LayerInfo,
  SearchResultItem,
  MapMode,
  Admin3DMode,
} from "../types";
import Point from "ol/geom/Point";
import Feature from "ol/Feature";
import CircleStyle from "ol/style/Circle";
import CesiumPage from "../cesium/CesiumPage";

// 클러스터링/텍스트/아이콘
import Cluster from "ol/source/Cluster";
import Text from "ol/style/Text";
import Icon from "ol/style/Icon";

// 상세 API
import { findBestDetail, ctcdBySidoName, type Detail } from "../api/heritage";

// ---- 설정값 ----
const SCALE_CLUSTER = 18000; // 1:18,000보다 멀리서 보면 클러스터
const ICON_ZOOM_THRESHOLD = 9; // 줌 9 이상에서만 아이콘 표시
const ICON_SCALE = 0.1; // 아이콘 크기
const CLUSTER_DISABLE_ZOOM = 11;

// 스케일 계산 유틸
const DPI = 96;
const INCH_PER_M = 39.37;
function resolutionToScale(map: OLMap) {
  const res = map.getView().getResolution();
  if (res == null) return Infinity;
  const metersPerUnit = map.getView().getProjection().getMetersPerUnit() || 1;
  return res * metersPerUnit * DPI * INCH_PER_M;
}

function shouldUseCluster(map: OLMap) {
  const scale = resolutionToScale(map);
  const zoom = map.getView().getZoom?.() ?? 0;

  const isFar = scale > SCALE_CLUSTER;
  const isTooClose = zoom >= CLUSTER_DISABLE_ZOOM;

  return isFar && !isTooClose;
}

function getClusterDistance(zoom: number) {
  if (zoom < 7) return 40;
  if (zoom < 9) return 30;
  if (zoom < 11) return 20;
  return 10;
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
  const [typeLayers, setTypeLayers] = useState<LayerInfo[]>([]); // 유형별 레이어
  const [locationLayers, setLocationLayers] = useState<LayerInfo[]>([]); // 소재지별 레이어

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

  // 3D 행정구역 표현 모드 (밀집도 / 3D 모델)
  const [admin3DMode, setAdmin3DMode] = useState<Admin3DMode | null>(null);

  // 2D/3D 모드 변경 핸들러
  const handleChangeMapMode = (nextMode: MapMode) => {
    if (nextMode === mapMode) return;

    // 3D → 2D로 내려갈 때 Cesium 관련 선택 상태 초기화
    if (nextMode === "2d") {
      setSelectedAdmin1(null);
      setAdmin3DMode(null);
    }

    setMapMode(nextMode);
  };

  // 검색 결과 레이어 관리 (2D) + 3D 전달용 상태
  const searchResultSourceRef = useRef<VectorSource | null>(null);
  const searchResultLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const [searchResults3d, setSearchResults3d] = useState<SearchResultItem[]>([]);
  const [flyToLocation3d, setFlyToLocation3d] = useState<[number, number] | null>(null);

  const handleToggleLayerPanel = () => setIsLayerPanelOpen(!isLayerPanelOpen);

  // 그룹용 (UI)
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());

  // 실제 켜진 레이어의 baseName 리스트
  const activeBaseLayersRef = useRef<Set<string>>(new Set());

  // 레이어 표시/숨김 헬퍼 함수
  const toggleLayerVisibility = (baseName: string, turnOn: boolean) => {
    const pin = layersMapRef.current.get(baseName + ":pin");
    const cluster = layersMapRef.current.get(baseName + ":cluster");

    if (turnOn) {
      activeBaseLayersRef.current.add(baseName);
      if (mapInstanceRef.current) {
        const useCluster = shouldUseCluster(mapInstanceRef.current);
        if (pin) pin.setVisible(!useCluster);
        if (cluster) cluster.setVisible(useCluster);
      } else {
        if (pin) pin.setVisible(true);
      }
    } else {
      activeBaseLayersRef.current.delete(baseName);
      if (pin) pin.setVisible(false);
      if (cluster) cluster.setVisible(false);
    }
  };

  // const toggleLayerVisibility = (baseName: string, turnOn: boolean) => {
  //   const pin = layersMapRef.current.get(baseName + ":pin");
  //   const cluster = layersMapRef.current.get(baseName + ":cluster");

  //   if (turnOn) {
  //     if (mapInstanceRef.current) {
  //       const useCluster =
  //         resolutionToScale(mapInstanceRef.current) > SCALE_CLUSTER;
  //       if (pin) pin.setVisible(!useCluster);
  //       if (cluster) cluster.setVisible(useCluster);
  //     } else {
  //       if (pin) pin.setVisible(true);
  //     }
  //   } else {
  //     if (pin) pin.setVisible(false);
  //     if (cluster) cluster.setVisible(false);
  //   }
  // };

  // 레이어 그룹 토글 시 해당 그룹의 모든 레이어를 토글 (유형별/소재지별)
  const handleToggleLayer = (groupName: string) => {
    const next = new Set(visibleLayers);
    const turnOn = !next.has(groupName);

    // 레이어 그룹 이름으로 유형별 그룹인지 확인
    const koreanType = LAYER_GROUP_NAME_MAP[groupName];

    if (koreanType && TARGET_LAYER_GROUPS.includes(koreanType)) {
      // 유형별 그룹: 해당 유형의 모든 레이어 찾기
      layersMapRef.current.forEach((_layer, layerKey) => {
        const baseName = layerKey.split(":")[0];
        const parts = baseName.split("_");

        if (parts.length >= 2) {
          const layerType = parts[parts.length - 1];
          if (CATEGORY_MAP[layerType] === koreanType) {
            toggleLayerVisibility(baseName, turnOn);
          }
        }
      });
    } else {
      // 소재지별 그룹: 해당 지역의 모든 레이어 찾기
      const baseKey = groupName.replace("_Group", "");
      const koreanLocation = CITY_NAME_MAP[baseKey] || baseKey;

      layersMapRef.current.forEach((_layer, layerKey) => {
        const baseName = layerKey.split(":")[0];
        const parts = baseName.split("_");

        if (parts.length >= 2) {
          const layerRegion = parts[0];
          const layerType = parts[parts.length - 1];
          const regionKorean = CITY_NAME_MAP[layerRegion] || layerRegion;
          const typeKorean = CATEGORY_MAP[layerType];

          if (
            regionKorean === koreanLocation &&
            typeKorean &&
            TARGET_LAYER_GROUPS.includes(typeKorean)
          ) {
            toggleLayerVisibility(baseName, turnOn);
          }
        }
      });
    }

    if (turnOn) {
      next.add(groupName);
    } else {
      next.delete(groupName);
    }

    setVisibleLayers(next);
    mapInstanceRef.current?.renderSync();
  };

  // WMS GetCapabilities로 레이어 그룹 목록 가져오기
  const fetchLayerGroupsFromWMS = async (): Promise<LayerInfo[]> => {
    try {
      const response = await fetch(
        `${GEOSERVER_URL}/wms?service=WMS&version=1.3.0&request=GetCapabilities`
      );
      const text = await response.text();
      const xml = new DOMParser().parseFromString(text, "text/xml");

      // LayerGroup 또는 Layer 요소 찾기
      const layers = xml.getElementsByTagName("Layer");
      const groups: LayerInfo[] = [];
      const foundGroups = new Set<string>();

      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const nameElement = layer.getElementsByTagName("Name")[0];
        if (!nameElement) continue;

        const fullName = nameElement.textContent || "";

        // WORKSPACE 접두사 제거 (예: "sbsj:Kookbo_Group" → "Kookbo_Group")
        const groupName = fullName.startsWith(`${WORKSPACE}:`)
          ? fullName.split(":")[1]
          : fullName;

        // 레이어 그룹 이름 확인 (예: "Kookbo_Group", "Treasure_Group" 등)
        if (LAYER_GROUP_NAME_MAP[groupName] && !foundGroups.has(groupName)) {
          foundGroups.add(groupName);
          groups.push({
            name: groupName,
            displayName: LAYER_GROUP_NAME_MAP[groupName],
            color: LAYER_STYLE.fill,
          });
        }
      }

      return groups;
    } catch (e) {
      console.error("GeoServer 레이어 그룹 목록 로딩 실패:", e);
      return [];
    }
  };

  // WFS GetCapabilities로 레이어 목록을 한 번만 가져오는 공통 함수
  const fetchLayerCapabilities = async (): Promise<Element[]> => {
    try {
      const response = await fetch(
        `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`
      );
      const text = await response.text();
      const xml = new DOMParser().parseFromString(text, "text/xml");
      const featureTypes = xml.getElementsByTagName("FeatureType");
      return Array.from(featureTypes);
    } catch (e) {
      console.error("GeoServer 레이어 목록 로딩 실패:", e);
      return [];
    }
  };

  // 레이어 이름 파싱 헬퍼 함수
  const parseLayerName = (
    fullName: string
  ): { layerName: string; regionName: string; type: string } | null => {
    if (!fullName.startsWith(`${WORKSPACE}:`)) return null;

    const layerName = fullName.split(":")[1];
    const parts = layerName.split("_");

    if (parts.length < 2) return null;

    return {
      layerName,
      regionName: parts[0],
      type: parts[parts.length - 1],
    };
  };

  // 소재지별로 그룹화
  const fetchLocationGroupsFromGeoServer = async (
    featureTypes: Element[]
  ): Promise<LayerInfo[]> => {
    try {
      const locationSet = new Set<string>();

      for (const featureType of featureTypes) {
        const nameElement = featureType.getElementsByTagName("Name")[0];
        if (!nameElement) continue;

        const fullName = nameElement.textContent || "";
        const parsed = parseLayerName(fullName);
        if (!parsed) continue;

        const koreanType = CATEGORY_MAP[parsed.type] || null;
        if (koreanType && TARGET_LAYER_GROUPS.includes(koreanType)) {
          const koreanLocation =
            CITY_NAME_MAP[parsed.regionName] || parsed.regionName;
          locationSet.add(koreanLocation);
        }
      }

      const groups: LayerInfo[] = [];
      for (const koreanLocation of locationSet) {
        const englishLocation =
          Object.keys(CITY_NAME_MAP).find(
            (key) => CITY_NAME_MAP[key] === koreanLocation
          ) || koreanLocation;

        groups.push({
          name: englishLocation + "_Group",
          displayName: koreanLocation,
          color: LAYER_STYLE.fill,
        });
      }

      return groups.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "ko")
      );
    } catch (e) {
      console.error("GeoServer 소재지별 레이어 그룹 목록 로딩 실패:", e);
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

      const res = await fetch(url);
      if (!res.ok) throw new Error("kr_admin1 WFS 요청 실패");

      const json = await res.json();
      const set = new Set<string>();

      for (const f of json.features ?? []) {
        const n = f.properties?.name;
        if (n) set.add(String(n));
      }

      return Array.from(set).sort();
    } catch (e) {
      console.error("[fetchAdmin1Names] 실패:", e);
      return [];
    }
  };

  const closeDetailPanel = () => {
    setIsDetailPanelOpen(false);
  };

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

    let cleanup: (() => void) | null = null;

    const init = async () => {
      // 배경지도
      const osmLayer = new TileLayer({ source: new OSM() });

      // kr_admin1 name 목록
      const adminNames = await fetchAdmin1Names();
      setAdmin1Options(adminNames);

      // WFS GetCapabilities로 레이어 목록 한 번만 가져오기
      const featureTypes = await fetchLayerCapabilities();

      // 레이어 그룹 목록 가져오기 (유형별은 WMS에서 레이어 그룹 직접 사용, 소재지별은 레이어 이름 파싱)
      const [typeGroups, locationGroups] = await Promise.all([
        fetchLayerGroupsFromWMS(),
        fetchLocationGroupsFromGeoServer(featureTypes),
      ]);

      // 벡터/클러스터 레이어 구성
      const olLayers: VectorLayer<VectorSource | Cluster>[] = [];

      // 모든 레이어를 로드 (유형별 필터링: 국보, 민속, 사적, 보물만)
      for (const featureType of featureTypes) {
        const nameElement = featureType.getElementsByTagName("Name")[0];
        if (!nameElement) continue;

        const fullName = nameElement.textContent || "";
        const parsed = parseLayerName(fullName);
        if (!parsed) continue;

        const koreanType = CATEGORY_MAP[parsed.type];

        // 국보, 민속, 사적, 보물만 로드
        if (koreanType && TARGET_LAYER_GROUPS.includes(koreanType)) {
          const layerName = parsed.layerName;
          console.log("➡ load vector layer:", layerName, "/", koreanType);
          const vectorSource = new VectorSource({
            url: `${GEOSERVER_URL}/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${WORKSPACE}:${layerName}&outputFormat=application/json&srsName=EPSG:4326`,
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
          const clusterSource = new Cluster({
            distance: 35,
            source: vectorSource,
          });
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

          layersMapRef.current.set(layerName + ":pin", pinLayer);
          layersMapRef.current.set(layerName + ":cluster", clusterLayer);
          olLayers.push(clusterLayer, pinLayer);

          vectorSource.on("featuresloaderror", (e) => {
            console.error(`${layerName} 데이터 로딩 실패:`, e);
          });
        }
      }

      // 검색 결과 레이어
      const searchResultSource = new VectorSource();

      // 클러스터
      const searchResultClusterSource = new Cluster({
        distance: 40,
        source: searchResultSource,
      });

      // 개별 핀 레이어
      const searchResultPinLayer = new VectorLayer({
        source: searchResultSource,
        visible: true,
        className: "search-results-pin",
        style: (feature) => {
          const props = feature.getProperties();
          return makeSinglePointStyle(
            props,
            mapInstanceRef.current || undefined
          );
        },
      });

      // 클러스터 레이어
      const searchResultClusterLayer = new VectorLayer({
        source: searchResultClusterSource,
        visible: false,
        className: "search-results-cluster",
        style: (feature) => {
          const clusterFeatures = feature.get("features");
          const size = clusterFeatures?.length || 0;

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
                font:
                  "700 14px system-ui, -apple-system, Segoe UI, Roboto",
                fill: new Fill({ color: "#fff" }),
                stroke: new Stroke({
                  color: "rgba(0,0,0,0.35)",
                  width: 3,
                }),
              }),
            });
          }

          const props =
            clusterFeatures?.[0]?.getProperties() || feature.getProperties();
          return makeSinglePointStyle(
            props,
            mapInstanceRef.current || undefined
          );
        },
      });

      searchResultSourceRef.current = searchResultSource;
      
      const map = new OLMap({
        target: mapRef.current!,
        layers: [
          osmLayer,
          searchResultClusterLayer,
          searchResultPinLayer,
          ...olLayers,
        ],
        view: new View({
          center: fromLonLat([126.978, 37.5665]),
          zoom: 8,
        }),
        controls: [new Zoom({ target: "zoom-controls" })],
      });
      mapInstanceRef.current = map;

      // 줌/스케일에 따른 클러스터 <-> 핀 전환
      const updateClusterVisibility = () => {
        const useCluster = shouldUseCluster(map);
        const zoom = map.getView().getZoom() ?? 0;

        // 문화재 레이어 토글
        activeBaseLayersRef.current.forEach((baseName) => {
          const pin = layersMapRef.current.get(baseName + ":pin");
          const cluster = layersMapRef.current.get(
            baseName + ":cluster"
          ) as VectorLayer<any>;

          if (cluster) {
            const src = cluster.getSource() as Cluster;
            if (src) {
              src.setDistance(getClusterDistance(zoom));
            }
            cluster.setVisible(useCluster);
          }

          if (pin) {
            pin.setVisible(!useCluster);
          }
        });

        // 검색 결과 레이어 토글
        const allLayers = map.getLayers().getArray();

        const srPin = allLayers.find((l: any) => {
          const cls =
            l.get?.("className") ?? l.getClassName?.();
          return cls === "search-results-pin";
        }) as VectorLayer<any> | undefined;

        const srCluster = allLayers.find((l: any) => {
          const cls =
            l.get?.("className") ?? l.getClassName?.();
          return cls === "search-results-cluster";
        }) as VectorLayer<any> | undefined;

        if (srCluster) {
          const src = srCluster.getSource() as Cluster;
          if (src) {
            src.setDistance(getClusterDistance(zoom));
          }
          srCluster.setVisible(useCluster);
        }

        if (srPin) {
          srPin.setVisible(!useCluster);
        }

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
        const layerClass = String(
          pickedLayer?.get("className") || pickedLayer?.getClassName?.() || ""
        );

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

          // 단일 마커인 경우 상세 패널 열기
          const actualFeature = clusterFeatures?.[0] || pickedFeature;
          const props = actualFeature.getProperties();
          const kdcd = String(
            props["종목코드"] ?? props["ccbaKdcd"] ?? props["kdcd"] ?? ""
          );
          const sidoName = String(
            props["시도명"] ?? props["sido"] ?? props["ccbaCtcdNm"] ?? ""
          );
          const name = String(
            props["국가유산명"] ?? props["ccbaMnm1"] ?? props["name"] ?? ""
          );
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
        const kdcd = String(
          props["종목코드"] ?? props["ccbaKdcd"] ?? props["kdcd"] ?? ""
        );
        const sidoName = String(
          props["시도명"] ?? props["sido"] ?? props["ccbaCtcdNm"] ?? ""
        );
        const name = String(
          props["국가유산명"] ?? props["ccbaMnm1"] ?? props["name"] ?? ""
        );
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

      // 유형별, 소재지별 레이어 그룹 설정
      setTypeLayers(typeGroups);
      setLocationLayers(locationGroups);
      setVisibleLayers(new Set());

      cleanup = () => {
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

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // 검색 결과 클릭 시 지도 이동 (2D는 OL, 3D는 Cesium에 전달)
  const handleLocationClick = (coordinates: [number, number]) => {
    const [lon, lat] = coordinates;

    if (mapMode === "3d") {
      setFlyToLocation3d([lon, lat]);
      return;
    }

    if (!mapInstanceRef.current) return;
    const view = mapInstanceRef.current.getView();
    const center = fromLonLat([lon, lat]);
    view.animate({
      center,
      zoom: 15,
      duration: 1000,
    });
  };

  // 검색 결과 좌표 추출 헬퍼 (2D/3D 공용)
  const extractCoordinatesFromItem = (
    item: SearchResultItem
  ): [number, number] | null => {
    if (
      item.lat !== null &&
      item.lat !== undefined &&
      item.lon !== null &&
      item.lon !== undefined
    ) {
      return [Number(item.lon), Number(item.lat)];
    }
    if (item.geom_json) {
      const geomJson = item.geom_json;
      if (geomJson.type === "Point") {
        return [geomJson.coordinates[0], geomJson.coordinates[1]];
      } else if (geomJson.type === "Polygon" || geomJson.type === "MultiPolygon") {
        const coords =
          geomJson.type === "Polygon"
            ? geomJson.coordinates[0]
            : geomJson.coordinates[0][0];
        const centerLon =
          coords.reduce((sum: number, coord: number[]) => sum + coord[0], 0) /
          coords.length;
        const centerLat =
          coords.reduce((sum: number, coord: number[]) => sum + coord[1], 0) /
          coords.length;
        return [centerLon, centerLat];
      } else if (geomJson.type === "LineString" || geomJson.type === "MultiLineString") {
        const coords =
          geomJson.type === "LineString"
            ? geomJson.coordinates[0]
            : geomJson.coordinates[0][0];
        return [coords[0], coords[1]];
      }
    }
    return null;
  };

  const handleSearchResults = (results: SearchResultItem[]) => {
    // 3D용 상태는 항상 업데이트
    setSearchResults3d(results);
    // 새 결과가 들어오면 3D flyTo는 초기화 (다음 클릭 시 적용)
    setFlyToLocation3d(null);

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

  // 3D 검색 마커 클릭 시 좌측 상세 패널 열기 (2D 로직과 동일한 findBestDetail 사용)
  const handleSearchResultClick3D = async (item: SearchResultItem) => {
    const coordinates = extractCoordinatesFromItem(item);
    if (!coordinates) {
      setSelectedDetail(null);
      setDetailError("위치 정보가 없는 결과입니다");
      setIsDetailPanelOpen(true);
      return;
    }

    const [lon, lat] = coordinates;
    const kdcd = String(
      item["종목코드"] ?? item["ccbaKdcd"] ?? item["kdcd"] ?? ""
    );
    const sidoName = String(
      item["시도명"] ?? item["sido"] ?? item["ccbaCtcdNm"] ?? ""
    );
    const name = String(
      item["국가유산명"] ?? item["ccbaMnm1"] ?? item["name"] ?? ""
    );
    const ctcd = ctcdBySidoName[sidoName] ?? "";

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

  return (
    // 전체 화면: 세로
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
      }}
    >
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
              flexShrink: 0,
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
                lineHeight: 1,
              }}
              aria-label="닫기"
            >
              ×
            </button>
          </div>

          {/* 본문(스크롤 영역) */}
          <div
            style={{
              padding: 14,
              overflowY: "auto",
              flex: 1,
              minHeight: 0,
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
                      marginBottom: 10,
                    }}
                  />
                )}

                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: "pre-line",
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
            onChangeMapMode={handleChangeMapMode}
            admin1Options={admin1Options}
            selectedAdmin1={selectedAdmin1}
            onChangeAdmin1={setSelectedAdmin1}
            admin3DMode={admin3DMode}
            onChangeAdmin3DMode={setAdmin3DMode}
          />

          <div
            id="zoom-controls"
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              zIndex: 1000,
            }}
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
            title="레이어 목록"
          >
            ☰
          </button>

          <LayerPanel
            isOpen={isLayerPanelOpen}
            typeLayers={typeLayers}
            locationLayers={locationLayers}
            visibleLayers={visibleLayers}
            onToggleLayer={handleToggleLayer}
            onClose={() => setIsLayerPanelOpen(false)}
          />

          {/* 지도 영역(2D: OpenLayers, 3D: Cesium) */}
          <div
            ref={mapRef}
            style={{
              width: "100%",
              height: "100%",
              display: mapMode === "2d" ? "block" : "none",
            }}
          />

          {/* 3D 모드: Cesium */}
          {mapMode === "3d" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
              }}
            >
              <CesiumPage
                selectedAdmin1={selectedAdmin1}
                admin3DMode={admin3DMode}
                searchResults={searchResults3d}
                onSearchResultClick={handleSearchResultClick3D}
                flyToLocation={flyToLocation3d}
              />
            </div>
          )}

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
              zIndex: 1000,
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
            justifyContent: "center",
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
