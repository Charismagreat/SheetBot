#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SheetBot 내 PC 카카오톡 원격 발송 브리지 (Outbound Relay Agent v1.0)
- 외부 라이브러리 설치(pip install)가 전혀 필요 없는 순수 Python 표준 라이브러리(ctypes, urllib) 기반 단일 파일입니다.
- 이용자의 개인/사무실 Windows PC에서 실행해 두면, 외출 중 스마트폰 [시트봇 모바일 앱] AI 비서 카드에서
  [🖥️ 내 PC 카톡으로 자동 발송]을 눌렀을 때 내 PC에 로그인된 카카오톡으로 무포커스(창을 띄우지 않고) 자동 전송합니다.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as W
import json
import os
import socket
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

# 콘솔 한글 깨짐 방지
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# ============================================================================
# 1. Win32 PC 카카오톡 무포커스 제어 엔진 (Puro-33/kakao-autoreply-win 기반)
# ============================================================================
KAKAO_EXE = "kakaotalk.exe"
MAIN_TITLES = ("카카오톡", "KakaoTalk")
MAIN_CLASS = "EVA_Window_Dblclk"
CHAT_WINDOW_CLASSES = ("EVA_Window_Dblclk", "#32770")
INPUT_CLASSES = ("RICHEDIT50W", "RichEdit20W")
SEARCH_EDIT_CLASS = "Edit"
SEARCH_CHAIN = ("EVA_ChildWindow", "EVA_Window", "EVA_Window", SEARCH_EDIT_CLASS)

_good_edit_index: int | None = None

WM_SETTEXT = 0x000C
WM_GETTEXT = 0x000D
WM_GETTEXTLENGTH = 0x000E
WM_CLOSE = 0x0010
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
VK_RETURN = 0x0D
SMTO_ABORTIFHUNG = 0x0002
ENTER_DOWN_LPARAM = 0x001C0001
ENTER_UP_LPARAM = 0xC01C0001
MSG_TIMEOUT_MS = 2000
EM_SETSEL, EM_REPLACESEL = 0x00B1, 0x00C2
SEND_BTN_FROM_RIGHT = 36
SEND_BTN_FROM_BOTTOM = 23
PLACEHOLDERS = ("Enter a message", "메시지 입력", "메시지를 입력하세요")
WM_MOUSEMOVE, WM_LBUTTONDOWN, WM_LBUTTONUP, MK_LBUTTON = 0x0200, 0x0201, 0x0202, 0x0001
GA_ROOT = 2

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

LRESULT = W.LPARAM
ULONG_PTR = ctypes.c_size_t
EnumProc = ctypes.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)

user32.EnumWindows.argtypes = [EnumProc, W.LPARAM]
user32.EnumChildWindows.argtypes = [W.HWND, EnumProc, W.LPARAM]
user32.GetClassNameW.argtypes = [W.HWND, W.LPWSTR, ctypes.c_int]
user32.GetWindowTextW.argtypes = [W.HWND, W.LPWSTR, ctypes.c_int]
user32.GetWindowTextLengthW.argtypes = [W.HWND]
user32.IsWindowVisible.argtypes = [W.HWND]
user32.IsWindow.argtypes = [W.HWND]
user32.IsIconic.argtypes = [W.HWND]
user32.ShowWindow.argtypes = [W.HWND, ctypes.c_int]
user32.GetForegroundWindow.restype = W.HWND
user32.SetForegroundWindow.argtypes = [W.HWND]
user32.IsHungAppWindow.argtypes = [W.HWND]
user32.GetWindowThreadProcessId.argtypes = [W.HWND, ctypes.POINTER(W.DWORD)]
user32.GetWindowThreadProcessId.restype = W.DWORD
user32.FindWindowExW.argtypes = [W.HWND, W.HWND, W.LPCWSTR, W.LPCWSTR]
user32.FindWindowExW.restype = W.HWND
user32.GetParent.argtypes = [W.HWND]
user32.GetParent.restype = W.HWND
user32.PostMessageW.argtypes = [W.HWND, W.UINT, W.WPARAM, W.LPARAM]
user32.SendMessageTimeoutW.argtypes = [
    W.HWND, W.UINT, W.WPARAM, W.LPARAM, W.UINT, W.UINT, ctypes.POINTER(ULONG_PTR)
]
user32.SendMessageTimeoutW.restype = LRESULT
user32.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
user32.GetDpiForWindow.argtypes = [W.HWND]
user32.GetDpiForWindow.restype = W.UINT
user32.GetClientRect.argtypes = [W.HWND, ctypes.POINTER(W.RECT)]
user32.GetAncestor.argtypes = [W.HWND, W.UINT]
user32.GetAncestor.restype = W.HWND
kernel32.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
kernel32.OpenProcess.restype = W.HANDLE
kernel32.QueryFullProcessImageNameW.argtypes = [W.HANDLE, W.DWORD, W.LPWSTR, ctypes.POINTER(W.DWORD)]
kernel32.CloseHandle.argtypes = [W.HANDLE]

