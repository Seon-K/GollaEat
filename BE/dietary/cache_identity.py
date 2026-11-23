"""Non-authenticating, opaque session marker for clearing browser query caches."""
from django.utils.crypto import salted_hmac


def cache_identity(request):
    owner = request.session.get('dietary_owner')
    return salted_hmac('gollaeat.query-cache', owner).hexdigest() if owner else None


class CacheIdentityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            identity = cache_identity(request)
            if identity:
                response['X-GollaEat-Session'] = identity
            # Personalized API responses must not be reused across browser sessions.
            response['Cache-Control'] = 'private, no-store'
        return response
