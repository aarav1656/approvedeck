#!/usr/bin/env python3
"""Encode the composed frames into demo/approvedeck-demo.mp4.

This ffmpeg has no drawtext and no subtitles filter, so all text is already
burned into the frames by compose2.py. Here we only need variable per-frame
durations, which the concat demuxer gives us: each beat gets a slice of the
narration's runtime so the captions track what is being said.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, "build")
SRC = os.path.join(ROOT, "screencast2")
AUDIO = os.path.join(ROOT, "narration.mp3")
OUTMP4 = os.path.join(ROOT, "approvedeck-demo.mp4")

# Seconds allotted to each beat, summing to the narration runtime (~69.5s).
BEAT_SECONDS = {
    "resting":      6.0,
    "aim-demo":     1.8,
    "click-demo":   2.2,
    "cards-in":     6.0,
    "keyboard-j":   6.0,
    "aim-payload":  2.0,
    "payload-open": 8.0,
    "aim-hold":     2.5,
    "holding":      5.0,
    "approved":     7.0,
    "custody":     11.0,
    "log":         12.0,
}


def main():
    meta = json.load(open(os.path.join(SRC, "beats.json")))
    frames = meta["frames"]

    counts = {}
    for fr in frames:
        counts[fr["beat"]] = counts.get(fr["beat"], 0) + 1

    lines = []
    total = 0.0
    for i, fr in enumerate(frames):
        beat = fr["beat"]
        dur = BEAT_SECONDS.get(beat, 1.0) / counts[beat]
        path = os.path.join(BUILD, "b%04d.png" % i)
        lines.append("file '%s'\nduration %.4f" % (path, dur))
        total += dur
    # the concat demuxer drops the last image without a repeated entry
    lines.append("file '%s'" % os.path.join(BUILD, "b%04d.png" % (len(frames) - 1)))

    listfile = os.path.join(ROOT, "build.concat")
    open(listfile, "w").write("\n".join(lines) + "\n")
    print("frames=%d total=%.2fs" % (len(frames), total))

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listfile,
        "-i", AUDIO,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-vf", "scale=1920:-2",
        "-c:a", "aac", "-b:a", "160k",
        "-shortest", "-movflags", "+faststart",
        OUTMP4,
    ]
    r = subprocess.run(cmd)
    if r.returncode != 0:
        return r.returncode
    print("WROTE", OUTMP4)
    return 0


if __name__ == "__main__":
    sys.exit(main())
