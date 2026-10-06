@echo off
rem 切到 bat 所在目录（快捷方式启动时工作目录不一定是这里）
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
python bump_versions.py
rem 正常结束直接关窗；出错时暂停窗口，让错误信息能被看到
if errorlevel 1 (
  echo.
  echo 执行出错，请检查上方提示（常见原因：python 未安装或不在 PATH）。
  pause
)
