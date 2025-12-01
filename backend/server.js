// backend/server.js  (Node 18+ : 전역 fetch 사용)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const app = express();

// JSON 파싱 미들웨어 추가
app.use(express.json());

// Vite 개발 서버(5173)에서 호출 허용
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));

// PostgreSQL 연결 설정
// 환경변수가 있으면 우선 사용, 없으면 제공된 기본값 사용
const dbConfig = {
  host: process.env.POSTGRES_HOST || process.env.POSTGIS_HOST || "34.64.132.12",
  port: parseInt(
    process.env.POSTGRES_PORT || process.env.POSTGIS_PORT || "5432"
  ),
  database: process.env.POSTGRES_DB || "postgres",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASS || "Sbsj123!",
};

const pool = new Pool(dbConfig);

// PostgreSQL 연결 테스트
pool.on("connect", () => {
  // PostgreSQL 연결 성공
});

pool.on("error", (err, client) => {
  console.error("❌ PostgreSQL connection error:", err.message);
  console.error("Error code:", err.code);
});

// 서버 시작 시 연결 테스트
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ PostgreSQL 연결 실패:", err.message);
    console.error("연결 설정을 확인하세요:", dbConfig);
  } else {
  }
});

// GeoServer 프록시 설정
const GEOSERVER_BASE = "http://34.47.92.35/geoserver";

app.use("/api/geoserver", async (req, res) => {
  try {
    const targetUrl = GEOSERVER_BASE + req.url;

    const r = await fetch(targetUrl);

    const ct = r.headers.get("content-type");
    if (ct) res.set("Content-Type", ct);

    const buf = Buffer.from(await r.arrayBuffer());
    res.status(r.status).send(buf);
  } catch (e) {
    console.error("GeoServer proxy error:", e);
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/heritage/detail", async (req, res) => {
  try {
    const kdcd = (req.query.kdcd || req.query.ccbaKdcd || "").trim();
    const asno = (req.query.asno || req.query.ccbaAsno || "").trim();
    const ctcd = (req.query.ctcd || req.query.ccbaCtcd || "").trim();

    if (!kdcd || !asno || !ctcd) {
      return res.status(400).json({ error: "missing kdcd/asno/ctcd" });
    }

    const qs = new URLSearchParams({
      ccbaKdcd: kdcd,
      ccbaAsno: asno,
      ccbaCtcd: ctcd,
    }).toString();

    const url = `https://www.khs.go.kr/cha/SearchKindOpenapiDt.do?${qs}`;
    const r = await fetch(url);
    const xml = await r.text();

    res.set("Content-Type", "application/xml; charset=utf-8");
    return res.status(200).send(xml);
  } catch (e) {
    return res.status(500).json({ error: String(e.message) });
  }
});

// 검색 API: sbsj 스키마의 모든 테이블에서 '국가유산명' 컬럼 검색
app.get("/api/search/heritage", async (req, res) => {
  try {
    const keyword = (req.query.keyword || "").trim();

    if (!keyword) {
      return res.status(400).json({ error: "검색 키워드가 필요합니다" });
    }

    // sbsj 스키마의 모든 테이블 목록 가져오기
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'sbsj'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const tablesResult = await pool.query(tablesQuery);
    const tables = tablesResult.rows.map((row) => row.table_name);

    if (tables.length === 0) {
      return res.json({ results: [], total: 0 });
    }

    // 각 테이블에서 '국가유산명' 컬럼이 있는지 확인하고 검색
    const allResults = [];

    for (const tableName of tables) {
      try {
        // 테이블 이름 안전하게 이스케이프 (특수 문자 방지)
        const safeTableName = tableName.replace(/"/g, '""');

        // 테이블에 '국가유산명' 컬럼이 있는지 확인
        const columnCheckQuery = `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'sbsj' 
          AND table_name = $1 
          AND column_name = '국가유산명'
        `;

        const columnCheck = await pool.query(columnCheckQuery, [tableName]);

        if (columnCheck.rows.length > 0) {
          // 해당 컬럼이 있으면 부분 검색 실행 (ILIKE 사용)
          // geom 컬럼을 GeoJSON으로 변환하고, 좌표도 직접 추출 (POINT의 경우)
          const searchQuery = `
            SELECT 
              *,
              CASE 
                WHEN geom IS NOT NULL 
                THEN ST_AsGeoJSON(geom)::json 
                ELSE NULL 
              END as geom_json,
              CASE
                WHEN geom IS NOT NULL AND ST_GeometryType(geom) = 'ST_Point'
                THEN ST_Y(geom)
                ELSE NULL
              END as lat,
              CASE
                WHEN geom IS NOT NULL AND ST_GeometryType(geom) = 'ST_Point'
                THEN ST_X(geom)
                ELSE NULL
              END as lon
            FROM sbsj."${safeTableName}"
            WHERE "국가유산명" ILIKE $1
          `;

          // ILIKE로 대소문자 구분 없이 부분 검색 (%keyword%)
          const searchPattern = `%${keyword}%`;
          const searchResult = await pool.query(searchQuery, [searchPattern]);

          if (searchResult.rows.length > 0) {
            // 각 결과에 소스 테이블 정보 추가
            // geom_json이 없을 경우를 대비해 geom 원본도 함께 반환
            const resultsWithTable = searchResult.rows.map((row) => {
              return {
                ...row,
                source_table: tableName,
              };
            });
            allResults.push(...resultsWithTable);
          }
        }
      } catch (tableError) {
        // 특정 테이블에서 오류가 발생해도 다른 테이블 검색 계속
        console.error(`Table ${tableName} search error:`, tableError.message);
        console.error(`Error details:`, tableError);
      }
    }

    return res.json({ results: allResults, total: allResults.length });
  } catch (e) {
    console.error("Search API error:", e);
    console.error("Error stack:", e.stack);
    return res.status(500).json({
      error: String(e.message),
      details: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {});
