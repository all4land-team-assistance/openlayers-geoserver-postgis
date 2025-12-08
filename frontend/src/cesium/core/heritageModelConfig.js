// 종목명(국보/민속/보물/사적)에 따라 사용할 glb 설정
export const HERITAGE_MODEL_CONFIG = {
  국보: {
    uri: "/3DModel/국보.glb",
    scale: 2.0,
    headingDeg: 180,   // deg 단위
    heightOffset: 0, // m 단위
  },
  민속: {
    uri: "/3DModel/민속.glb",
    scale: 100.0,
    headingDeg: 0,
    heightOffset: 7,
  },
  보물: {
    uri: "/3DModel/보물.glb",
    scale: 0.03,
    headingDeg: 90,
    heightOffset: 10,
  },
  사적: {
    uri: "/3DModel/사적.glb",
    scale: 1.0,
    headingDeg: 90,
    heightOffset: 1,
  },
};

export const HERITAGE_MODEL = {
    NEAR_DISTANCE: 6000.0,
    FAR_DISTANCE: 7000.0
}

// 어떤 glb 설정을 쓸지 찾아주는 헬퍼
export function getHeritageModelConfig(rawCategory) {
  const text = String(rawCategory ?? "").trim();
  if (!text) return null;

  // 종목명 안에 국보/민속/보물/사적 이 포함되어 있으면 매핑
  for (const key of Object.keys(HERITAGE_MODEL_CONFIG)) {
    if (text.includes(key)) {
      return HERITAGE_MODEL_CONFIG[key];
    }
  }

  return null;
}
