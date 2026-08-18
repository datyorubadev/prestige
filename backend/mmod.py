import sys

with open(r"C:\Users\admin\AppData\Local\Temp\opencode\mmod.log", "w") as f:
    f.write("path0=" + repr(sys.path[0]) + "\n")
    f.write("path=" + repr(sys.path[:6]) + "\n")
