import sys

LOG = r"C:\Users\admin\AppData\Local\Temp\cli3.log"

sys.argv = ["uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--app-dir", "."]

log = open(LOG, "w")


def D(m):
    log.write(m + "\n")
    log.flush()


D("start argv=" + repr(sys.argv[1:]))
try:
    import uvicorn
    D("uvicorn imported " + uvicorn.__version__)
    from uvicorn.main import main
    D("calling main()")
    main()
    D("main returned")
except BaseException as e:
    D("EXC " + type(e).__name__ + ": " + str(e)[:200])
log.close()
