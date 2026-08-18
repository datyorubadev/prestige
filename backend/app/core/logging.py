import logging
import uuid

from fastapi import FastAPI, Request, Response


def setup_logging(app: FastAPI) -> None:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("prestige")

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = str(uuid.uuid4())[:12]
        request.state.request_id = request_id
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "%s %s -> %s [%s]", request.method, request.url.path, response.status_code, request_id
        )
        return response
