import React, { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import TileWMS from 'ol/source/TileWMS';
import { fromLonLat } from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';

const MapComponent: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // 기본 OSM 타일 레이어
    const osmLayer = new TileLayer({
      source: new OSM(),
    });

    // GeoServer WMS 레이어 (placeholder - 실제 워크스페이스와 레이어명으로 변경 필요)
    const geoserverLayer = new TileLayer({
      source: new TileWMS({
        url: 'http://localhost:8080/geoserver/wms',
        params: {
          'LAYERS': 'your_workspace:sample_points', // 실제 워크스페이스:레이어명으로 변경
          'TILED': true,
        },
        serverType: 'geoserver',
      }),
    });

    // 벡터 레이어 (WFS를 통한 피처 로딩용)
    const vectorSource = new VectorSource({
      url: 'http://localhost:8080/geoserver/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=your_workspace:sample_points&outputFormat=application/json', // 실제 워크스페이스:레이어명으로 변경
      format: new GeoJSON(),
    });

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: 'red' }),
          stroke: new Stroke({ color: 'white', width: 2 }),
        }),
      }),
    });

    // 지도 인스턴스 생성
    const map = new Map({
      target: mapRef.current,
      layers: [
        osmLayer,
        // geoserverLayer, // WMS 레이어 (필요시 활성화)
        vectorLayer, // WFS 벡터 레이어
      ],
      view: new View({
        center: fromLonLat([126.9780, 37.5665]), // 서울 중심
        zoom: 7,
      }),
    });

    mapInstanceRef.current = map;

    // 벡터 레이어 로딩 이벤트
    vectorSource.on('featuresloadend', () => {
      console.log('GeoServer 데이터 로딩 완료');
    });

    vectorSource.on('featuresloaderror', (event) => {
      console.error('GeoServer 데이터 로딩 실패:', event);
    });

    // 클린업
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
      }
    };
  }, []);

  return (
    <div>
      <h2>OpenLayers + GeoServer 지도</h2>
      <div 
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '500px', 
          border: '1px solid #ccc' 
        }} 
      />
      <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
        <p><strong>설정 안내:</strong></p>
        <ul>
          <li>GeoServer URL이 실행 중인지 확인: <a href="http://localhost:8080/geoserver" target="_blank" rel="noopener noreferrer">http://localhost:8080/geoserver</a></li>
          <li>워크스페이스와 레이어명을 실제 값으로 변경하세요 (현재: 'your_workspace:sample_points')</li>
          <li>브라우저 개발자 도구 콘솔에서 로딩 상태를 확인하세요</li>
        </ul>
      </div>
    </div>
  );
};

export default MapComponent;
