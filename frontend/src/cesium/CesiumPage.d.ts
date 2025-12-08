import React from 'react';
import type { SearchResultItem } from "../types";

interface CesiumPageProps {
  style?: React.CSSProperties;
  selectedAdmin1?: string | null;
  admin3DMode?: 'density' | 'model' | null;
  searchResults?: SearchResultItem[];
  onSearchResultClick?: (item: SearchResultItem) => void;
  flyToLocation?: [number, number] | null; // [lon, lat]
}

declare const CesiumPage: React.FC<CesiumPageProps>;

export default CesiumPage;