_LOCK = threading.Lock()
_exe_cache: dict[int, str] = {}


class KakaoWindowError(RuntimeError):
    pass


def class_name(hwnd: int) -> str:
    buf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buf, 256)
    return buf.value


def window_title(hwnd: int) -> str:
    n = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return buf.value


def window_pid(hwnd: int) -> int:
    pid = W.DWORD(0)
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid.value


def process_exe(pid: int) -> str:
    if pid in _exe_cache:
        return _exe_cache[pid]
    name = ""
    h = kernel32.OpenProcess(0x1000, False, pid)
    if h:
        try:
            buf = ctypes.create_unicode_buffer(1024)
            size = W.DWORD(1024)
            if kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                name = os.path.basename(buf.value).lower()
        finally:
            kernel32.CloseHandle(h)
    if name:
        _exe_cache[pid] = name
    return name


def top_windows() -> list[int]:
    out: list[int] = []

    def cb(h, _):
        if process_exe(window_pid(h)) == KAKAO_EXE:
            out.append(h)
        return True

    user32.EnumWindows(EnumProc(cb), 0)
    return out


def descendants(hwnd: int) -> list[int]:
    out: list[int] = []

    def cb(h, _):
        out.append(h)
        return True

    user32.EnumChildWindows(hwnd, EnumProc(cb), 0)
    return out


def _smto(hwnd: int, msg: int, wparam: int, lparam: int) -> int:
    res = ULONG_PTR(0)
    ok = user32.SendMessageTimeoutW(hwnd, msg, wparam, lparam, SMTO_ABORTIFHUNG, MSG_TIMEOUT_MS, ctypes.byref(res))
    if not ok:
        raise KakaoWindowError(f"Win32 메시지 0x{msg:04X} 시간초과/실패")
    return res.value


def get_text(hwnd: int) -> str:
    n = _smto(hwnd, WM_GETTEXTLENGTH, 0, 0)
    buf = ctypes.create_unicode_buffer(n + 2)
    _smto(hwnd, WM_GETTEXT, n + 2, ctypes.addressof(buf))
    return buf.value


def set_text(hwnd: int, text: str) -> bool:
    buf = ctypes.create_unicode_buffer(text)
    return bool(_smto(hwnd, WM_SETTEXT, 0, ctypes.addressof(buf)))


def is_empty_input(text: str) -> bool:
    return not (text or "").strip() or (text or "").strip() in PLACEHOLDERS


def type_text(hwnd: int, text: str) -> None:
    _smto(hwnd, EM_SETSEL, 0, 0xFFFFFFFF)
    buf = ctypes.create_unicode_buffer(text)
    _smto(hwnd, EM_REPLACESEL, 1, ctypes.addressof(buf))


def press_enter(hwnd: int) -> None:
    if not user32.PostMessageW(hwnd, WM_KEYDOWN, VK_RETURN, ENTER_DOWN_LPARAM):
        raise KakaoWindowError("Enter KEYDOWN 실패")
    if not user32.PostMessageW(hwnd, WM_KEYUP, VK_RETURN, ENTER_UP_LPARAM):
        raise KakaoWindowError("Enter KEYUP 실패")


def click_send(chat_hwnd: int) -> None:
    if user32.IsIconic(chat_hwnd):
        user32.ShowWindow(chat_hwnd, 4)
        time.sleep(0.25)
    rc = W.RECT()
    old = user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
    try:
        user32.GetClientRect(chat_hwnd, ctypes.byref(rc))
        dpi = user32.GetDpiForWindow(chat_hwnd) or 96
        s = dpi / 96.0
        x, y = rc.right - round(SEND_BTN_FROM_RIGHT * s), rc.bottom - round(SEND_BTN_FROM_BOTTOM * s)
        lp = ((y & 0xFFFF) << 16) | (x & 0xFFFF)
        for msg, wp in ((WM_MOUSEMOVE, 0), (WM_LBUTTONDOWN, MK_LBUTTON), (WM_LBUTTONUP, 0)):
            user32.PostMessageW(chat_hwnd, msg, wp, lp)
            time.sleep(0.05)
    finally:
        if old:
            user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(old))


