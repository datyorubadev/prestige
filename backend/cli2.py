import sys

LOG = r"C:\Users\admin\AppData\Local\Temp\cli2.log"

log = open(LOG, "w")


def D(m):
    log.write(m + "\n")
    log.flush()


D("start")
try:
    import uvicorn
    D("uvicorn imported " + uvicorn.__version__)
    D("calling uvicorn.run app_dir='.'")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, app_dir=".", log_level="info")
    D("run returned")
except BaseException as e:
    D("EXC " + type(e).__name__ + ": " + str(e)[:200])
log.close()
