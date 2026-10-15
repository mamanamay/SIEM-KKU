from starlette.responses import JSONResponse


class RequestAdmission:
    """No waiting tasks with uploaded bodies; hold a slot through response send."""
    def __init__(self, app, limit=4):
        self.app, self.limit = app, limit
        self.active = self.rejected = 0

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] not in ('POST', 'PUT', 'PATCH'):
            return await self.app(scope, receive, send)
        if self.active >= self.limit:
            self.rejected += 1
            return await JSONResponse({'detail': 'Detection capacity full; retry later'}, 503,
                                      headers={'Retry-After': '2'})(scope, receive, send)
        self.active += 1
        try:
            return await self.app(scope, receive, send)
        finally:
            self.active -= 1
