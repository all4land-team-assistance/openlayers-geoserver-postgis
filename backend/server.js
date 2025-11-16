// backend/server.js  (Node 18+ : 전역 fetch 사용)
const express = require("express");
const cors = require("cors");
const app = express();

// Vite 개발 서버(5173)에서 호출 허용
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));

// GeoServer 프록시 설정
const GEOSERVER_BASE = "http://34.47.71.252/geoserver";

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

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ heritage proxy on http://localhost:${PORT}`);
});
