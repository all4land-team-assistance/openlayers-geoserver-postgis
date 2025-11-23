/**
 * 메인 지도 컴포넌트
 * OpenLayers + GeoServer WFS
 * 포인트 클릭 → (목록→상세) → 팝업 렌더 + 클러스터링 + 아이콘(줌 임계)
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
import { GEOSERVER_URL, WORKSPACE, LAYER_STYLE } from "../config/constants";
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
import { findBestDetail, ctcdBySidoName } from "../api/heritage";

// ---- 설정값 ----
const SCALE_CLUSTER = 18000;       // 1:18,000보다 멀리서 보면 클러스터
const ICON_ZOOM_THRESHOLD = 10;    // 줌 10 이상에서만 아이콘 표시
const ICON_SCALE = 0.1;            // 아이콘 크기

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

// 현재 줌 기준 단일 피처 스타일(아이콘/점 전환)
function makeSinglePointStyle(props: any, map?: OLMap): Style {
  const zoom = map?.getView().getZoom?.() ?? 0;

  if (zoom < ICON_ZOOM_THRESHOLD) {
    // 줌 낮을 때: 단순 점
    return new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: "#ff7b00" }),
        stroke: new Stroke({ color: "#fff", width: 2 }),
      }),
    });
  }

  // 줌 충분: 아이콘
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
  // 팝업
  const popupRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const [popupHtml, setPopupHtml] = useState<string>("");

  // 맵/레이어 레지스트리
  const mapRef = useRef<HTMLDivElement>(null);
  const { mapInstanceRef } = useMap();
  const { layersMapRef } = useLayers();
  const isMapInitialized = useRef(false);

  // 레이어 패널 상태
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [availableLayers, setAvailableLayers] = useState<LayerInfo[]>([]);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());

  // 지도 모드 (2D / 3D)
  const [mapMode, setMapMode] = useState<MapMode>("2d");

  // 검색 결과 레이어 관리
  const searchResultSourceRef = useRef<VectorSource | null>(null);
  const searchResultLayerRef = useRef<VectorLayer<VectorSource> | null>(null);

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
        const useCluster = resolutionToScale(mapInstanceRef.current) > SCALE_CLUSTER;
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
        name: layerName,             // Busan_Kookbo
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


  useEffect(() => {
    if (!mapRef.current || isMapInitialized.current) return;
    isMapInitialized.current = true;

    layersMapRef.current.clear();

    const init = async () => {
      // 배경지도
      const osmLayer = new TileLayer({ source: new OSM() });

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
              return makeSinglePointStyle(props, mapInstanceRef.current || undefined);
            }
            // 라인/폴리곤
            return new Style({
              fill: new Fill({ color: "rgba(255,123,0,0.3)" }),
              stroke: new Stroke({ color: "#ff7b00", width: 2 }),
            });
          },
        });

        // :cluster 레이어
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
              return makeSinglePointStyle(props, mapInstanceRef.current || undefined);
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

      // 검색 결과 레이어 생성 (클러스터링 적용)
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
                stroke: new Stroke({ color: "rgba(0,0,0,0.35)", width: 3 }),
              }),
            });
          }
          
          // 단일 마커인 경우
          const props = clusterFeatures?.[0]?.getProperties() || feature.getProperties();
          return makeSinglePointStyle(props, mapInstanceRef.current || undefined);
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
        // 검색 결과 레이어는 자동으로 스타일이 업데이트되므로 별도 처리 불필요
        // (레이어의 style 함수가 매번 호출됨)
        map.renderSync();
      };
      map.getView().on("change:resolution", updateClusterVisibility);
      updateClusterVisibility();

      // 팝업 오버레이
      if (popupRef.current) {
        overlayRef.current = new Overlay({
          element: popupRef.current,
          positioning: "bottom-center",
          offset: [0, -12],
          stopEvent: true,
          autoPan: true,
          // autoPanAnimation / autoPanMargin 타입 오류가 있어 기본 설정만 사용
        });
        map.addOverlay(overlayRef.current);
      }

      // 팝업 내부 버튼(상세설명 토글/닫기)
      const onPopupClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target?.dataset?.action === "toggle-desc") {
          const card = popupRef.current!;
          const desc = card.querySelector(".kh-desc") as HTMLDivElement | null;
          const btn = card.querySelector(".kh-btn") as HTMLButtonElement | null;
          if (desc && btn) {
            const open = desc.style.display !== "none";
            desc.style.display = open ? "none" : "block";
            btn.textContent = open ? "상세설명" : "닫기";
          }
          return;
        }
        if (target?.dataset?.action === "close-card") {
          setPopupHtml("");
          overlayRef.current?.setPosition(undefined);
          return;
        }
      };
      popupRef.current?.addEventListener("click", onPopupClick);

      // 커서 모양만 손가락으로
      const handlePointerMove = (event: { pixel: number[] }) => {
        const features = map.getFeaturesAtPixel(event.pixel);
        const el = map.getTargetElement();
        if (el) el.style.cursor = features.length > 0 ? "pointer" : "";
      };
      map.on("pointermove", handlePointerMove);

      // 클릭 → (클러스터/핀 구분) → 목록→상세→팝업
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

        if (!pickedFeature) {
          setPopupHtml("");
          overlayRef.current?.setPosition(undefined);
          return;
        }

        // 클러스터 클릭 시 동작
        const layerClass =
          String(pickedLayer?.get("className") || pickedLayer?.getClassName?.() || "");
        
        // 검색 결과 마커 클릭 시 팝업 표시
        if (layerClass.includes("search-results")) {
          // 클러스터인 경우 확대
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
              ${type ? `<div style="color: #64748b; font-size: 14px; margin-bottom: 8px;">${type}</div>` : ""}
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
            // 여러 개면 확대
            const view = map.getView();
            view.animate({
              zoom: (view.getZoom() || 8) + 1.2,
              center: evt.coordinate,
              duration: 200,
            });
            return;
          }
          if (members.length === 1) {
            pickedFeature = members[0]; // 단일 멤버로 이어서 처리
          }
        }

        // 상세 조회 파라미터
        const props = pickedFeature.getProperties();
        const kdcd = String(props["종목코드"] ?? props["ccbaKdcd"] ?? props["kdcd"] ?? "");
        const sidoName = String(props["시도명"] ?? props["sido"] ?? props["ccbaCtcdNm"] ?? "");
        const name = String(props["국가유산명"] ?? props["ccbaMnm1"] ?? props["name"] ?? "");
        const ctcd = ctcdBySidoName[sidoName] ?? "";
        const [lon, lat] = toLonLat(evt.coordinate);

        setPopupHtml(`<div style="font-weight:600">상세 정보 불러오는 중…</div>`);
        overlayRef.current?.setPosition(evt.coordinate);

        try {
          const d = await findBestDetail(kdcd, ctcd, name, [lon, lat]);

          // 팝업 카드 (제목/종목/지역/이미지 + 상세설명 버튼)
          setPopupHtml(`
            <div class="kh-card" style="
              position:relative;
              max-width: 420px;
              width: 300px;
              background:#fff;
              border:1px solid #dcdcdc;
              border-radius:16px;
              box-shadow:0 8px 24px rgba(0,0,0,0.18);
              overflow:hidden;
            ">
              <!-- 닫기(X) -->
              <button class="kh-close" data-action="close-card" aria-label="닫기" style="
                position:absolute; top:8px; right:8px;
                width:28px; height:28px;
                border:1px solid #e5e7eb; background:#fff; color:#333;
                font-size:20px; border-radius:9999px;
                display:flex; align-items:center; justify-content:center;
                cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.06);
              ">&times;</button>

              <div style="padding:14px 16px 0 16px;">
                <div class="kh-title" style="
                  font-weight:800; font-size:18px; color:#111;
                  letter-spacing:-0.2px; line-height:1.25; margin:0 0 6px 0;
                ">${d.title || "(이름 없음)"}</div>

                <div class="kh-meta" style="
                  color:#666; font-size:13px; line-height:1.3; margin-bottom:10px;
                ">
                  ${[d.kind, d.sido].filter(Boolean).join(" / ")}
                </div>
              </div>

              ${d.image ? `
                <div style="padding:0 16px 8px 16px;">
                  <img class="kh-img" src="${d.image}" alt=""
                       style="display:block;width:100%;border-radius:10px;" />
                </div>` : ""}

              <div style="padding:0 16px 16px 16px;">
                <button class="kh-btn" data-action="toggle-desc" style="
                  display:inline-block; border:1px solid #1f6feb; background:#1f6feb;
                  color:#fff; font-weight:600; font-size:13px; padding:8px 12px;
                  border-radius:8px; cursor:pointer;
                ">상세설명</button>

                <div class="kh-desc" style="
                  display:none; color:#333; font-size:13px; line-height:1.55;
                  margin-top:12px; white-space:pre-line;
                ">${d.desc || "상세 설명 없음"}</div>
              </div>
            </div>
          `);
          overlayRef.current?.setPosition(evt.coordinate);
        } catch (e: any) {
          setPopupHtml(`<div style="color:#c00">상세 조회 실패: ${e?.message || "오류"}</div>`);
          overlayRef.current?.setPosition(evt.coordinate);
        }
      };
      map.on("singleclick", handleSingleClick);

      // 빈 곳 클릭 → 팝업 닫기
      const onPointerDown = (e: any) => {
        if (!map.hasFeatureAtPixel(e.pixel as any)) {
          setPopupHtml("");
          overlayRef.current?.setPosition(undefined);
        }
      };
      map.on("pointerdown" as any, onPointerDown);

      // 상태 반영
      setAvailableLayers(layers);
      setVisibleLayers(new Set());

      // 정리
      return () => {
        map.getView().un("change:resolution" as any, updateClusterVisibility);
        map.un("pointermove" as any, handlePointerMove);
        map.un("singleclick" as any, handleSingleClick);
        map.un("pointerdown" as any, onPointerDown);
        popupRef.current?.removeEventListener("click", onPopupClick);

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
  }, []); // 최초 1회만 초기화

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

  // 검색 결과를 지도에 마커로 표시 (성능 최적화)
  const handleSearchResults = (results: SearchResultItem[]) => {
    if (!searchResultSourceRef.current || !mapInstanceRef.current) return;

    // 기존 검색 결과 제거
    searchResultSourceRef.current.clear();

    // 검색 결과 개수 제한 (너무 많으면 성능 저하)
    const maxResults = 500;
    const limitedResults = results.slice(0, maxResults);

    // 배치로 마커 추가 (성능 최적화)
    const features: Feature[] = [];
    
    limitedResults.forEach((item) => {
      try {
        let coordinates: [number, number] | null = null;

        // 방법 1: 직접 추출된 lat, lon 사용 (POINT의 경우)
        if (item.lat !== null && item.lat !== undefined && 
            item.lon !== null && item.lon !== undefined) {
          coordinates = [Number(item.lon), Number(item.lat)];
        }
        // 방법 2: geom_json에서 좌표 추출 (GeoJSON 형식)
        else if (item.geom_json) {
          const geomJson = item.geom_json;
          
          if (geomJson.type === "Point") {
            coordinates = [geomJson.coordinates[0], geomJson.coordinates[1]];
          } else if (geomJson.type === "Polygon" || geomJson.type === "MultiPolygon") {
            const coords = geomJson.type === "Polygon" 
              ? geomJson.coordinates[0] 
              : geomJson.coordinates[0][0];
            const centerLon = coords.reduce((sum: number, coord: number[]) => sum + coord[0], 0) / coords.length;
            const centerLat = coords.reduce((sum: number, coord: number[]) => sum + coord[1], 0) / coords.length;
            coordinates = [centerLon, centerLat];
          }
        }

        if (coordinates) {
          const [lon, lat] = coordinates;
          const point = new Point(fromLonLat([lon, lat]));
          const feature = new Feature({
            geometry: point,
            ...item, // 모든 검색 결과 데이터를 속성으로 저장
          });
          features.push(feature);
        }
      } catch (error) {
        console.error("검색 결과 마커 추가 실패:", error, item);
      }
    });

    // 한 번에 모든 피처 추가 (성능 최적화)
    if (features.length > 0) {
      searchResultSourceRef.current.addFeatures(features);
      
      // 지도 업데이트는 한 번만
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.renderSync();
        }
      }, 0);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <SearchPanel 
        onLocationClick={handleLocationClick} 
        onSearchResults={handleSearchResults}
        mapMode={mapMode}
        onChangeMapMode={setMapMode}
      />

      <div
        id="zoom-controls"
        style={{ position: "absolute", top: "20px", right: "20px", zIndex: 1000 }}
      />

      <button
        onClick={handleToggleLayerPanel}
        style={{
          position: "absolute", top: "80px", right: "20px", zIndex: 1000,
          background: "rgba(255, 255, 255, 0.9)", border: "1px solid #ddd",
          borderRadius: "8px", padding: "12px", fontSize: "18px", cursor: "pointer",
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

      {/* 지도 영역 (현재는 2D OpenLayers만 사용) */}
      {/* 지도 영역(2D: OpenLayers, 3D: Cesium) */}
      <div
        style={{
          width: "100%",
          height: "100%",
          flex: 1,
          position: "relative",
        }}
      >
        {/* 2D 모드: 기존 OpenLayers 캔버스 */}
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
            <CesiumPage />
          </div>
        )}
      </div>
      {/* 범례 이미지 */}
      <img
        src="/icons/범례.png"
        alt="범례"
        style={{
          position: "absolute",
          bottom: "40px",   // 지도 하단에서 40px 위
          right: "40px",    // 지도 오른쪽에서 40px 왼쪽 (적당히 조정 가능)
          width: "200px",   // 이미지 크기 (원하는 대로 조정)
          borderRadius: "40px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
          background: "rgba(255,255,255,0.9)",
          zIndex: 1000,
        }}
      />


      {/* 팝업 오버레이 DOM */}
      <div
        ref={popupRef}
        style={{
          position: "absolute",
          transform: "translate(-50%, -100%)",
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: 12,
          padding: 12,
          minWidth: 260,
          maxWidth: 360,
          maxHeight: "40vh",
          overflowY: "auto",
          lineHeight: 1.5,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          display: popupHtml ? "block" : "none",
          zIndex: 1001,
        }}
        dangerouslySetInnerHTML={{ __html: popupHtml }}
      />
    </div>
  );
};

export default MapComponent;
