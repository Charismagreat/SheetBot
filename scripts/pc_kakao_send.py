"""PC 카카오톡 창으로 메시지 보내기 (Win32 창 메시지, ctypes만 사용). 기본은 dry-run.

이 PC에서 돌아가는 PC 카카오톡의
열린 채팅창 입력칸(RICHEDIT50W)에 글을 넣고 Enter를 '메시지로' 보낸다.
마우스·키보드 입력(SendInput)이나 포커스 이동을 쓰지 않으므로 창이 뒤에 있어도 된다.

    import pc_kakao_send as PK
    PK.send("방 이름", "안녕하세요\n두 줄째")            # dry-run: 할 일만 돌려줌
    PK.send("방 이름", "안녕하세요", send=True)          # 실제 전송 (호출자가 명시할 때만)

흐름 (send=True):
  1) find_chat_window: KakaoTalk.exe 프로세스의 보이는 최상위 창 중
     클래스 EVA_Window_Dblclk(옛 버전 #32770), 제목 == 방 이름, 입력칸 자식이 있는 것
  2) 입력칸(RICHEDIT50W, 옛 버전 RichEdit20W)을 자식 창 전체에서 찾음. 2개 이상이면 거부
     (스레드 패널 등 어느 칸인지 모름)
  3) 입력칸에 사람이 쓰던 글(초안)이 있으면 거부 (overwrite_draft=True면 덮어씀)
  4) WM_SETTEXT로 전체 글을 한 번에 넣음 (여러 줄은 CRLF로, Shift+Enter 흉내 없음)
  5) WM_GETTEXT로 다시 읽어 같은지 확인, 다르면 원래대로 되돌리고 중단
  6) PostMessage WM_KEYDOWN/WM_KEYUP VK_RETURN → 카카오톡이 전송
  7) 입력칸이 비워지는지 confirm_timeout 동안 확인 (confirmed)

스레드(오픈채팅 댓글) 답장: thread_id 와 thread_text(대상 글)를 주면 pc_kakao_thread 로 그 말풍선의 답글 모드를
켠 뒤 보낸다. 대상 글을 못 찾거나 확인이 어긋나면 보내지 않는다(채팅방 본문으로 새지 않게).

안전장치: 기본 dry-run, 대상 창은 기본적으로 KakaoTalk.exe 프로세스 소유만(pids로 바꿀 수 있음,
테스트는 가짜 창 프로세스 pid만 넘김), 초안 덮어쓰기 거부, 입력칸 여러 개면 거부, 모듈 잠금으로 한 번에 하나.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as W
import os
import sys
import threading
import time

__all__ = [
    "find_chat_window", "find_main_window", "find_search_edit", "list_chat_windows",
    "open_chat", "send", "deliver", "get_text", "set_text", "press_enter", "probe",
]

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
user32.PostMessageW.argtypes =[W.HWND, W.UINT, W.WPARAM, W.LPARAM]
user32.SendMessageTimeoutW.argtypes = [W.HWND, W.UINT, W.WPARAM, W.LPARAM, W.UINT, W.UINT,
                                       ctypes.POINTER(ULONG_PTR)]
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


def _ms(t0: float) -> float:
    return round((time.perf_counter() - t0) * 1000, 2)


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
    """pid의 실행 파일 이름(소문자). 못 열면 ''."""
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


def _allowed(hwnd: int, pids) -> bool:
    pid = window_pid(hwnd)
    if pids is not None:
        return pid in pids
    return process_exe(pid) == KAKAO_EXE


def top_windows(pids=None) -> list[int]:
    out: list[int] = []

    def cb(h, _):
        if _allowed(h, pids):
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
        raise KakaoWindowError(f"메시지 0x{msg:04X} 실패/시간초과 hwnd={hwnd} err={ctypes.get_last_error()}")
    return res.value


def get_text(hwnd: int) -> str:
    n = _smto(hwnd, WM_GETTEXTLENGTH, 0, 0)
    buf = ctypes.create_unicode_buffer(n + 2)
    _smto(hwnd, WM_GETTEXT, n + 2, ctypes.addressof(buf))
    return buf.value


def set_text(hwnd: int, text: str) -> bool:
    buf = ctypes.create_unicode_buffer(text)
    return bool(_smto(hwnd, WM_SETTEXT, 0, ctypes.addressof(buf)))


SEND_BTN_FROM_RIGHT = 36
SEND_BTN_FROM_BOTTOM = 23
PLACEHOLDERS = ("Enter a message", "메시지 입력", "메시지를 입력하세요")
WM_MOUSEMOVE, WM_LBUTTONDOWN, WM_LBUTTONUP, MK_LBUTTON = 0x0200, 0x0201, 0x0202, 0x0001
GA_ROOT = 2


def is_empty_input(text: str) -> bool:
    return not (text or "").strip() or (text or "").strip() in PLACEHOLDERS


def click_send(chat_hwnd: int) -> tuple[int, int]:
    """채팅창의 전송 버튼 자리에 클릭 메시지를 넣는다. 돌려주는 값: 클라이언트 물리 좌표."""
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
            if not user32.PostMessageW(chat_hwnd, msg, wp, lp):
                raise KakaoWindowError(f"전송 버튼 클릭 0x{msg:04X} 실패 err={ctypes.get_last_error()}")
            time.sleep(0.05)
    finally:
        if old:
            user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(old))
    return x, y


EM_SETSEL, EM_REPLACESEL = 0x00B1, 0x00C2


def type_text(hwnd: int, text: str) -> None:
    """입력칸 전체를 text로 바꾼다 — 타이핑·붙여넣기처럼(EM_REPLACESEL). WM_SETTEXT로 넣으면 글은 보여도
    카톡이 입력으로 안 쳐서 전송 버튼이 회색(꺼짐)으로 남는다(11-13 실측). 이 방법이면 버튼이 노랗게 켜진다."""
    _smto(hwnd, EM_SETSEL, 0, 0xFFFFFFFF)
    buf = ctypes.create_unicode_buffer(text)
    _smto(hwnd, EM_REPLACESEL, 1, ctypes.addressof(buf))


def press_enter(hwnd: int) -> None:
    """입력칸에 Enter 키 메시지를 넣는다(포커스 불필요). 실제 카톡 창이면 전송된다."""
    if not user32.PostMessageW(hwnd, WM_KEYDOWN, VK_RETURN, ENTER_DOWN_LPARAM):
        raise KakaoWindowError(f"Enter KEYDOWN 실패 err={ctypes.get_last_error()} (관리자 권한 차이/UIPI?)")
    if not user32.PostMessageW(hwnd, WM_KEYUP, VK_RETURN, ENTER_UP_LPARAM):
        raise KakaoWindowError(f"Enter KEYUP 실패 err={ctypes.get_last_error()}")


def normalize_text(text: str) -> str:
    """여러 줄은 CRLF로 통일(RichEdit이 문단 구분으로 받음)."""
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")


def _same(a: str, b: str) -> bool:
    f = lambda s: s.replace("\r\n", "\n").replace("\r", "\n")  # noqa: E731
    return f(a) == f(b)


def _wait(pred, timeout: float, interval: float = 0.005):
    end = time.perf_counter() + timeout
    while True:
        v = pred()
        if v or time.perf_counter() >= end:
            return v
        time.sleep(interval)


def input_controls(chat_hwnd: int) -> list[int]:
    return [h for h in descendants(chat_hwnd)
            if class_name(h) in INPUT_CLASSES and user32.IsWindowVisible(h)]


def list_chat_windows(pids=None) -> list[dict]:
    """열린 채팅창 목록(입력칸이 있는 보이는 창)."""
    out = []
    for h in top_windows(pids):
        if not user32.IsWindowVisible(h) or class_name(h) not in CHAT_WINDOW_CLASSES:
            continue
        title = window_title(h)
        if not title or title in MAIN_TITLES:
            continue
        inputs = input_controls(h)
        if inputs:
            out.append({"hwnd": h, "title": title, "class": class_name(h), "inputs": len(inputs),
                        "minimized": bool(user32.IsIconic(h)), "pid": window_pid(h)})
    return out


def find_chat_window(room_name: str, pids=None) -> int | None:
    """제목이 room_name과 정확히 같은 열린 채팅창 hwnd. 없으면 None."""
    want = room_name.strip()
    for w in list_chat_windows(pids):
        if w["title"].strip() == want:
            return w["hwnd"]
    return None


def find_main_window(pids=None) -> int | None:
    for h in top_windows(pids):
        if class_name(h) == MAIN_CLASS and window_title(h) in MAIN_TITLES:
            return h
    return None


def find_search_edit(main_hwnd: int) -> tuple[int | None, str]:
    """메인 창 채팅 탭 검색칸. (hwnd, 찾은 방법)."""
    child = user32.FindWindowExW(main_hwnd, None, SEARCH_CHAIN[0], None)
    if child:
        first = user32.FindWindowExW(child, None, SEARCH_CHAIN[1], None)
        second = user32.FindWindowExW(child, first, SEARCH_CHAIN[2], None) if first else None
        if second:
            edit = user32.FindWindowExW(second, None, SEARCH_CHAIN[3], None)
            if edit:
                return edit, "chain:EVA_ChildWindow>EVA_Window[2]>Edit"
    edits = [h for h in descendants(main_hwnd) if class_name(h) == SEARCH_EDIT_CLASS]
    vis = [h for h in edits if user32.IsWindowVisible(h)]
    if len(vis) == 1:
        return vis[0], "fallback:only-visible-Edit"
    return None, f"not-found(Edit {len(edits)}개, 보이는 것 {len(vis)}개)"


def _tuck_away(chat_hwnd: int, fg_before, main_hwnd, settle: float = 0.6) -> None:
    """방금 연 대화창을 활성화 없이 최소화하고(SW_SHOWMINNOACTIVE 7) 쓰던 창을 다시 앞으로 둔다.

    실측: 방을 열면 카톡이 그 대화창을 스스로 앞으로 가져온다(막을 수 없음). 창이 뜨자마자 한 번만 최소화하면
    카톡이 여는 동작을 마저 하면서 다시 꺼내 놓았다 → settle초 동안 다시 나오는지 보며 거듭 내린다.
    대화창은 닫지 않는다 — 최소화로 열려 있으면 다음부터는 방 열기 없이 Enter만으로 0.1초 안팎에 나간다.
    """
    end = time.perf_counter() + settle
    while True:
        if not user32.IsIconic(chat_hwnd):
            user32.ShowWindow(chat_hwnd, 7)
        f = user32.GetForegroundWindow()
        if fg_before and fg_before not in (chat_hwnd, main_hwnd) and f != fg_before and f in (chat_hwnd, main_hwnd, None, 0):
            user32.SetForegroundWindow(fg_before)
        if time.perf_counter() >= end:
            return
        time.sleep(0.01)


def open_chat(room_name: str, execute: bool = False, pids=None, timeout: float = 3.0,
              search_settle: float = 0.4) -> dict:
    """메인 창 채팅 탭 검색칸에 방 이름을 넣고 Enter → 첫 검색 결과 방이 열린다.

    execute=False(기본)면 창을 찾기만 하고 아무것도 넣지 않는다.
    열린 방 제목이 room_name과 다르면(비슷한 이름이 먼저 걸림) 그 창을 닫고 실패로 돌려준다.
    방을 열면 안 읽은 메시지가 읽음 처리된다(상대에게 1이 사라짐).
    """
    global _good_edit_index
    t_all = time.perf_counter()
    r = {"ok": False, "room": room_name, "execute": execute, "timings_ms": {}, "steps": []}
    t = time.perf_counter()
    hwnd = find_chat_window(room_name, pids)
    r["timings_ms"]["find_existing"] = _ms(t)
    if hwnd:
        r.update(ok=True, hwnd=hwnd, already_open=True)
        r["steps"].append("이미 열려 있음")
        return r
    t = time.perf_counter()
    main = find_main_window(pids)
    if not main:
        r["error"] = "카카오톡 메인 창 없음(실행·로그인 안 됨?)"
        return r
    edits = [h for h in descendants(main) if class_name(h) == SEARCH_EDIT_CLASS]
    r["timings_ms"]["find_search"] = _ms(t)
    r.update(main_hwnd=main, main_visible=bool(user32.IsWindowVisible(main)), edit_count=len(edits))
    if not edits:
        r["error"] = "검색칸(Edit) 후보 없음"
        return r
    r["steps"] += [f"메인 창 Edit {len(edits)}개에 차례로 '{room_name}' 넣고 Enter", f"최대 {timeout}s 창 대기", "검색칸 비우기"]
    if not execute:
        r["ok"] = True
        r["dry_run"] = True
        return r
    before = {w["hwnd"] for w in list_chat_windows(pids)}
    fg_before = user32.GetForegroundWindow()
    t = time.perf_counter()
    hwnd = None
    for attempt in (1, 2):
        if attempt == 2:
            if user32.IsIconic(main):
                user32.ShowWindow(main, 4); r["main_restored"] = "minimized"; time.sleep(0.4)
            elif not user32.IsWindowVisible(main):
                user32.ShowWindow(main, 8); r["main_restored"] = "hidden"; time.sleep(0.4)
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
            hwnd = _wait(lambda: find_chat_window(room_name, pids), max(1.0, timeout / len(edits)), 0.005)
            if hwnd:
                _tuck_away(hwnd, fg_before, main)
            try:
                set_text(edit, "")
            except KakaoWindowError:
                pass
            if hwnd:
                r["search_edit"] = edit
                r["search_edit_index"] = i
                _good_edit_index = i
                break
        if hwnd:
            break
    r["open_attempts"] = attempt
    r["timings_ms"]["open_wait"] = _ms(t)
    new = [w for w in list_chat_windows(pids) if w["hwnd"] not in before and w["title"].strip() != room_name.strip()]
    if hwnd:
        r.update(ok=True, hwnd=hwnd, already_open=False)
        if r.get("main_restored") == "minimized":
            user32.ShowWindow(main, 7)
        elif r.get("main_restored") == "hidden":
            user32.ShowWindow(main, 0)
        _tuck_away(hwnd, fg_before, main, settle=0.0)
        r["minimized_after_open"] = bool(user32.IsIconic(hwnd))
    else:
        r["error"] = "방이 안 열림(어느 Edit로도)" if not new else f"다른 방이 열림: {[w['title'] for w in new]} (닫음)"
        for w in new:
            user32.PostMessageW(w["hwnd"], WM_CLOSE, 0, 0)
    r["timings_ms"]["total"] = _ms(t_all)
    return r


def deliver(input_hwnd: int, text: str, confirm_timeout: float = 1.0, timings: dict | None = None) -> dict:
    """입력칸 hwnd에 text를 넣고 Enter. send(send=True)의 마지막 단계(창 찾기·초안 검사 없음).

    실제 카톡 입력칸에 쓰면 전송된다. 직접 부를 때는 hwnd가 맞는지 호출자가 책임진다.
    """
    tm = timings if timings is not None else {}
    body = normalize_text(text)
    t = time.perf_counter()
    try:
        type_text(input_hwnd, body)
    except KakaoWindowError as e:
        return {"ok": False, "error": f"입력 실패: {e}", "timings_ms": tm}
    tm["set_text"] = _ms(t)
    t = time.perf_counter()
    got = get_text(input_hwnd)
    tm["verify_text"] = _ms(t)
    if not _same(got, body):
        set_text(input_hwnd, "")
        return {"ok": False, "error": f"넣은 글이 다르게 읽힘: {got!r}", "timings_ms": tm}
    t = time.perf_counter()
    try:
        press_enter(input_hwnd)
        if _wait(lambda: is_empty_input(get_text(input_hwnd)), min(confirm_timeout, 0.6)):
            tm["send_enter"] = _ms(t)
            tm["clicks"] = 0
            return {"ok": True, "confirmed": True, "timings_ms": tm}
    except KakaoWindowError:
        pass
    after = get_text(input_hwnd)
    if not _same(after, body):
        if is_empty_input(after):
            tm["send_enter"] = _ms(t)
            tm["clicks"] = 0
            return {"ok": True, "confirmed": True, "timings_ms": tm}
        if not _same(after.rstrip("\r\n"), body.rstrip("\r\n")):
            tm["send_enter"] = _ms(t)
            return {"ok": True, "confirmed": False, "timings_ms": tm}
        try:
            type_text(input_hwnd, body)
        except KakaoWindowError as e:
            return {"ok": False, "error": f"입력 되돌리기 실패: {e}", "timings_ms": tm}
        tm["enter_newline"] = True
    tm["enter_failed"] = _ms(t)
    time.sleep(0.3)
    chat_hwnd = user32.GetAncestor(input_hwnd, GA_ROOT) or input_hwnd
    click_send(chat_hwnd)
    tm["send_click"] = _ms(t)
    t = time.perf_counter()
    confirmed = bool(_wait(lambda: is_empty_input(get_text(input_hwnd)), confirm_timeout))
    tm["confirm_cleared"] = _ms(t)
    return {"ok": True, "confirmed": confirmed, "timings_ms": tm}


def send(room_name: str, text: str, send: bool = False, *, pids=None, thread_id=None,
         thread_text: str | None = None, thread_guard=None,
         auto_open: bool = False, overwrite_draft: bool = False, confirm_timeout: float = 1.0,
         probe_input: bool = False) -> dict:
    """room_name 채팅창으로 text를 보낸다. send=False(기본)면 보내지 않고 할 일만 돌려준다.

    probe_input=True(dry-run 전용): 입력칸에 글을 넣고 다시 읽은 뒤 원래 내용으로 되돌린다(Enter 없음).
    auto_open=True: 창이 없으면 open_chat으로 연다(dry-run이면 열 계획만).
    반환: {"ok", "dry_run", "room", "hwnd", "input_hwnd", "steps", "timings_ms", "confirmed"?, "error"?}
    """
    t_all = time.perf_counter()
    tm: dict = {}
    r = {"ok": False, "dry_run": not send, "room": room_name, "timings_ms": tm, "steps": []}
    if thread_id and not (thread_text or "").strip():
        r["error"] = "스레드 답장인데 대상 글(thread_text)이 없어 보내지 않음(본문으로 새지 않게 거부)"
        return r
    if not text or not text.strip():
        r["error"] = "빈 글"
        return r
    with _LOCK:
        t = time.perf_counter()
        hwnd = find_chat_window(room_name, pids)
        tm["find_window"] = _ms(t)
        if not hwnd:
            if not auto_open:
                r["error"] = "채팅창이 열려 있지 않음(auto_open=False)"
                return r
            o = open_chat(room_name, execute=send, pids=pids)
            tm["open_chat"] = o.get("timings_ms", {})
            r["open"] = o
            if not o.get("ok"):
                r["error"] = "방 열기 실패: " + str(o.get("error"))
                return r
            if not send:
                r["steps"] += ["(방 열기) " + s for s in o["steps"]]
                r["steps"] += ["입력칸 찾기", "초안 확인", "WM_SETTEXT 전체 글", "다시 읽어 확인",
                               "전송 버튼 클릭", "입력칸 비워짐 확인"]
                r["ok"] = True
                tm["total"] = _ms(t_all)
                return r
            hwnd = o["hwnd"]
        r["hwnd"] = hwnd
        r["minimized"] = bool(user32.IsIconic(hwnd))
        if user32.IsHungAppWindow(hwnd):
            r["error"] = "카카오톡 창 응답 없음"
            return r
        t = time.perf_counter()
        inputs = input_controls(hwnd)
        tm["find_input"] = _ms(t)
        if len(inputs) != 1:
            r["error"] = f"입력칸이 {len(inputs)}개(스레드 패널 등) - 어느 칸인지 몰라 거부"
            return r
        inp = inputs[0]
        r["input_hwnd"] = inp
        t = time.perf_counter()
        draft = get_text(inp)
        tm["read_draft"] = _ms(t)
        if is_empty_input(draft):
            draft = ""
        r["draft_present"] = bool(draft)
        if draft and not overwrite_draft:
            r["error"] = "입력칸에 쓰던 글이 있음(overwrite_draft=False) - 덮어쓰지 않음"
            return r
        body = normalize_text(text)
        r["steps"] += [f"WM_SETTEXT {len(body)}자({body.count(chr(13) + chr(10)) + 1}줄) → hwnd {inp}",
                       "WM_GETTEXT로 확인", "전송 버튼 자리에 PostMessage 클릭", "입력칸 비워짐 확인"]
        if not send:
            if probe_input:
                t = time.perf_counter()
                set_text(inp, body)
                back = get_text(inp)
                set_text(inp, draft)
                restored = get_text(inp)
                tm["probe_fill_and_restore"] = _ms(t)
                r["probe_ok"] = _same(back, body) and _same(restored, draft)
            r["ok"] = True
            tm["total"] = _ms(t_all)
            return r
        th = None
        if thread_id:
            import pc_kakao_thread as PT
            t = time.perf_counter()
            th = PT.enter(hwnd, thread_text, guard=thread_guard, pids=pids)
            tm["thread_enter"] = _ms(t)
            r["thread"] = {k: th.get(k) for k in ("ok", "probes", "via", "error", "moved", "restored", "clipboard_nontext_lost")}
            if not th.get("ok"):
                r["error"] = "스레드 답글 모드 실패(본문으로 보내지 않음): " + str(th.get("error"))
                tm["total"] = _ms(t_all)
                return r
        d = deliver(inp, text, confirm_timeout, tm)
        r.update(ok=d["ok"], confirmed=d.get("confirmed", False))
        if th:
            try:
                if PT.in_reply_mode(hwnd):
                    if not r["confirmed"] and not is_empty_input(get_text(inp)):
                        set_text(inp, "")
                    r["thread"]["mode_left_on"] = not PT.cancel(hwnd)
                PT.close_search(hwnd)
                if th.get("restored"):
                    user32.ShowWindow(hwnd, 6)
            except Exception as e:  # noqa: BLE001
                r["thread"]["cleanup_error"] = type(e).__name__
        if not d["ok"]:
            r["error"] = d["error"]
        tm["total"] = _ms(t_all)
        return r


def probe(pids=None, depth: int = 4) -> dict:
    """카카오톡 창·자식 컨트롤 클래스 목록(읽기 전용, 아무것도 안 넣음)."""

    def tree(h, d):
        kids = []
        if d > 0:
            def cb(c, _):
                if user32.GetParent(c) == h:
                    kids.append(c)
                return True
            user32.EnumChildWindows(h, EnumProc(cb), 0)
        return {"hwnd": h, "class": class_name(h), "title": window_title(h)[:40],
                "visible": bool(user32.IsWindowVisible(h)), "children": [tree(c, d - 1) for c in kids]}

    wins =[h for h in top_windows(pids) if window_title(h)]
    main = find_main_window(pids)
    return {"main": main, "search_edit": find_search_edit(main) if main else None,
            "chats": list_chat_windows(pids), "windows": [tree(h, depth) for h in wins]}


if __name__ == "__main__":
    import json
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1] if len(sys.argv) >= 2 else ""
    if cmd == "probe":
        print(json.dumps(probe(), ensure_ascii=False))
    elif cmd == "dry" and len(sys.argv) >= 4:
        print(json.dumps(send(sys.argv[2], sys.argv[3], send=False, auto_open=True), ensure_ascii=False))
    elif cmd == "send" and len(sys.argv) >= 4:
        do_send = "--yes" in sys.argv
        res = send(sys.argv[2], sys.argv[3], send=do_send, auto_open=True, overwrite_draft=False)
        print(json.dumps(res, ensure_ascii=False))
    else:
        print(json.dumps({"ok": False, "error": "Usage: pc_kakao_send.py probe | dry <room> <text> | send <room> <text> --yes"}, ensure_ascii=False))
