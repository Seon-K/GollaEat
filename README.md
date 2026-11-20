# GollaEat

- `FE/`: React + TypeScript + Vite
- `BE/`: Django 5.2 LTS + SQLite (로컬 기본값) / PostgreSQL (Supabase)
- `AI/`: AI 서비스용 폴더 (추후 구성)

## FE 실행 (PowerShell)

```powershell
cd FE
npm ci
npm run dev
```

http://localhost:5173 에서 확인합니다. `npm run build`로 빌드하고
`npm run preview`로 빌드 결과를 확인할 수 있습니다.

## BE 실행 (별도 PowerShell 터미널)

Python 3.12 기준입니다. 최초 설치 또는 저장소를 새로 받은 경우:

```powershell
cd BE
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
```

개발 서버 실행:

```powershell
.\.venv\Scripts\python.exe manage.py runserver
```

- API 상태: http://127.0.0.1:8000/api/health/
- 관리자: http://127.0.0.1:8000/admin/ (`manage.py createsuperuser`로 계정 생성)
- 설정 검사: `.\.venv\Scripts\python.exe manage.py check`

FE 개발 서버가 `/api` 요청을 BE의 8000 포트로 전달합니다.
FE와 BE를 모두 실행하면 첫 화면에 API 연결 상태가 표시됩니다.
배포 시에는 웹서버에서 `/api`를 BE로 전달하거나 API 주소를 별도로 구성해야 합니다.

## 환경변수

`BE/.env.example`은 설정 예시이며 `.env` 파일을 자동으로 읽지는 않습니다.
PowerShell의 `$env:DJANGO_DEBUG = 'false'`처럼 환경변수를 설정합니다.
로컬 개발 기본값은 DEBUG 활성화입니다. 배포 시 `DJANGO_DEBUG=false`,
별도의 `DJANGO_SECRET_KEY`, 서비스 도메인을 포함한 `DJANGO_ALLOWED_HOSTS`를 설정하세요.
의존성, 가상환경, SQLite DB 및 비밀 환경변수 파일은 Git에서 제외됩니다.

## Supabase PostgreSQL 연결

`DATABASE_URL`이 있으면 PostgreSQL에 연결하고, 없거나 빈 값이면 기존 SQLite를
사용합니다. PostgreSQL 접속 실패 시 SQLite로 자동 전환하지 않습니다.
로컬과 운영 데이터는 별개이며, 기존 SQLite 데이터와 CSV가 자동 이전되지는 않습니다.

1. Supabase에 개발용 Free 프로젝트를 생성하고 DB 비밀번호를 보관합니다.
2. 프로젝트의 **Connect → Session pooler → URI**에서 포트 `5432`의 접속 주소를
   복사합니다. Session pooler는 IPv4 연결을 지원합니다.
3. 주소의 비밀번호 placeholder를 실제 DB 비밀번호로 바꿉니다. 비밀번호의 특수문자는
   URL 인코딩합니다. API URL이나 anon/service-role 키가 아닌 PostgreSQL URI를 사용합니다.
4. 접속 주소를 로컬 터미널 또는 배포 서버의 `DATABASE_URL` 환경변수에 등록합니다.
   `.env`는 자동 로드하지 않으며, 접속 주소와 비밀번호를 Git에 올리지 않습니다.

로컬에서 연결할 경우 PowerShell에서 실행합니다 (실제 URI로 교체):

```powershell
cd BE
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:DATABASE_URL = 'postgresql://USER:URL_ENCODED_PASSWORD@HOST:5432/postgres'
.\.venv\Scripts\python.exe manage.py migrate --noinput
.\.venv\Scripts\python.exe manage.py shell -c "from django.db import connection; connection.ensure_connection(); print(connection.vendor)"
.\.venv\Scripts\python.exe manage.py runserver
```

연결 확인 명령이 `postgresql`을 출력하면 실제 DB 연결에 성공한 것입니다.
`migrate`는 Django 및 dietary 테이블과 초기 데이터를 생성합니다. Supabase에서
동일한 테이블을 수동으로 만들지 않습니다. 개발용과 운영용 프로젝트는 분리하세요.
로컬에서 다시 SQLite를 사용하려면 같은 터미널에서
`Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue`를 실행합니다.

연결은 SSL을 사용하며, 연결 재사용 시간은 60초이고 재사용 시 상태를 확인합니다.
자동 테스트는 운영 DB 대신 SQLite 또는 별도 테스트용 PostgreSQL에서 실행합니다.
Supabase의 DB를 Django 전용으로 사용할 경우 Data API 노출 범위를 점검하고,
사용하지 않는 Data API는 비활성화하거나 해당 테이블에 적절한 RLS/권한을 설정하세요.
CSV 데이터 가져오기와 주기적인 DB 백업은 별도로 구성해야 합니다.

