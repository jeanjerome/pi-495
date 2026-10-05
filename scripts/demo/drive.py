"""Plays the README demonstration in a real pseudo-terminal and records it with asciinema.

Run by scripts/demo/record.sh, which sets the Pi agent directory, the 495 data directory and the
target. The keys are typed one at a time, as a person would, and the run is followed on what Pi
prints: the script waits for the 495 line of the footer to show the change closed or stopped. The
wait itself lasts minutes; once recorded, it is compressed in the cast so that it plays in about
WAIT_PLAYED seconds.

    python3 drive.py <target dir> <output dir>

writes <output dir>/raw.cast, the whole session, and <output dir>/demo.cast, the one to render.
"""

import fcntl
import json
import os
import re
import select
import struct
import subprocess
import sys
import termios
import time

COLS, ROWS = 140, 45
REQUEST = "/495 start add freeMinutes(busy) beside freeSlots: it returns how many minutes of the day no busy slot covers"
STOPPED = re.compile(r"495 [a-z_]+/(completed|blocked|paused|failed|cancelled)|⏸")
WAIT_LIMIT = 25 * 60
WAIT_PLAYED = 15.0
ANSI = re.compile(r"\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[=>78cDEHMZ]")

target, out_dir = sys.argv[1], sys.argv[2]
raw_cast = os.path.join(out_dir, "raw.cast")

master, slave = os.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
env = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor", PS1="$ ")
child = subprocess.Popen(
    ["asciinema", "rec", "-q", "--overwrite", "-f", "asciicast-v2", "-c", "bash --norc --noprofile", raw_cast],
    cwd=target,
    env=env,
    stdin=slave,
    stdout=slave,
    stderr=slave,
    start_new_session=True,
    preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0),
)
os.close(slave)

screen = ""
started = time.time()


def pump(seconds):
    """Reads what the session prints for that long, keeping its recent text without escapes."""
    global screen
    end = time.time() + seconds
    while time.time() < end:
        ready, _, _ = select.select([master], [], [], 0.05)
        if ready:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                return
            screen = (screen + ANSI.sub("", chunk.decode("utf-8", "replace")))[-20000:]


def type_text(text, delay=0.045):
    for ch in text:
        os.write(master, ch.encode())
        pump(delay)


def key(seq, after=0.4):
    os.write(master, seq)
    pump(after)


def command(text, after):
    """A /495 command: typed, its completion list closed with Escape, then sent."""
    type_text(text)
    pump(0.5)
    key(b"\x1b", 0.3)
    key(b"\r", after)


pump(1.5)
type_text("pi")
key(b"\r", 7)
command(REQUEST, 20)

wait_from = time.time() - started
screen = ""
while not STOPPED.search(screen):
    if time.time() - started > WAIT_LIMIT:
        sys.exit(f"the change did not stop within {WAIT_LIMIT // 60} minutes")
    pump(1)
wait_to = time.time() - started
pump(3)

command("/495 status", 7)
command("/495 review", 3)
key(b"\x1b[B", 1)
key(b"\r", 4)
key(b"n", 5)
key(b"q", 1.5)
command("/495 report", 10)
# Ctrl-D on an empty editor quits Pi, then the shell: no text is ever typed that Pi could send to
# the model as a message.
for _ in range(3):
    if child.poll() is None:
        key(b"\x04", 2)
child.wait(timeout=30)

# The wait is compressed in place: its events keep their order and the rest keeps its timing.
with open(raw_cast) as f:
    header, *events = [json.loads(line) for line in f if line.strip()]
factor = WAIT_PLAYED / max(wait_to - wait_from, WAIT_PLAYED)
removed = (wait_to - wait_from) * (1 - factor)
with open(os.path.join(out_dir, "demo.cast"), "w") as f:
    f.write(json.dumps(header) + "\n")
    for t, kind, data in events:
        if t > wait_to:
            t -= removed
        elif t > wait_from:
            t = wait_from + (t - wait_from) * factor
        f.write(json.dumps([round(t, 6), kind, data]) + "\n")
print(f"recorded {raw_cast}; wait of {wait_to - wait_from:.0f} s played in {WAIT_PLAYED:.0f} s")
