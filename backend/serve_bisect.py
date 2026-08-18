import asyncio
import sys

LOG = r"C:\Users\admin\AppData\Local\Temp\serve.log"

log = open(LOG, "w")


def D(m):
    log.write(m + "\n")
    log.flush()


sys.path.insert(0, ".")
D("path0=" + repr(sys.path[0]))
try:
    import uvicorn
    D("uvicorn ok " + uvicorn.__version__)
    from uvicorn.config import Config
    from uvicorn.server import Server
    D("imports done")
    cfg = Config("app.main:app", host="127.0.0.1", port=8000)
    D("config created")
    cfg.load()
    D("config.load ok")
    srv = Server(cfg)
    D("server created")
    asyncio.run(srv.serve())
    D("serve returned")
except BaseException as e:
    D("EXC " + type(e).__name__ + ": " + str(e)[:300])
log.close()