def normalize_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")


def _same(a: str, b: str) -> bool:
    return a.replace("\r\n", "\n").replace("\r", "\n") == b.replace("\r\n", "\n").replace("\r", "\n")


def _wait(pred, timeout: float, interval: float = 0.005):
    end = time.perf_counter() + timeout
    while True:
        v = pred()
        if v or time.perf_counter() >= end:
            return v
        time.sleep(interval)


def input_controls(chat_hwnd: int) -> list[int]:
    return [h for h in descendants(chat_hwnd) if class_name(h) in INPUT_CLASSES and user32.IsWindowVisible(h)]


def list_chat_windows() -> list[dict]:
    out = []
    for h in top_windows():
        if not user32.IsWindowVisible(h) or class_name(h) not in CHAT_WINDOW_CLASSES:
            continue
        title = window_title(h)
        if not title or title in MAIN_TITLES:
            continue
        inputs = input_controls(h)
        if inputs:
            out.append({"hwnd": h, "title": title})
    return out


def find_chat_window(room_name: str) -> int | None:
    want = room_name.strip()
    for w in list_chat_windows():
        if w["title"].strip() == want:
            return w["hwnd"]
    # 부분 일치(예: '박 과장님' -> '박 과장님 (영업팀)') 보조 탐색
    for w in list_chat_windows():
        if want and want in w["title"].strip():
            return w["hwnd"]
    return None


def find_main_window() -> int | None:
    for h in top_windows():
        if class_name(h) == MAIN_CLASS and window_title(h) in MAIN_TITLES:
            return h
    return None


def check_kakao_ready() -> tuple[bool, str]:
    main = find_main_window()
    if not main:
        return False, "PC 카카오톡이 실행되어 있지 않거나 로그인 전입니다."
    edits = [h for h in descendants(main) if class_name(h) == SEARCH_EDIT_CLASS]
    if not edits:
        return False, "PC 카카오톡 잠금모드 상태이거나 채팅 탭 검색창을 찾을 수 없습니다."
    return True, f"정상 (열린 대화방 {len(list_chat_windows())}개)"


def _tuck_away(chat_hwnd: int, fg_before, main_hwnd, settle: float = 0.55) -> None:
    end = time.perf_counter() + settle
    while True:
        if not user32.IsIconic(chat_hwnd):
            user32.ShowWindow(chat_hwnd, 7)  # SW_SHOWMINNOACTIVE
        f = user32.GetForegroundWindow()
        if fg_before and fg_before not in (chat_hwnd, main_hwnd) and f != fg_before and f in (chat_hwnd, main_hwnd, None, 0):
            user32.SetForegroundWindow(fg_before)
        if time.perf_counter() >= end:
            return
        time.sleep(0.01)


def open_chat(room_name: str, timeout: float = 3.0, search_settle: float = 0.4) -> dict:
    global _good_edit_index
    hwnd = find_chat_window(room_name)
    if hwnd:
        return {"ok": True, "hwnd": hwnd, "already_open": True}
    main = find_main_window()
    if not main:
        return {"ok": False, "error": "내 PC에서 실행 중인 카카오톡 메인 창을 찾지 못했습니다(로그인 필요)."}
    edits = [h for h in descendants(main) if class_name(h) == SEARCH_EDIT_CLASS]
    if not edits:
        return {"ok": False, "error": "PC 카카오톡이 잠금모드 상태입니다. 잠금을 해제해 주세요."}

    before = {w["hwnd"] for w in list_chat_windows()}
    fg_before = user32.GetForegroundWindow()
    hwnd = None
    main_restored = None

    for attempt in (1, 2):
        if attempt == 2:
            if user32.IsIconic(main):
                user32.ShowWindow(main, 4)
                main_restored = "minimized"
                time.sleep(0.4)
            elif not user32.IsWindowVisible(main):
                user32.ShowWindow(main, 8)
                main_restored = "hidden"
                time.sleep(0.4)
            else:
                break
        order = list(enumerate(edits))
        if _good_edit_index is not None and _good_edit_index < len(order):
            order.insert(0, order.pop(_good_edit_index))
        for i, edit in order:
            try:
                set_text(edit, room_name)
            except KakaoWindowError:
                continue
            time.sleep(search_settle)
            press_enter(edit)
            hwnd = _wait(lambda: find_chat_window(room_name), max(1.0, timeout / len(edits)), 0.005)
            if hwnd:
                _tuck_away(hwnd, fg_before, main)
            try:
                set_text(edit, "")
            except KakaoWindowError:
                pass
            if hwnd:
                _good_edit_index = i
                break
        if hwnd:
            break

    new_other = [w for w in list_chat_windows() if w["hwnd"] not in before and w["hwnd"] != hwnd]
    if hwnd:
        if main_restored == "minimized":
            user32.ShowWindow(main, 7)
        elif main_restored == "hidden":
            user32.ShowWindow(main, 0)
        _tuck_away(hwnd, fg_before, main, settle=0.0)
        return {"ok": True, "hwnd": hwnd, "already_open": False}
    for w in new_other:
        user32.PostMessageW(w["hwnd"], WM_CLOSE, 0, 0)
    return {"ok": False, "error": f"PC 카카오톡에서 '{room_name}' 대화방을 찾지 못했습니다."}


