"""운영 DB와 분리된 로컬·CI PostgreSQL 테스트 설정"""
import os

from .settings import *  # noqa: F403

DEBUG = True
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'gollaeat_test_base',
        'USER': 'gollaeat_test',
        'PASSWORD': 'local-test-only',
        'HOST': '127.0.0.1',
        'PORT': os.getenv('POSTGRES_TEST_PORT', '55432'),
        'CONN_MAX_AGE': 0,
        'OPTIONS': {'sslmode': 'disable', 'connect_timeout': 5},
        'TEST': {'NAME': 'test_gollaeat'},
    },
}
CATALOG_MENU_CSV = ''
CATALOG_FINAL_CSV = ''
CATALOG_RESTAURANT_CSV = ''
CATALOG_COORDINATE_CSVS = ()
CATALOG_COORDINATE_VALIDATION_CSV = ''
