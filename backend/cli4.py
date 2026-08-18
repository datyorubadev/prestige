import sys

LOG = r"C:\Users\admin\AppData\Local\Temp\cli4.log"

sys.argv = [r"C:\Users\admin\Documents\Final Year Project\prestige\backend\.venv\Lib\site-packages\uvicorn\__main__.py",
            "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--app-dir", "."]

log = open(LOG, "w")


def D(m):
    log.write(m + "\n")
    log.flush()


D("start argv0=" + repr(sys.argv[0]))
try:
    import uvicorn
    D("uvicorn imported")
    from uvicorn.main import main
    D("calling main()")
    main()
    D("main returned")
except BaseException as e:
    D("EXC " + type(e).__name__ + ": " + str(e)[:200])
log.close()
