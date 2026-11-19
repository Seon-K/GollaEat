# GollaEat

- `FE/`: React + TypeScript + Vite
- `BE/`: Django 5.2 LTS + SQLite
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

## BE 배포 (Render + SQLite)

배포 설정은 `develop`에서 검증한 뒤 `main`에 병합합니다. Render는 `main`을
배포하도록 연결합니다. 아래 설정은 Render 대시보드에 직접 입력하며,
`.env` 파일을 만들거나 수정할 필요는 없습니다.

### 서비스 및 영구 디스크

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

영구 디스크를 지원하는 유료 인스턴스에 디스크를 연결하고 Mount Path를
`/var/data`로 설정합니다. 단일 인스턴스로 운영합니다. 디스크를 연결한 서비스는
재배포 중 잠시 중단될 수 있습니다.

### Render 환경변수

| 이름 | 값 |
| --- | --- |
| `DJANGO_DEBUG` | `false` |
| `DJANGO_SECRET_KEY` | 별도로 생성한 운영 비밀키 |
| `DJANGO_ALLOWED_HOSTS` | 실제 Render 호스트명 (예: `gollaeat-be.onrender.com`, 프로토콜 제외) |
| `SQLITE_PATH` | `/var/data/db.sqlite3` |
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

### SQLite 생성과 배포 확인

로컬에서는 기존 `BE/db.sqlite3`를 사용합니다. Render에서는 `SQLITE_PATH`가 가리키는
영구 디스크에 시작 명령의 `migrate`가 DB와 테이블을 생성합니다. 로컬 DB는 업로드하지
않으므로 기존 로컬 데이터는 이전되지 않습니다.

영구 디스크는 Build 및 Pre-Deploy 단계에서 접근할 수 없습니다. SQLite 마이그레이션은
반드시 디스크가 연결된 실행 단계인 Start Command에서 수행합니다.
새 모델을 추가할 때는 로컬에서 `makemigrations`로 생성한 마이그레이션 파일을 Git에
포함하고, 배포 서버에서는 `migrate`로 적용합니다.

배포 후 `https://<Render 호스트명>/api/health/`에서 HTTP 200과
`{"status":"ok","service":"GollaEat BE"}`를 확인하고, `/admin/`의 CSS도 확인합니다.
현재 health API는 서버 응답만 확인하며 DB 저장/조회까지 검사하지 않습니다.

운영 데이터가 생기면 SQLite backup API 또는 `.backup`으로 일관된 백업을 생성하고
서비스 디스크 외부에 보관합니다. 코드 재배포와 DB 백업은 별개입니다.

공식 문서: [Render 영구 디스크](https://render.com/docs/disks),
[Django 배포](https://render.com/docs/deploy-django),
[WhiteNoise 설정](https://whitenoise.readthedocs.io/en/stable/django.html).