def send_kakao_message(room_name: str, text: str) -> dict:
    if not text or not text.strip():
        return {"ok": False, "error": "전송할 메시지 본문이 비어 있습니다."}
    with _LOCK:
        o = open_chat(room_name)
        if not o.get("ok"):
            return {"ok": False, "error": o.get("error", "대화방 열기 실패")}
        hwnd = o["hwnd"]
        if user32.IsHungAppWindow(hwnd):
            return {"ok": False, "error": "PC 카카오톡 창이 응답하지 않습니다."}
        inputs = input_controls(hwnd)
        if len(inputs) != 1:
            return {"ok": False, "error": f"입력칸 식별 불가(감지된 입력칸 {len(inputs)}개)"}
        inp = inputs[0]
        draft = get_text(inp)
        if is_empty_input(draft):
            draft = ""
        if draft:
            return {
                "ok": False,
                "draft_present": True,
                "error": f"PC 카카오톡 '{room_name}' 입력창에 작성 중인 초안이 있어 덮어쓰지 않고 보호했습니다.",
            }
        body = normalize_text(text)
        try:
            type_text(inp, body)
        except KakaoWindowError as e:
            return {"ok": False, "error": f"텍스트 입력 실패: {e}"}
        got = get_text(inp)
        if not _same(got, body):
            set_text(inp, "")
            return {"ok": False, "error": "입력창 텍스트 검증 불일치로 전송을 중단했습니다."}
        try:
            press_enter(inp)
            if _wait(lambda: is_empty_input(get_text(inp)), 0.7):
                return {"ok": True, "confirmed": True, "already_open": o.get("already_open", False)}
        except KakaoWindowError:
            pass
        time.sleep(0.25)
        chat_hwnd = user32.GetAncestor(inp, GA_ROOT) or inp
        click_send(chat_hwnd)
        confirmed = bool(_wait(lambda: is_empty_input(get_text(inp)), 1.0))
        return {"ok": True, "confirmed": confirmed, "already_open": o.get("already_open", False)}


# ============================================================================
# 2. SheetBot 클라우드 서버 아웃바운드 릴레이 루프
# ============================================================================
CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".sheetbot_kakao_bridge.json")
DEFAULT_SERVER_URL = "https://sheetbot.cloud"


def load_saved_config() -> dict:
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def save_config(cfg: dict) -> None:
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def resolve_agent_settings() -> tuple[str, str, str]:
    cfg = load_saved_config()
    server_url = os.environ.get("SHEETBOT_SERVER_URL") or cfg.get("serverUrl") or DEFAULT_SERVER_URL
    email = os.environ.get("SHEETBOT_USER_EMAIL") or cfg.get("userEmail") or ""
    code = os.environ.get("SHEETBOT_PAIRING_CODE") or cfg.get("pairingCode") or ""

    # CLI 인자 파싱
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a in ("--email", "-e") and i + 1 < len(args):
            email = args[i + 1].strip()
        elif a in ("--code", "-c") and i + 1 < len(args):
            code = args[i + 1].strip()
        elif a in ("--server", "-s") and i + 1 < len(args):
            server_url = args[i + 1].strip().rstrip("/")

    if not email and not code:
        print("=" * 68)
        print("  💛 [SheetBot] 내 PC 카카오톡 원격 자동 발송 브리지 설정")
        print("=" * 68)
        print("시트봇 모바일 앱에 로그인한 구글 이메일 주소(또는 6자리 연결 코드)를 입력하세요.")
        user_input = input("👉 시트봇 이메일 (예: myname@gmail.com): ").strip()
        if "@" in user_input:
            email = user_input.lower()
        else:
            code = user_input.upper()

    save_config({"serverUrl": server_url, "userEmail": email, "pairingCode": code})
    return server_url.rstrip("/"), email, code


