#!/usr/bin/env python3
"""浏览器测试用的本地服务器：静态托管仓库 + 接收测试结果。

为什么需要它：
    用 `msedge --dump-dom` 抓测试结果不可靠 —— DOM 在页面 load 时就转储，
    而异步步骤（fetch、decodeAudioData）还没跑完；
    改用 `--virtual-time-budget` 又会让虚拟时钟快进，真实网络请求来不及完成。

    所以让页面自己把结果 POST 回来，写成文件。这样与转储时机解耦，
    等文件出现即可，测多久都不会误判。

用法：
    python tools/test_serve.py --port 8801 --result .tmp/result.json
"""

from __future__ import annotations

import argparse
import http.server
import json
import pathlib
import socketserver
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULT_PATH = ROOT / ".tmp" / "result.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):                                  # noqa: N802
        if self.path != "/result":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
        try:
            data = json.loads(body.decode("utf-8"))
            RESULT_PATH.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"[test_serve] 结果已写入 {RESULT_PATH}", flush=True)
        except Exception as e:                          # noqa: BLE001
            print(f"[test_serve] 结果解析失败：{e}", file=sys.stderr, flush=True)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def end_headers(self):
        # 测试页面与静态资源同源，但加上 CORS 头以防万一
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 静音常规访问日志，只保留结果写入
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8801)
    ap.add_argument("--result", type=str, default=None)
    args = ap.parse_args()

    global RESULT_PATH
    if args.result:
        p = pathlib.Path(args.result)
        RESULT_PATH = p if p.is_absolute() else (ROOT / p)

    with Server(("127.0.0.1", args.port), Handler) as httpd:
        print(f"[test_serve] 服务于 {ROOT}", flush=True)
        print(f"[test_serve] http://127.0.0.1:{args.port}/", flush=True)
        print(f"[test_serve] 结果文件 {RESULT_PATH}", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
