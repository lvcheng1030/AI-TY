#!/usr/bin/env python3
"""台词预渲染脚本 —— 把 content/lines.csv 合成为 assets/voice/{id}.mp3

为什么要预渲染（而不是运行时用 speechSynthesis）：
  1. 零延迟：现场每一句话都要立刻出声，运行时 TTS 有 0.5~2 秒的启动延迟
  2. 断网可用：游园会草坪的网络不可靠，预渲染后完全离线
  3. 音色统一：同一个声音贯穿全场，不会因平台差异变声

运行时 TTS 只留给"回述确认"这类动态内容（见 src/speech/voice.js）。

用法：
    python -m pip install edge-tts          # 首次需要
    python tools/tts_build.py               # 增量构建（已存在且未改动则跳过）
    python tools/tts_build.py --force       # 全部重出
    python tools/tts_build.py --only L_SIGN_01   # 只重出某几条
    python tools/tts_build.py --list        # 只列出会做什么，不真正合成

产物：
    assets/voice/{id}.mp3       每句一个文件，文件名即 id
    assets/voice/manifest.json  文本哈希清单，用于判断是否需要重出
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import pathlib
import sys

# Windows 控制台默认不是 UTF-8，中文输出会变成乱码。
# 队友在 cmd / PowerShell 里跑这个脚本时第一眼就会看到乱码，
# 容易误以为脚本出错，所以在这里显式重新配置输出编码。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass    # 非标准流（如被重定向）时忽略

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
LINES_CSV = ROOT / "content" / "lines.csv"
OUT_DIR = ROOT / "assets" / "voice"
MANIFEST = OUT_DIR / "manifest.json"

# 音色别名 —— 与 lines.csv 的 voice 列对应
VOICES = {
    "xiaoxiao": "zh-CN-XiaoxiaoNeural",   # 女声，温柔，适合叙述
    "xiaoyi":   "zh-CN-XiaoyiNeural",     # 女声，年轻
    "yunxi":    "zh-CN-YunxiNeural",      # 男声，年轻
    "yunjian":  "zh-CN-YunjianNeural",    # 男声，沉稳
}
DEFAULT_VOICE = "xiaoxiao"

# 语速：略慢于默认，纯音频环境下听清比听快重要
RATE = "-8%"


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def read_lines() -> list[dict]:
    """读取台词表。会做三项校验，因为脚本是唯一能发现这些问题的地方。"""
    if not LINES_CSV.is_file():
        sys.exit(f"找不到台词表：{LINES_CSV}")

    rows: list[dict] = []
    seen: set[str] = set()
    problems: list[str] = []

    with LINES_CSV.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        required = {"id", "text", "voice", "scene"}
        if not required.issubset(reader.fieldnames or set()):
            sys.exit(f"台词表缺少必需列。需要 {sorted(required)}，实际 {reader.fieldnames}")

        for n, row in enumerate(reader, start=2):   # 从第 2 行开始（第 1 行是表头）
            line_id = (row.get("id") or "").strip()
            text = (row.get("text") or "").strip()
            voice = (row.get("voice") or "").strip() or DEFAULT_VOICE

            if not line_id:
                problems.append(f"第 {n} 行：id 为空")
                continue
            if not text:
                problems.append(f"第 {n} 行（{line_id}）：text 为空")
                continue
            if line_id in seen:
                problems.append(f"第 {n} 行：id 重复 —— {line_id}")
                continue
            if voice not in VOICES:
                problems.append(f"第 {n} 行（{line_id}）：未知音色 {voice}，可用：{list(VOICES)}")
                continue

            seen.add(line_id)
            rows.append({"id": line_id, "text": text, "voice": voice})

    if problems:
        print("台词表有问题，已中止：", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        sys.exit(1)

    return rows


def load_manifest() -> dict:
    if MANIFEST.is_file():
        try:
            return json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


async def synth_one(row: dict, out_path: pathlib.Path, dry: bool) -> tuple[bool, str]:
    """合成一条。返回 (是否成功, 错误信息)。"""
    if dry:
        return True, ""

    try:
        import edge_tts
    except ImportError:
        return False, "未安装 edge-tts，请先运行：python -m pip install edge-tts"

    voice = VOICES[row["voice"]]

    # 重试：网络抖动在校园网里很常见，一次失败就放弃会让整批白跑
    last_err = ""
    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(row["text"], voice, rate=RATE)
            await communicate.save(str(out_path))
            if out_path.is_file() and out_path.stat().st_size > 0:
                return True, ""
            last_err = "生成的文件为空"
        except Exception as e:                     # noqa: BLE001 - 需要报告任何失败
            last_err = f"{type(e).__name__}: {e}"
        if attempt < 2:
            await asyncio.sleep(1.5 * (attempt + 1))

    return False, last_err


async def main_async(args) -> int:
    rows = read_lines()

    if args.only:
        wanted = set(args.only)
        unknown = wanted - {r["id"] for r in rows}
        if unknown:
            print(f"警告：台词表里没有这些 id：{sorted(unknown)}", file=sys.stderr)
        rows = [r for r in rows if r["id"] in wanted]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()

    todo: list[dict] = []
    for row in rows:
        out_path = OUT_DIR / f"{row['id']}.mp3"
        h = text_hash(row["text"])
        changed = manifest.get(row["id"], {}).get("hash") != h
        exists = out_path.is_file() and out_path.stat().st_size > 0

        if args.force or changed or not exists:
            row["_path"] = out_path
            row["_hash"] = h
            row["_reason"] = ("强制重出" if args.force
                              else ("文本已改" if exists and changed else "缺失"))
            todo.append(row)

    print(f"台词共 {len(rows)} 条，需要合成 {len(todo)} 条"
          + ("（--dry-run，不会真正生成）" if args.dry_run else ""))

    if todo and not args.dry_run:
        print("\n开始合成，请稍候…")

    ok_count = 0
    failures: list[tuple[str, str]] = []

    for i, row in enumerate(todo, start=1):
        ok, err = await synth_one(row, row["_path"], args.dry_run)
        if ok:
            ok_count += 1
            manifest[row["id"]] = {
                "hash": row["_hash"],
                "voice": row["voice"],
                "text": row["text"],
            }
            size = row["_path"].stat().st_size if row["_path"].is_file() else 0
            print(f"  [{i}/{len(todo)}] {row['id']:<16} {row['_reason']:<6} "
                  f"{size/1024:5.1f} KB")
        else:
            failures.append((row["id"], err))
            print(f"  [{i}/{len(todo)}] {row['id']:<16} 失败！ {err}", file=sys.stderr)

    skipped = len(rows) - len(todo)

    if not args.dry_run:
        MANIFEST.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    print("\n完成："
          f"新增/重出 {ok_count} 条，跳过 {skipped} 条，失败 {len(failures)} 条")

    if failures:
        print("\n失败明细：", file=sys.stderr)
        for line_id, err in failures:
            print(f"  {line_id}: {err}", file=sys.stderr)
        return 1

    # 体积检查：语音要入库，总量需要控制
    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.mp3"))
    print(f"assets/voice 总体积：{total/1024/1024:.2f} MB（{len(list(OUT_DIR.glob('*.mp3')))} 个文件）")
    if total > 20 * 1024 * 1024:
        print("警告：语音总量超过 20 MB，请考虑降低数量或比特率。", file=sys.stderr)

    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="把 lines.csv 合成为预渲染语音")
    ap.add_argument("--force", action="store_true", help="全部重出，忽略缓存")
    ap.add_argument("--only", nargs="+", metavar="ID", help="只处理指定 id")
    ap.add_argument("--dry-run", action="store_true", help="只报告会做什么，不实际生成")
    ap.add_argument("--list", action="store_true", help="同 --dry-run")
    args = ap.parse_args()

    if args.list:
        args.dry_run = True

    try:
        return asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print("\n已中断。已生成的条目会在下次运行时被识别为完成。", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
