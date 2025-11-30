import * as Cesium from "cesium";

/**
 * 선택된 kr_admin1 중심 위에 텍스트만 띄워주는 경량 오버레이
 * - 배경 없음, 글자만 보이도록 처리
 * - viewer.scene.postRender 에서 화면 좌표 갱신
 */
export function createAdminNameOverlay(viewer) {
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
        font: 700 35px 'Noto Sans KR', system-ui, sans-serif;
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

  let record = null; // { el, world }

  function updatePosition() {
    if (!record) return;

    const { el, world } = record;
    const win = viewer.scene.cartesianToCanvasCoordinates(world, scratch);
    if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
      el.style.display = "none";
      return;
    }

    const w = el.offsetWidth || 0;
    const h = el.offsetHeight || 0;

    // 월드 포인트(win.x, win.y)를 텍스트의 하단 중앙
    const left = win.x - w / 2; // 가운데 = 전체 너비의 절반만큼 왼쪽으로
    const top = win.y - h;      // 하단 = 전체 높이만큼 위로

    el.style.display = "block";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function show(worldPosition, text) {
    clear();
    if (!worldPosition) return;

    const el = document.createElement("div");
    el.className = "admin-name-label";
    el.textContent = text ?? "";
    layer.appendChild(el);

    record = { el, world: worldPosition };
    updatePosition();
  }

  function clear() {
    if (record) {
      record.el.remove();
      record = null;
    }
  }

  if (!viewer.__adminNamePostRenderAttached) {
    viewer.__adminNamePostRenderAttached = true;
    viewer.scene.postRender.addEventListener(() => {
      updatePosition();
    });
  }

  return { show, clear };
}
