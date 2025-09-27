/**
 * 메인 애플리케이션 컴포넌트
 * 지오스페이셜 웹 애플리케이션의 루트 컴포넌트
 */
import React from "react";
import MapComponent from "./components/MapComponent";
import "./App.css";

function App() {
  return (
    <div className="app">
      {/* 애플리케이션 헤더 */}
      <header className="app-header">
        <h1>지오스페이셜 웹 애플리케이션</h1>
        <p>React + OpenLayers + GeoServer + PostGIS</p>
      </header>
      {/* 메인 지도 컴포넌트 */}
      <main className="app-main">
        <MapComponent />
      </main>
    </div>
  );
}

export default App;
