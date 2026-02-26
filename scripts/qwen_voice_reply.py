#!/usr/bin/env python3
"""
qwen_voice_reply.py — Qwen3-TTS voice synthesis for open-yachiyo.

Generates an ogg audio file from text using Alibaba Cloud DashScope TTS API.
Outputs the local ogg file path to stdout (or JSON manifest with --emit-manifest).

Requirements:
  pip install dashscope
  ffmpeg (in PATH)

Environment:
  DASHSCOPE_API_KEY  — DashScope API key (required)
"""
import argparse
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Optional

DEFAULT_MODEL = "qwen3-tts-vc-2026-01-22"
DEFAULT_VOICE = "qwen-tts-vc-yachiyo-voice-20260224022238839-5679"
MIN_AUDIO_BYTES = 1024

VOICE_TAG_MAP = {
    "jp": ("Japanese", "自然で親しみやすい日本語で話してください。"),
    "zh": ("Chinese", "自然で聞き取りやすい中国語で話してください。"),
    "en": ("English", "Speak in clear and natural English."),
}


def ensure_dashscope():
    try:
        import dashscope  # type: ignore
        dashscope.base_http_api_url = "https://dashscope-intl.aliyuncs.com/api/v1"
        return dashscope
    except ImportError as e:
        raise RuntimeError(
            "dashscope not installed. Run: pip install dashscope"
        ) from e


def _extract_audio_url(resp) -> Optional[str]:
    output = resp.output if hasattr(resp, "output") else {}
    if isinstance(output, dict):
        return (output.get("audio") or {}).get("url")
    return output.audio.get("url") if getattr(output, "audio", None) else None


def _download_with_retry(url: str, out_file: Path, retries: int = 3) -> None:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    last_err: Optional[Exception] = None
    for i in range(retries):
        try:
            urllib.request.urlretrieve(url, str(out_file))
            if not out_file.exists() or out_file.stat().st_size < MIN_AUDIO_BYTES:
                raise RuntimeError(
                    f"Downloaded audio too small ({out_file.stat().st_size if out_file.exists() else 0} bytes)"
                )
            return
        except Exception as e:
            last_err = e
            if i < retries - 1:
                time.sleep(0.8 * (i + 1))
    raise RuntimeError(f"Audio download failed after {retries} retries: {last_err}")


def synthesize(text: str, model: str, voice: str, api_key: str, out_audio: Path, voice_tag: str) -> None:
    dashscope = ensure_dashscope()
    language_type, default_instruction = VOICE_TAG_MAP[voice_tag]

    payload = {
        "model": model,
        "api_key": api_key,
        "text": text,
        "voice": voice,
        "stream": False,
        "language_type": language_type,
    }
    if "instruct" in model:
        payload["instructions"] = default_instruction
        payload["optimize_instructions"] = True

    resp = dashscope.MultiModalConversation.call(**payload)
    url = _extract_audio_url(resp)
    if not url:
        raise RuntimeError(f"Synthesis failed, no audio URL in response: {resp}")
    _download_with_retry(url, out_audio)


def to_ogg(in_audio: Path, out_ogg: Path) -> None:
    out_ogg.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-i", str(in_audio),
        "-c:a", "libopus", "-b:a", "32k", "-vbr", "on", "-ac", "1", "-ar", "48000",
        str(out_ogg),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg transcode failed: {proc.stderr.strip()}")
    if not out_ogg.exists() or out_ogg.stat().st_size < MIN_AUDIO_BYTES:
        raise RuntimeError(f"Transcoded audio too small ({out_ogg.stat().st_size if out_ogg.exists() else 0} bytes)")


def main() -> None:
    p = argparse.ArgumentParser(description="Qwen3-TTS voice synthesis — outputs ogg file path")
    p.add_argument("text", help="Text to synthesize")
    p.add_argument("--voice-tag", choices=sorted(VOICE_TAG_MAP.keys()), required=True,
                   help="Language tag: jp | zh | en")
    p.add_argument("--voice", default=DEFAULT_VOICE)
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--out", default="", help="Output ogg path (auto-generated if omitted)")
    p.add_argument("--emit-manifest", action="store_true",
                   help="Output JSON manifest instead of plain path")
    args = p.parse_args()

    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY environment variable is required")

    with tempfile.TemporaryDirectory(prefix="yachiyo-tts-") as td:
        tmp_audio = Path(td) / "tts_raw.bin"
        out_ogg = Path(args.out) if args.out else Path(tempfile.gettempdir()) / f"yachiyo-voice-{os.getpid()}-{int(time.time())}.ogg"

        synthesize(args.text, args.model, args.voice, api_key, tmp_audio, args.voice_tag)
        to_ogg(tmp_audio, out_ogg)

    if args.emit_manifest:
        print(json.dumps({
            "audio_path": str(out_ogg),
            "tts_input_text": args.text,
            "voice_tag": args.voice_tag,
            "model": args.model,
            "voice": args.voice,
        }, ensure_ascii=False))
    else:
        print(str(out_ogg))


if __name__ == "__main__":
    main()