공식 문서: [Supabase DB 연결](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 개발용 배포 (Railway + Supabase)

Railway 프로젝트 하나에 `Frontend`, `Backend` 서비스를 따로 만듭니다.
DB는 개발용 Supabase PostgreSQL을 사용합니다. 외부에 공개하는 개발 서버도
`DJANGO_DEBUG=false`로 실행합니다. 로컬 실행 방식은 그대로 유지합니다.

### 설정 파일

- `BE/Dockerfile`: Python 3.12, 의존성 설치, 정적 파일 수집, Gunicorn 실행.
- `BE/railway.json`: Docker 빌드와 배포 전 DB 마이그레이션.
- `FE/Dockerfile`: Node 22로 React 빌드 후 Caddy로 제공.
- `FE/Caddyfile`: SPA 새로고침 처리와 `/api`, `/admin`, `/static`의 백엔드 전달.
- `FE/railway.json`: Docker 빌드와 프론트 `/healthz` 상태 확인.
- 각 `.dockerignore`: 로컬 환경변수, 의존성, DB 등을 이미지에서 제외.

### 1. 서비스 생성과 저장소 연결

Railway에서 빈 프로젝트와 빈 서비스 두 개를 먼저 만들고 아래 설정을 적용한 뒤
같은 GitHub 저장소를 연결합니다. 환경 이름은 `development`로 지정하세요.

| 항목 | Backend | Frontend |
| --- | --- | --- |
| Root Directory | `/BE` | `/FE` |
| Config File Path | `/BE/railway.json` | `/FE/railway.json` |
| 배포 브랜치 | `develop` | `develop` |
| Region | Singapore | Singapore |
| Watch Paths (선택) | `/BE/**` | `/FE/**` |

Config File Path는 저장소 루트 기준입니다. Build/Start Command는 대시보드에서
별도 지정하지 않습니다. 이전에 입력한 명령이 있다면 제거하고 파일 설정을 사용하세요.
실제 개발 브랜치 이름이 다르면 그 브랜치를 선택합니다.

### 2. Backend 환경변수와 배포

Backend의 Variables에 다음을 등록합니다. `.env` 파일은 자동으로 읽지 않습니다.

| 이름 | 값 |
| --- | --- |
| `DJANGO_DEBUG` | `false` |
| `DJANGO_SECRET_KEY` | 개발 배포 전용으로 생성한 비밀키 |
| `DATABASE_URL` | 개발용 Supabase Session pooler의 PostgreSQL URI |
| `DJANGO_ALLOWED_HOSTS` | Backend의 공개 호스트명, 프로토콜 제외 |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://`를 포함한 Frontend 공개 origin |

Backend에서 Networking → Generate Domain으로 공개 도메인을 생성합니다.
포트를 직접 지정해야 하면 Variables에 `PORT=8000`을 추가하고 도메인의 Target Port도
8000으로 맞춥니다. 생성한 호스트명을 `DJANGO_ALLOWED_HOSTS`에 등록합니다.
Frontend origin은 다음 단계에서 도메인을 만든 후 등록하고 Backend를 재배포합니다.

비밀키 생성 (로컬 저장소 루트):

```powershell
.\BE\.venv\Scripts\python.exe -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

비밀키와 DB URI는 Railway Variables에만 등록하고 Git에 올리지 않습니다.
`DATABASE_URL`은 반드시 등록하고 `SQLITE_PATH`는 사용하지 않습니다.
배포 전 `migrate`가 실행되므로 운영 DB를 연결하지 마세요.
마이그레이션 실패 시 새 배포는 중단됩니다. 로컬 SQLite/CSV 데이터는 자동 이전되지 않습니다.

### 3. Frontend 환경변수와 배포

Frontend Variables에 아래 값을 등록합니다 (서비스 이름이 `Backend`인 경우).

```dotenv
BACKEND_ORIGIN=https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}
```

이 값은 백엔드의 공개 HTTPS 주소이며 경로나 마지막 `/`는 붙이지 않습니다.
직접 `https://백엔드호스트명`을 입력해도 됩니다. 프론트에는 DB URI나 비밀키를 넣지 않습니다.

Frontend에서 Generate Domain으로 공개 주소를 생성합니다. 포트 감지가 안 되면
`PORT=3000`과 Target Port 3000을 지정하세요. 그 주소를 Backend의
`DJANGO_CSRF_TRUSTED_ORIGINS`에 등록합니다 (예: `https://frontend-example.up.railway.app`).
두 서비스를 배포하면 브라우저는 프론트 주소만 사용하고 Caddy가 백엔드로 요청을 전달합니다.
기존 `/api` 상대 주소를 그대로 사용하므로 별도 Vite API 환경변수나 CORS 설정은 필요 없습니다.
CSRF 토큰 전달은 기존 API 규약대로 필요하며 CSRF 검증은 유지합니다.

### 4. 확인

배포 전에 로컬에서 `cd FE; npm run build`와 Django 검사를 실행하세요.

- 프론트 `/`: 화면 표시와 하위 페이지 새로고침 확인.
- 프론트 `/healthz`: HTTP 200과 `ok` (프론트 서버만 확인).
- 프론트 `/api/health/`: HTTP 200과 `{"status":"ok","service":"GollaEat BE"}`.
- 프론트 `/admin/`: 관리자 화면과 CSS 확인.
- `/api/session` 및 프로필 저장 등: 세션 쿠키, CSRF, 실제 DB 조회/저장 확인.

API health는 DB 연결을 검사하지 않습니다. HTTPS 리다이렉트와 Secure 쿠키는 유지합니다.
Backend healthcheck는 기본 설정에서 생략하며 프론트 경유 API와 실제 저장으로 확인합니다.
프론트 healthcheck만 통과해도 백엔드/DB 정상 동작이 보장되지는 않습니다.

이 설정은 개발용 기본 배포입니다. 서비스 생성, 환경변수 입력, GitHub 연결은
Railway 대시보드에서 진행해야 합니다. 저장소 파일 변경만으로 기존 외부 서비스가
삭제되거나 새 서비스가 생성되지는 않습니다.

공식 문서: [모노레포 배포](https://docs.railway.com/deployments/monorepo),
[파일 기반 설정](https://docs.railway.com/config-as-code/reference),
[배포 전 명령](https://docs.railway.com/deployments/pre-deploy-command).
