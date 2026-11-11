# GollaEat

- `FE/`: React + TypeScript + Vite
- `BE/`: Django 5.2 LTS + SQLite (로컬 개발)
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
