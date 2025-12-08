// src/cesium/hooks/useAdminNameOverlay.js
import * as Cesium from "cesium";

/**
 * 선택된 kr_admin1 / 시군구 / 포인트 위에 텍스트만 띄워주는 경량 오버레이
 * - 배경 없음, 글자만 보이도록 처리
 * - viewer.scene.postRender 에서 화면 좌표 갱신
 * - 단일 레이블(show) + 다중 레이블(showRegions) 둘 다 지원
 */
export function createAdminNameOverlay(viewer, defaultFontSizePx = 35) {
  const containerId = "admin-name-layer";
  const styleId = "admin-name-style";
  const scratch = new Cesium.Cartesian2();

  // 스타일 1회만 주입
  if (!document.getElementById(styleId)) {
    const css = `
      #${containerId} {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: visible;
      }

      .admin-name-label {
        position: absolute;
        font-weight: 700;
        font-family: 'Noto Sans KR', system-ui, sans-serif;
        font-size: 35px;
        color: #ffffff;
        white-space: nowrap;
        pointer-events: none;
        text-shadow:
          0 0 3px rgba(0,0,0,0.9),
          0 0 8px rgba(0,0,0,0.7);
      }
    `;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // 레이어 div 생성 (viewer 컨테이너 안에)
  let layer = document.getElementById(containerId);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = containerId;
    viewer.container.appendChild(layer);
  }

  // 단일용, 다중용 따로 관리
  let singleRecord = null; // { el, world }
  let multiRecords = [];   // { el, world }[]

  function updateElementPosition(record) {
    const { el, world } = record;
    const win = viewer.scene.cartesianToCanvasCoordinates(world, scratch);
    if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
      el.style.display = "none";
      return;
    }

    const w = el.offsetWidth || 0;
    const h = el.offsetHeight || 0;

    const left = win.x - w / 2;
    const top = win.y - h;

    el.style.display = "block";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function updatePosition() {
    if (singleRecord) {
      updateElementPosition(singleRecord);
    }
    if (multiRecords.length) {
      for (const rec of multiRecords) {
        updateElementPosition(rec);
      }
    }
  }

  /**
   * worldPosition: Cartesian3
   * text: string
   * fontSizePx: number | undefined
   *   - 전달하면 해당 px로 글자 크기 설정
   *   - 전달하지 않으면 defaultFontSizePx 사용
   *
   * 기존처럼 "하나만" 띄우는 용도 (광역 이름, 클릭된 포인트 등)
   */
  function show(worldPosition, text, fontSizePx) {
    clear();
    if (!worldPosition) return;

    const el = document.createElement("div");
    el.className = "admin-name-label";
    el.textContent = text ?? "";

    const size =
      typeof fontSizePx === "number" && fontSizePx > 0
        ? fontSizePx
        : defaultFontSizePx;
    el.style.fontSize = `${size}px`;

    layer.appendChild(el);

    singleRecord = { el, world: worldPosition };
    updatePosition();
  }

  /**
   * 다중 레이블용
   * regions: Array<{ worldPosition: Cartesian3, text: string, fontSizePx?: number }>
   * defaultFontSizeForRegions: number | undefined
   */
  function showRegions(regions, defaultFontSizeForRegions) {
    clear();
    if (!Array.isArray(regions) || regions.length === 0) return;

    const baseFontSize =
      typeof defaultFontSizeForRegions === "number" &&
      defaultFontSizeForRegions > 0
        ? defaultFontSizeForRegions
        : defaultFontSizePx;

    const newRecords = [];

    for (const item of regions) {
      if (!item || !item.worldPosition) continue;

      const text = item.text ?? "";
      const size =
        typeof item.fontSizePx === "number" && item.fontSizePx > 0
          ? item.fontSizePx
          : baseFontSize;

      const el = document.createElement("div");
      el.className = "admin-name-label";
      el.textContent = text;
      el.style.fontSize = `${size}px`;

      layer.appendChild(el);
      newRecords.push({ el, world: item.worldPosition });
    }

    multiRecords = newRecords;
    updatePosition();
  }

  function clear() {
    if (singleRecord) {
      singleRecord.el.remove();
      singleRecord = null;
    }
    if (multiRecords.length) {
      for (const rec of multiRecords) {
        rec.el.remove();
      }
      multiRecords = [];
    }
  }

  if (!viewer.__adminNamePostRenderAttached) {
    viewer.__adminNamePostRenderAttached = true;
    viewer.scene.postRender.addEventListener(() => {
      updatePosition();
    });
  }

  return { show, showRegions, clear };
}
