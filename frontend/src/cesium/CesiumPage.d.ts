import React from 'react';

interface CesiumPageProps {
  style?: React.CSSProperties;
  selectedAdmin1?: string | null;
  admin3DMode?: 'density' | 'model' | null;
}

declare const CesiumPage: React.FC<CesiumPageProps>;

export default CesiumPage;