def run_bridge_loop():
    server_url, email, code = resolve_agent_settings()
    pc_name = socket.gethostname() or "Windows-PC"
    ssl_ctx = ssl.create_default_context()

    print("\n" + "=" * 68)
    print("  🚀 [SheetBot 내 PC 카톡 브리지] 실시간 연결 시작!")
    print(f"  • 연결 서버   : {server_url}")
    print(f"  • 시트봇 계정 : {email or code}")
    print(f"  • 내 PC 이름  : {pc_name}")
    print("=" * 68)

    ready, detail = check_kakao_ready()
    status_icon = "🟢 준비 완료" if ready else "🟡 대기 중 (PC 카카오톡 로그인/잠금해제 필요)"
    print(f"  • PC 카카오톡 : {status_icon} — {detail}")
    print("  • 이제 스마트폰 [시트봇 앱 ➔ AI 비서 카드]에서 [🖥️ 내 PC 카톡으로 자동 발송]을 누르면")
    print("    이 PC의 카카오톡이 창을 띄우지 않고(무포커스) 즉시 카톡을 대신 보내줍니다.\n")

    last_ready_state = None
    consecutive_errors = 0

    while True:
        try:
            ready, detail = check_kakao_ready()
            if ready != last_ready_state:
                ts = time.strftime("%H:%M:%S")
                if ready:
                    print(f"[{ts}] 🟢 PC 카카오톡 연결 감지됨 ({detail})")
                else:
                    print(f"[{ts}] ⚠️ PC 카카오톡 상태 알림: {detail}")
                last_ready_state = ready

            query = urllib.parse.urlencode({
                "email": email,
                "code": code,
                "pcName": pc_name,
                "kakaoReady": "1" if ready else "0",
                "kakaoDetail": detail,
                "waitMs": "12000",
            })
            poll_url = f"{server_url}/api/user/messages/kakao/pc-agent?{query}"
            req = urllib.request.Request(poll_url, method="GET", headers={"User-Agent": "SheetBot-PC-Kakao-Agent/1.0"})

            with urllib.request.urlopen(req, timeout=20, context=ssl_ctx) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                data = json.loads(raw)

            consecutive_errors = 0
            job = data.get("job")
            if not job:
                continue

            job_id = job.get("jobId", "")
            room_name = job.get("roomName", "")
            message = job.get("message", "")
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] 📩 발송 요청 수신 ➔ 대화방: [{room_name}] | 내용: {message[:40]}...")

            send_res = send_kakao_message(room_name, message)
            if send_res.get("ok"):
                print(f"[{ts}] ✅ [{room_name}] 무포커스 카톡 전송 성공! (입력창 비워짐 확인: {send_res.get('confirmed')})")
            else:
                print(f"[{ts}] ❌ [{room_name}] 전송 실패: {send_res.get('error')}")

            report_payload = json.dumps({
                "jobId": job_id,
                "email": email,
                "code": code,
                "pcName": pc_name,
                "ok": bool(send_res.get("ok")),
                "confirmed": bool(send_res.get("confirmed")),
                "alreadyOpen": bool(send_res.get("already_open")),
                "draftPresent": bool(send_res.get("draft_present")),
                "error": send_res.get("error", ""),
            }).encode("utf-8")

            report_req = urllib.request.Request(
                f"{server_url}/api/user/messages/kakao/pc-agent",
                data=report_payload,
                method="POST",
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "User-Agent": "SheetBot-PC-Kakao-Agent/1.0",
                },
            )
            with urllib.request.urlopen(report_req, timeout=10, context=ssl_ctx) as _:
                pass

        except KeyboardInterrupt:
            print("\n👋 사용자에 의해 시트봇 내 PC 카톡 브리지가 종료되었습니다.")
            break
        except Exception as e:
            consecutive_errors += 1
            wait_sec = min(10, 2 * consecutive_errors)
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] 🔄 서버 재연결 대기 중 ({wait_sec}초)... ({e})")
            time.sleep(wait_sec)


if __name__ == "__main__":
    run_bridge_loop()
