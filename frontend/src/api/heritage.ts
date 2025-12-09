// src/api/heritage.ts
// 국가유산청 OpenAPI 헬퍼 (목록→후보 고르기→상세)

export const ctcdBySidoName: Record<string, string> = {
  "서울특별시": "11", "부산광역시": "21", "대구광역시": "22", "인천광역시": "23",
  "광주광역시": "24", "대전광역시": "25", "울산광역시": "26", "세종특별자치시": "45",
  "경기도": "31", "강원특별자치도": "32", "강원도": "32",
  "충청북도": "33", "충청남도": "34",
  "전북특별자치도": "35", "전라북도": "35", "전라남도": "36",
  "경상북도": "37", "경상남도": "38",
  "제주특별자치도": "50", "전국일원": "ZZ",
};

// 유틸
const norm = (s: string) =>
  (s || "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();

const nameScore = (q: string, t: string) => {
  const Q = norm(q), T = norm(t);
  if (!Q || !T) return 0;
  if (Q === T) return 100;
  if (T.includes(Q)) return 80;
  if (Q.includes(T)) return 70;
  const minLen = Math.min(Q.length, T.length);
  const common = [...Q].filter(c => T.includes(c)).length;
  return Math.round((common / Math.max(1, minLen)) * 60); // 0~60
};

const toNumber = (v?: string | null) =>
  v && v.trim() !== "" ? Number(v) : NaN;

export type Detail = {
  title: string;
  kind: string;
  sido?: string;
  admin?: string;
  desc?: string;
  image?: string;
  lon?: number;
  lat?: number;
  asno?: string;
};

//  목록/상세 호출
async function fetchListXML(kdcd: string, ctcd: string, name: string) {
  const qs = new URLSearchParams({
    ccbaKdcd: kdcd || "",
    ccbaCtcd: ctcd || "",
    ccbaMnm1: name || "",
    pageNo: "1",
    numOfRows: "50",
  }).toString();

  const url = `https://www.khs.go.kr/cha/SearchKindOpenapiList.do?${qs}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`List ${r.status}`);
  return await r.text();
}

async function fetchDetailXMLViaProxy(kdcd: string, asno: string, ctcd: string) {
  // 프록시에는 kdcd/asno/ctcd 키로 통일
  const qs = new URLSearchParams({ kdcd, asno, ctcd }).toString();
  const url = `/api/heritage/detail?${qs}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Detail ${r.status}`);
  return await r.text();
}

function parseDetailFromXML(xml: string): Detail {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const get = (t: string) => doc.querySelector(t)?.textContent?.trim() || "";
  const lon = toNumber(get("longitude"));
  const lat = toNumber(get("latitude"));
  return {
    title: get("ccbaMnm1"),
    kind:  get("ccmaName"),
    sido:  get("ccbaCtcdNm") || undefined,
    admin: get("ccbaAdmin") || undefined,
    desc:  get("content") || get("ccbaCn") || undefined,
    image: get("imageUrl") || undefined,
    lon:   isNaN(lon) ? undefined : lon,
    lat:   isNaN(lat) ? undefined : lat,
  };
}

function haversineKm(ax: number, ay: number, bx: number, by: number) {
  const R = 6371;
  const dLat = ((by - ay) * Math.PI) / 180;
  const dLon = ((bx - ax) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((ay * Math.PI) / 180) *
      Math.cos((by * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 후보 중 최적 상세 고르기
export async function findBestDetail(
  kdcd: string,
  ctcd: string,
  name: string,
  clickedLonLat: [number, number],
): Promise<Detail> {
  // 1. 목록(후보들)
  const listXML = await fetchListXML(kdcd, ctcd, name);
  const listDoc = new DOMParser().parseFromString(listXML, "application/xml");
  const items = Array.from(listDoc.getElementsByTagName("item"));
  if (items.length === 0) throw new Error("목록 결과 없음");

  // 2. 이름 유사도 상위 5개만 상세 조회
  const candidates = items
    .map((it) => {
      const get = (t: string) =>
        it.getElementsByTagName(t)[0]?.textContent?.trim() || "";

      const asno = get("ccbaAsno");
      const title = get("ccbaMnm1");

      const itemKdcd = get("ccbaKdcd");
      const itemCtcd = get("ccbaCtcd");

      const prelim = nameScore(name, title);
      return { asno, title, prelim, itemKdcd, itemCtcd };
    })
    .sort((a, b) => b.prelim - a.prelim)
    .slice(0, 5);

  const scored: Array<{ d: Detail; score: number; asno: string }> = [];

  for (const c of candidates) {
    if (!c.asno) continue;

    const useKdcd = kdcd || c.itemKdcd;
    const useCtcd = ctcd || c.itemCtcd;

    const detailXML = await fetchDetailXMLViaProxy(useKdcd, c.asno, useCtcd);
    const d = parseDetailFromXML(detailXML);

    let s = nameScore(name, d.title); // 0~100
    if (d.lon !== undefined && d.lat !== undefined) {
      const dist = haversineKm(clickedLonLat[0], clickedLonLat[1], d.lon, d.lat);
      if (dist <= 0.5) s += 40;
      else if (dist <= 1) s += 30;
      else if (dist <= 3) s += 15;
      else if (dist <= 5) s += 5;
      else if (dist <= 10) s += 1;
    }
    scored.push({ d, score: s, asno: c.asno });
  }

  if (scored.length === 0) throw new Error("후보 상세 평가 실패");

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return { ...best.d, asno: best.asno };
}
