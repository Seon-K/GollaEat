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

## BE 배포 (Render + Supabase)

배포 설정은 `develop`에서 검증한 뒤 `main`에 병합합니다. Render는 `main`을
배포하도록 연결합니다. 아래 설정은 Render 대시보드에 직접 입력하며,
`.env` 파일을 만들거나 수정할 필요는 없습니다.

### 서비스

GitHub 저장소를 연결해 Python Web Service를 생성합니다.

| 항목 | 값 |
| --- | --- |
| Branch | `main` |
| Root Directory | `BE` |
| Python version | `PYTHON_VERSION` 환경변수에 로컬과 동일한 Python 3.12 패치 버전 지정 |
| Build Command | `pip install -r requirements.txt && python manage.py collectstatic --noinput` |
| Start Command | `python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --access-logfile - --error-logfile -` |
| Health Check Path | `/api/health/` |
| Auto-Deploy | `main` 커밋 시 자동 배포 |

Supabase에 DB를 저장하므로 Render Free에서도 SQLite용 영구 디스크가 필요 없습니다.
Free 서비스의 절전 및 사용량 제한은 별도로 적용됩니다.

### Render 환경변수

| 이름 | 값 |
| --- | --- |
| `DJANGO_DEBUG` | `false` |
| `DJANGO_SECRET_KEY` | 별도로 생성한 운영 비밀키 |
| `DJANGO_ALLOWED_HOSTS` | 실제 Render 호스트명 (예: `gollaeat-be.onrender.com`, 프로토콜 제외) |
| `DATABASE_URL` | Supabase Session pooler의 실제 PostgreSQL URI (비밀번호 포함) |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 프론트 연결 후 필요한 실제 HTTPS origin을 쉼표로 구분하여 등록 (예: `https://gollaeat.vercel.app`) |

`DJANGO_CSRF_TRUSTED_ORIGINS`는 브라우저의 POST 요청 등에서 신뢰할 origin 설정이며,
CORS 허용이나 CSRF 토큰 전달을 대신하지 않습니다. 로그인과 프론트 연결 시 별도로 검증합니다.
운영에서는 HTTPS 리다이렉트와 Secure 쿠키를 사용합니다. 프록시 HTTPS 판별 설정은
Render처럼 `X-Forwarded-Proto`를 제어하는 신뢰할 수 있는 프록시 뒤에서 사용합니다.

PowerShell에서 비밀키 생성 (저장소 루트에서 실행):

```powershell
.\BE\.venv\Scripts\python.exe -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

비밀키는 Render 환경변수에만 등록하고 Git에 올리지 않습니다.

### 테이블 생성과 배포 확인

시작 명령의 `migrate`가 `DATABASE_URL`이 가리키는 Supabase DB에 테이블을 생성합니다.
배포 환경에서는 `DATABASE_URL`을 반드시 등록하고 `SQLITE_PATH`는 제거합니다.
로컬 DB 파일을 업로드하지 않으며 기존 로컬 데이터는 이전되지 않습니다.

새 모델을 추가할 때는 로컬에서 `makemigrations`로 생성한 마이그레이션 파일을 Git에
포함하고, 배포 서버에서는 `migrate`로 적용합니다.

배포 후 `https://<Render 호스트명>/api/health/`에서 HTTP 200과
`{"status":"ok","service":"GollaEat BE"}`를 확인하고, `/admin/`의 CSS도 확인합니다.
현재 health API는 서버 응답만 확인하며 DB 저장/조회까지 검사하지 않습니다.

운영 데이터가 생기면 PostgreSQL 백업을 별도로 생성하고 보관합니다.
코드 재배포와 DB 백업은 별개입니다.

공식 문서: [Django 배포](https://render.com/docs/deploy-django),
[WhiteNoise 설정](https://whitenoise.readthedocs.io/en/stable/django.html).
