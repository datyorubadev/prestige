import os
import sys

LOG = r"C:\Users\admin\AppData\Local\Temp\replicate2.log"

log = open(LOG, "w")


def D(m):
    log.write(m + "\n")
    log.flush()


D("path0=" + repr(sys.path[0]))
D("cwd=" + repr(os.getcwd()))
sys.path.insert(0, ".")
D("after_insert=" + repr(sys.path[:4]))
try:
    import uvicorn
    D("uvicorn imported " + uvicorn.__version__)
except BaseException as e:
    D("uvicorn FAIL " + repr(e))
try:
    from uvicorn.config import Config
    c = Config("app.main:app", app_dir=".")
    D("Config created")
    c.load()
    D("config.load OK")
except BaseException as e:
    D("config FAIL " + type(e).__name__ + ": " + str(e)[:200])
log.close()
print("DONE", flush=True)
