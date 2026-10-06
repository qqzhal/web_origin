#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动更新页面/脚本里 js/css 引用的版本号（浏览器缓存强制刷新）。

扫描 HTML 的 <script src> / <link href> 属性，以及 JS 文件里
单引号/双引号字符串中的本地 .js/.css 相对路径引用（如动态加载脚本），
用文件内容的 MD5 前 8 位作为版本参数写入 ?v=xxxx：
  - 文件改过 -> hash 变 -> URL 变 -> 浏览器强制重新下载
  - 文件没改 -> hash 不变 -> 浏览器缓存继续命中
只改内容的文件才更新对应引用，无需手动记版本号。

默认处理 emu/index.html 和 emu/js/afunction.js（后者含 initHookScripts
动态加载的 hook/ramwatch.js、hook/ct2_recorder.js）。

用法（在本目录打开终端，或双击 update_versions.bat）：
  python bump_versions.py                    # 处理默认文件
  python bump_versions.py 文件1 文件2        # 处理指定 html/js 文件

处理完把 emu 目录传到服务器即可（脚本本身在 web/scripts，不用上传）。
"""
import hashlib
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
EMU_DIR = SCRIPT_DIR.parent / "emu"
# 默认处理清单：先 js 后 html（afunction.js 更新后，index.html 里它的引用 hash 才是最终值）
DEFAULT_FILES = [EMU_DIR / "js" / "afunction.js", EMU_DIR / "index.html"]

# HTML：匹配 src="..." 或 href="..."，捕获属性前缀、路径、?版本参数、闭合引号
ATTR_RE = re.compile(r'((?:src|href)\s*=\s*["\'])([^"\']+?)(\?[^"\']*)?(["\'])', re.I)
# JS：匹配单/双引号字符串里的路径（initHookScripts 动态加载等场景）
JS_STR_RE = re.compile(r'(["\'])([^\'"\s]+?)(\?[^\'"\s]*)?\1')

EXTERNAL_RE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|data:|#)", re.I)  # 外链/data/锚点
LOCAL_EXT = (".js", ".css")  # 只处理这两类静态资源


def file_version(path: Path) -> str:
    """文件内容的 MD5 前 8 位作为版本号。"""
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]


def process_file(path: Path) -> None:
    is_js = path.suffix.lower() == ".js"
    text = path.read_text(encoding="utf-8")
    pattern = JS_STR_RE if is_js else ATTR_RE
    base_candidates = [path.parent, path.parent.parent] if is_js else [path.parent]
    changed, unchanged, missing = [], 0, []

    def repl(m):
        nonlocal unchanged
        if is_js:
            prefix = suffix = m.group(1)
            url, query = m.group(2), m.group(3)
        else:
            prefix, url, query, suffix = m.groups()
        if EXTERNAL_RE.match(url):
            return m.group(0)
        if not url.lower().endswith(LOCAL_EXT):
            return m.group(0)
        # JS 里的相对路径由“加载它的页面”解析，基准是页面目录而非 JS 自身目录；
        # 依次尝试 JS 所在目录和其上级目录（覆盖 emu/js 里的脚本引用 emu/ 下资源的场景）
        local = next((b / url for b in base_candidates if (b / url).is_file()), None)
        if local is None:
            missing.append(url)
            return m.group(0)
        new_v = file_version(local)
        old_v = (query or "").lstrip("?").lstrip("v=").lstrip("=") or "无"
        if query == f"?v={new_v}":
            unchanged += 1
            return m.group(0)
        changed.append((url, old_v, new_v))
        return f"{prefix}{url}?v={new_v}{suffix}"

    new_text = pattern.sub(repl, text)

    if changed:
        path.write_text(new_text, encoding="utf-8")
    print(f"\n{path}")
    if changed:
        print(f"  已更新 {len(changed)} 个引用的版本号:")
        for url, old, new in changed:
            print(f"    {url}  {old} -> {new}")
    else:
        print("  所有引用的版本号已是最新，无需改动")
    if unchanged:
        print(f"  {unchanged} 个引用内容未变，保持原版本号")
    for url in missing:
        print(f"  [警告] 引用的文件不存在，已跳过: {url}")


def main() -> None:
    files = [Path(a) for a in sys.argv[1:]] if len(sys.argv) > 1 else DEFAULT_FILES
    for f in files:
        if f.is_file():
            process_file(f)
        else:
            print(f"[错误] 找不到文件: {f}")


if __name__ == "__main__":
    main()
