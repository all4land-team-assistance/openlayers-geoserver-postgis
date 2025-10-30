/**
 * 메인 애플리케이션 컴포넌트
 * 지오스페이셜 웹 애플리케이션의 루트 컴포넌트
 */
import React from "react";
import MapComponent from "./components/MapComponent";
import "./App.css";

const App: React.FC = () => {
  return (
    <div className="app">
      {/* 메인 지도 컴포넌트 */}
      <main className="app-main">
        <MapComponent />
      </main>
      {/* 애플리케이션 푸터 */}
      <footer className="app-footer">
        <div className="footer-content">
          <h2>🏛️ 문화유산 답사기</h2>
          <p>전국 문화유산을 한눈에 확인하세요</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
