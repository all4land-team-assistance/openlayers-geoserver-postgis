import React from 'react'
import MapComponent from './components/MapComponent'
import './App.css'

function App() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>지오스페이셜 웹 애플리케이션</h1>
      <p>React + OpenLayers + GeoServer + PostGIS</p>
      <MapComponent />
    </div>
  )
}

export default App
