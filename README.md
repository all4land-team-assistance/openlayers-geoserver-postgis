# 지오스페이셜 웹 애플리케이션

React + OpenLayers + GeoServer + PostGIS 스택을 사용한 지도 기반 웹 애플리케이션

## 🏗️ 프로젝트 구조

```
openlayers-geoserver-postgis/
├── docker-compose.yml          # GeoServer + PostGIS 컨테이너 구성
├── env-variables.txt           # 환경변수 템플릿
├── frontend/                   # React 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   │   └── MapComponent.tsx # OpenLayers 지도 컴포넌트
│   │   ├── App.tsx
│   │   └── App.css
│   └── package.json
├── docker-geoserver/           # GeoServer Docker 서브모듈
└── sample-data/               # 샘플 데이터 디렉토리
```

## 🚀 빠른 시작

### 1. 환경변수 설정

```bash
cp env-variables.txt .env
```

### 2. Docker 서비스 실행

```bash
# GeoServer + PostGIS 실행
docker compose up -d

# 상태 확인
docker compose ps
```

### 3. React 프론트엔드 실행

```bash
cd frontend
npm install
npm install ol @types/ol axios
npm run dev
```

## 📍 접속 정보

| 서비스        | URL                             | 로그인 정보               |
| ------------- | ------------------------------- | ------------------------- |
| **GeoServer** | http://localhost:8080/geoserver | admin / geoserver123!     |
| **React App** | http://localhost:5173           | -                         |
| **PostGIS**   | localhost:5432                  | geoserver / geoserver123! |

## ⚙️ GeoServer 설정

### 1. 워크스페이스 생성

1. GeoServer 관리 페이지 접속 → 로그인
2. 좌측 메뉴: **Data** → **Workspaces**
3. **Add new workspace** 클릭
4. 정보 입력:
   ```
   Name: test
   Namespace URI: http://test.local
   ```
5. **Submit** 클릭

### 2. PostGIS 데이터 스토어 생성

1. 좌측 메뉴: **Data** → **Stores**
2. **Add new Store** → **PostGIS** 선택
3. 연결 정보 입력:
   ```
   Workspace: test
   Data Source Name: postgis_store
   host: postgis
   port: 5432
   database: geoserver_db
   user: geoserver
   passwd: geoserver123!
   ```
4. **Test Connection** → **Save**

### 3. 레이어 발행

1. 좌측 메뉴: **Data** → **Layers**
2. **Add a new layer** → 생성한 데이터스토어 선택
3. 테이블 선택 후 **Publish**

## 🗺️ 지도 컴포넌트 설정

워크스페이스와 레이어를 생성한 후, `frontend/src/components/MapComponent.tsx`에서 다음 부분을 수정:

```typescript
// 수정 전
'LAYERS': 'your_workspace:sample_points'

// 수정 후 (예시: test 워크스페이스, cities 레이어)
'LAYERS': 'test:cities'
```

```typescript
// WFS URL도 동일하게 수정
typename=test:cities
```

## 🛠️ Docker 관리 명령어

```bash
# 서비스 중지
docker compose down

# 로그 확인
docker compose logs

# 특정 서비스 로그
docker compose logs geoserver
docker compose logs postgis

# 볼륨까지 삭제 (데이터 초기화)
docker compose down -v
```

## 🗃️ 데이터 임포트 방법

### QGIS 사용 (GUI)

1. QGIS 설치: https://qgis.org/ko/
2. PostGIS 연결 설정
3. 벡터 레이어 → PostGIS로 내보내기

### 명령줄 도구 (자동화)

```bash
# GDAL 설치
brew install gdal

# SHP → PostGIS
ogr2ogr -f "PostgreSQL" \
  PG:"host=localhost user=geoserver dbname=geoserver_db password=geoserver123!" \
  cultural_heritage.shp -nln cultural_heritage

# GeoJSON → PostGIS
ogr2ogr -f "PostgreSQL" \
  PG:"host=localhost user=geoserver dbname=geoserver_db password=geoserver123!" \
  heritage.geojson -nln heritage_data
```

## 🔧 문제 발생 시 확인

### 포트 충돌

```bash
# 사용 중인 포트 확인
lsof -i :8080
lsof -i :5432

# .env 파일에서 포트 변경
GEOSERVER_PORT=8081
POSTGIS_PORT=5433
```

### CORS 오류

- Docker Compose에서 이미 CORS 설정됨
- 필요시 특정 오리진만 허용하도록 수정 가능

### 데이터 로딩 실패

1. 브라우저 개발자 도구 → Console 탭 확인
2. Network 탭에서 WFS 요청 상태 확인
3. 워크스페이스:레이어명이 정확한지 확인

## 📦 주요 기술 스택

- **Frontend**: React + TypeScript + Vite
- **Map Library**: OpenLayers
- **GIS Server**: GeoServer
- **Database**: PostgreSQL + PostGIS
- **Container**: Docker + Docker Compose

## 🎯 다음 단계

1. **실제 데이터 임포트**: 문화재 공간정보 등
2. **지도 스타일링**: 심볼, 색상, 라벨 설정
3. **상호작용 기능**: 클릭, 팝업, 검색
4. **성능 최적화**: 타일링, 캐싱

---

> **참고**: 현재 MapComponent.tsx의 `your_workspace:sample_points`는 placeholder입니다. 실제 워크스페이스와 레이어를 생성한 후 해당 값으로 변경해야 지도에 데이터가 표시됩니다.
