#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SheetBot & 파투(FileToSheet) 내 PC 카카오톡 원격 발송 + 열린 대화창 실시간 자동 기록 브리지 (v2.0)
- 기능 1 (원격 무포커스 자동 발송): 외출 중 스마트폰 [시트봇 앱 ➔ AI 비서 카드]에서 [🖥️ 내 PC 카톡으로 자동 발송]을 누르면
  내 PC 카카오톡이 창을 앞으로 띄우지 않고(SW_SHOWMINNOACTIVE) 대화방을 검색해 자동 전송합니다.
- 기능 2 (열린 대화창 실시간 대화 파투 시트 자동 기록 - kakao_native):
  스마트폰 알림이 울리지 않는 'PC 카카오톡 열린 대화창의 실시간 대화(상대방 수신 + 내가 PC 키보드로 직접 타이핑한 발신)'를
  창 포커스나 클립보드 간섭이 전혀 없는 로컬 DB(.edb / -wal) 메모리 읽기 전용 방식으로 감지하여
  파투(FileToSheet) [카카오톡대화대장] 시트에 중복 없이(3단계 중복 방어) 실시간 자동 적재합니다.
"""
from __future__ import annotations

import contextlib
import ctypes
import ctypes.wintypes as W
import dataclasses
import datetime as dt
import glob
import hashlib
import hmac as _hmac
import json
import os
import re
import socket
import sqlite3
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, replace
from functools import lru_cache
from pathlib import Path

# 콘솔 한글 깨짐 방지
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# cryptography 모듈 자동 확인 및 최초 1회 자동 설치 (kakao_native 로컬 DB 메모리 복호화용)
HAS_CRYPTOGRAPHY = False
try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    HAS_CRYPTOGRAPHY = True
except ImportError:
    try:
        print("📦 [최초 1회] PC 카톡 열린 대화창 실시간 기록(kakao_native)을 위해 cryptography 모듈을 자동 설치합니다...")
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "cryptography"], check=False, timeout=60)
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        HAS_CRYPTOGRAPHY = True
        print("✅ cryptography 모듈 준비 완료!")
    except Exception as _crypto_err:
        print(f"⚠️ cryptography 자동 설치 생략 ({_crypto_err}) — 원격 발송 기능은 정상 작동합니다.")

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
# 2. kakao_native 로컬 암호화 DB(.edb / -wal) 메모리 읽기 전용 감시 엔진
# ============================================================================
DPAPI_ENTROPY = b"kakao-autoreply-win/keycache/v1"
SQLITE_MAGIC = b"SQLite format 3\x00"
PAGE_SIZES = (512, 1024, 2048, 4096, 8192, 16384, 32768, 65536)
WAL_MAGICS = (0x377F0682, 0x377F0683)

PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010
MEM_COMMIT = 0x1000
MEM_PRIVATE = 0x20000
PAGE_GUARD = 0x100
_READABLE = {0x02, 0x04, 0x08, 0x20, 0x40, 0x80}
TH32CS_SNAPPROCESS = 0x00000002
_HEX64 = re.compile(rb"(?<![0-9A-Fa-f])[0-9A-Fa-f]{64}(?![0-9A-Fa-f])")

USER_ROOT = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Kakao", "KakaoTalk", "users")
KST = dt.timezone(dt.timedelta(hours=9))
TYPE_KO = {
    "DirectChat": "갠톡",
    "MultiChat": "단톡",
    "OM": "오픈채팅",
    "OD": "1:1 오픈채팅",
    "MemoChat": "나와의 채팅",
    "PlusChat": "채널",
}
MARK = {
    2: "[사진]", 27: "[사진 묶음]", 3: "[동영상]", 5: "[음성]",
    12: "[이모티콘]", 20: "[이모티콘]", 25: "[이모티콘]",
    16: "[위치]", 17: "[연락처]", 18: "[파일]", 51: "[통화]",
    14: "[투표]", 24: "[공지]", 73: "[알림]",
}
ROOMLIST_DB = "chat_data\\chatListInfo.edb"
USER_DB = "TalkUserDB.edb"


def dpapi_call(data: bytes, unprotect: bool) -> bytes | None:
    if sys.platform != "win32":
        return None

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", W.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    def mk_blob(b: bytes) -> BLOB:
        buf = ctypes.create_string_buffer(b, len(b))
        return BLOB(len(b), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    src, ent, out = mk_blob(data), mk_blob(DPAPI_ENTROPY), BLOB()
    crypt32 = ctypes.windll.crypt32
    fn = crypt32.CryptUnprotectData if unprotect else crypt32.CryptProtectData
    if not fn(ctypes.byref(src), None, ctypes.byref(ent), None, None, 0, ctypes.byref(out)):
        return None
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


@dataclass(frozen=True)
class SqlCipher4Params:
    page_size: int = 4096
    kdf_iter: int = 256000
    fast_kdf_iter: int = 2
    hmac_salt_mask: int = 0x3A
    iv_size: int = 16
    hmac_size: int = 64
    salt_size: int = 16
    aes_key_bits: int = 256
    use_hmac: bool = True
    use_salt: bool = True
    reserve: int | None = None

    def __post_init__(self):
        minimum = 16 + (64 if self.use_hmac else 0)
        if self.reserve is None:
            object.__setattr__(self, "reserve", minimum)

    @property
    def key_size(self) -> int:
        return self.aes_key_bits // 8

    @property
    def first_page_offset(self) -> int:
        return 16 if self.use_salt else 0


SQLCIPHER4_DEFAULTS = SqlCipher4Params()
DEVICE_AES128_DEFAULTS = SqlCipher4Params(aes_key_bits=128, use_hmac=False, use_salt=False, reserve=16)
FORMAT_PRESETS = {"sqlcipher4": SQLCIPHER4_DEFAULTS, "device-aes128": DEVICE_AES128_DEFAULTS}


def derive_hmac_key(enc_key: bytes, salt: bytes, params: SqlCipher4Params = SQLCIPHER4_DEFAULTS) -> bytes:
    hmac_salt = bytes(b ^ params.hmac_salt_mask for b in salt)
    return hashlib.pbkdf2_hmac("sha512", enc_key, hmac_salt, params.fast_kdf_iter, dklen=params.key_size)


def _page_hmac(hmac_key: bytes, ciphertext: bytes, iv: bytes, page_no: int) -> bytes:
    return _hmac.new(hmac_key, ciphertext + iv + page_no.to_bytes(4, "little"), hashlib.sha512).digest()


def _split_page(page: bytes, page_no: int, params: SqlCipher4Params):
    body_off = params.first_page_offset if page_no == 1 else 0
    ct_end = params.page_size - params.reserve
    mac_size = params.hmac_size if params.use_hmac else 0
    return (
        page[body_off:ct_end],
        page[ct_end : ct_end + 16],
        page[ct_end + 16 : ct_end + 16 + mac_size],
        body_off,
    )


def _decrypt_page(page: bytes, page_no: int, enc_key: bytes, hmac_key: bytes, params: SqlCipher4Params, check_hmac: bool) -> bytes:
    ciphertext, iv, stored_hmac, body_off = _split_page(page, page_no, params)
    if params.use_hmac and check_hmac:
        calc = _page_hmac(hmac_key, ciphertext, iv, page_no)
        if not _hmac.compare_digest(calc, stored_hmac):
            raise ValueError(f"page {page_no}: HMAC mismatch")
    dec = Cipher(algorithms.AES(enc_key), modes.CBC(iv)).decryptor()
    plain = dec.update(ciphertext) + dec.finalize()
    if body_off:
        plain = SQLITE_MAGIC + plain
    return plain + b"\x00" * params.reserve


def valid_sqlite_header(page: bytes, params: SqlCipher4Params) -> bool:
    if len(page) < 100 or page[:16] != SQLITE_MAGIC:
        return False
    size = int.from_bytes(page[16:18], "big")
    size = 65536 if size == 1 else size
    return (
        size == params.page_size
        and page[18] in (1, 2)
        and page[19] in (1, 2)
        and page[20] == params.reserve
        and page[21:24] == b"\x40\x20\x20"
        and int.from_bytes(page[44:48], "big") in (1, 2, 3, 4)
        and int.from_bytes(page[56:60], "big") in (1, 2, 3)
        and page[72:92] == b"\x00" * 20
    )


def verify_raw_key(first_page: bytes, enc_key: bytes, params: SqlCipher4Params = SQLCIPHER4_DEFAULTS) -> bool:
    if len(enc_key) != params.key_size or len(first_page) != params.page_size:
        return False
    if params.use_hmac:
        salt = first_page[:16] if params.use_salt else b""
        hk = derive_hmac_key(enc_key, salt, params)
        ciphertext, iv, mac, _ = _split_page(first_page, 1, params)
        return _hmac.compare_digest(_page_hmac(hk, ciphertext, iv, 1), mac)
    plain = _decrypt_page(first_page, 1, enc_key, b"", params, False)
    return valid_sqlite_header(plain, params)


def decrypt_database(encrypted: bytes, enc_key: bytes, params: SqlCipher4Params = SQLCIPHER4_DEFAULTS, check_hmac: bool = True) -> bytes:
    if not encrypted or len(encrypted) % params.page_size:
        raise ValueError("invalid encrypted page size")
    salt = encrypted[:16] if params.use_salt else b""
    hk = derive_hmac_key(enc_key, salt, params) if params.use_hmac else b""
    out = bytearray()
    for index in range(len(encrypted) // params.page_size):
        page = encrypted[index * params.page_size : (index + 1) * params.page_size]
        plain = _decrypt_page(page, index + 1, enc_key, hk, params, check_hmac)
        if index == 0 and not params.use_hmac and not valid_sqlite_header(plain, params):
            raise ValueError("header mismatch")
        out.extend(plain)
    return bytes(out)


def apply_wal(plain_db: bytes, encrypted_db: bytes, wal: bytes, enc_key: bytes, params: SqlCipher4Params = SQLCIPHER4_DEFAULTS) -> tuple[bytes, int]:
    if len(wal) < 32 or int.from_bytes(wal[:4], "big") not in WAL_MAGICS:
        return plain_db, 0
    ps = int.from_bytes(wal[8:12], "big")
    if ps != params.page_size:
        return plain_db, 0
    salts = wal[16:24]
    salt = encrypted_db[:16] if params.use_salt else b""
    hk = derive_hmac_key(enc_key, salt, params) if params.use_hmac else b""
    pages: dict[int, bytes] = {}
    pending: dict[int, bytes] = {}
    db_pages = len(plain_db) // ps
    applied = 0
    off = 32
    while off + 24 + ps <= len(wal):
        fh = wal[off : off + 24]
        if fh[8:16] != salts:
            break
        pgno = int.from_bytes(fh[:4], "big")
        commit = int.from_bytes(fh[4:8], "big")
        try:
            pending[pgno] = _decrypt_page(wal[off + 24 : off + 24 + ps], pgno, enc_key, hk, params, True)
        except ValueError:
            break
        off += 24 + ps
        if commit:
            pages.update(pending)
            applied += len(pending)
            pending = {}
            db_pages = commit
    if not pages:
        return plain_db, 0
    out = bytearray(plain_db[: db_pages * ps].ljust(db_pages * ps, b"\x00"))
    for pgno, data in pages.items():
        if pgno <= db_pages:
            out[(pgno - 1) * ps : pgno * ps] = data
    return bytes(out), applied


class MEMORY_BASIC_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BaseAddress", ctypes.c_void_p),
        ("AllocationBase", ctypes.c_void_p),
        ("AllocationProtect", W.DWORD),
        ("__align", W.DWORD),
        ("RegionSize", ctypes.c_size_t),
        ("State", W.DWORD),
        ("Protect", W.DWORD),
        ("Type", W.DWORD),
    ]


class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", W.DWORD),
        ("cntUsage", W.DWORD),
        ("th32ProcessID", W.DWORD),
        ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
        ("th32ModuleID", W.DWORD),
        ("cntThreads", W.DWORD),
        ("th32ParentProcessID", W.DWORD),
        ("pcPriClassBase", ctypes.c_long),
        ("dwFlags", W.DWORD),
        ("szExeFile", ctypes.c_char * 260),
    ]


def find_kakaotalk_pids() -> list[int]:
    snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snap == -1:
        return []
    pids: list[int] = []
    try:
        entry = PROCESSENTRY32()
        entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
        if not kernel32.Process32First(snap, ctypes.byref(entry)):
            return pids
        while True:
            name = entry.szExeFile.decode("ascii", "ignore")
            if name.lower() == "kakaotalk.exe":
                pids.append(entry.th32ProcessID)
            if not kernel32.Process32Next(snap, ctypes.byref(entry)):
                break
    finally:
        kernel32.CloseHandle(snap)
    return pids


def _open_process_readonly(pid: int):
    h = kernel32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not h:
        raise ctypes.WinError(ctypes.get_last_error())
    return h


def _iter_regions(h):
    addr = 0
    mbi = MEMORY_BASIC_INFORMATION()
    size = ctypes.sizeof(mbi)
    max_addr = 0x7FFFFFFF0000
    while addr < max_addr:
        res = kernel32.VirtualQueryEx(h, ctypes.c_void_p(addr), ctypes.byref(mbi), size)
        if not res:
            break
        region = int(mbi.RegionSize)
        if region <= 0:
            break
        base = int(mbi.BaseAddress or 0)
        protect = int(mbi.Protect)
        low = protect & 0xFF
        if int(mbi.State) == MEM_COMMIT and int(mbi.Type) == MEM_PRIVATE and not (protect & PAGE_GUARD) and low in _READABLE:
            yield base, region
        addr = base + region


def _read_region(h, base: int, size: int, chunk: int = 4 * 1024 * 1024) -> bytes:
    out = bytearray()
    buf = ctypes.create_string_buffer(chunk)
    read = ctypes.c_size_t(0)
    off = 0
    while off < size:
        n = min(chunk, size - off)
        ok = kernel32.ReadProcessMemory(h, ctypes.c_void_p(base + off), buf, n, ctypes.byref(read))
        if ok and read.value:
            out += buf.raw[: read.value]
        off += n
    return bytes(out)


def _hex_candidates(blob: bytes):
    seen: set[bytes] = set()
    for m in _HEX64.finditer(blob):
        try:
            key = bytes.fromhex(m.group().decode("ascii"))
        except ValueError:
            continue
        if key not in seen:
            seen.add(key)
            yield key


@lru_cache(maxsize=32)
def _candidate_formats(params: SqlCipher4Params) -> tuple[SqlCipher4Params, ...]:
    candidates = [params]
    for preset in FORMAT_PRESETS.values():
        if params.page_size - preset.reserve < 480:
            continue
        candidate = replace(preset, page_size=params.page_size)
        if candidate not in candidates:
            candidates.append(candidate)
    return tuple(candidates)


def _matching_format(first_page_bytes: bytes, key: bytes, params: SqlCipher4Params) -> SqlCipher4Params | None:
    for candidate in _candidate_formats(params):
        if len(key) == candidate.key_size and verify_raw_key(first_page_bytes, key, candidate):
            return candidate
    return None


def _raw_candidates(blob: bytes, seen: set[bytes] | None = None, sizes: tuple[int, ...] = (32, 16), min_distinct: int = 1, step: int = 1):
    if seen is None:
        seen = set()
    smallest = min(sizes)
    thr = {size: (size * 5 // 8 if min_distinct == 0 else min(min_distinct, size * 5 // 8)) for size in sizes}
    for i in range(0, max(0, len(blob) - smallest + 1), step):
        for size in sizes:
            if i + size > len(blob):
                continue
            window = blob[i : i + size]
            if window.count(0) > 4 or len(set(window)) < thr[size]:
                continue
            if window in seen:
                continue
            seen.add(window)
            yield window


class _HeaderPrefilter:
    TARGET = {0: 0x10, 1: 0x00, 5: 0x40, 6: 0x20, 7: 0x20}

    def __init__(self, want: dict[str, bytes], params: SqlCipher4Params = SQLCIPHER4_DEFAULTS):
        self._cipher = lambda k: Cipher(algorithms.AES(k), modes.ECB()).decryptor()
        ct_end = params.page_size - params.reserve
        target = dict(self.TARGET)
        target[4] = params.reserve
        blocks, self.expect = [], []
        for fp in want.values():
            if len(fp) < params.page_size:
                continue
            ct, iv = fp[16:32], fp[ct_end : ct_end + 16]
            blocks.append(ct)
            self.expect.append(tuple((j, iv[j] ^ t) for j, t in sorted(target.items())))
        self.blob = b"".join(blocks)
        self.n = len(want)

    def stale(self, want: dict) -> bool:
        return len(want) != self.n

    def hit(self, key: bytes) -> bool:
        if not self.blob:
            return False
        d = self._cipher(key).update(self.blob)
        for i, exp in enumerate(self.expect):
            o = 16 * i
            if all(d[o + j] == v for j, v in exp):
                return True
        return False


def app_home() -> Path:
    base = os.environ.get("KAKAO_AUTOREPLY_HOME") or os.path.join(os.environ.get("LOCALAPPDATA", "."), "kakao-autoreply-win")
    p = Path(base)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _int(v, d: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return d


def format_kst_ts(t: int) -> str:
    try:
        return dt.datetime.fromtimestamp(int(t), KST).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")


def find_account_dir(user_root: str = USER_ROOT) -> str | None:
    for pat in (os.path.join(user_root, "*", "appstate.dat"), os.path.join(user_root, "*", "chat_data", "chatListInfo.edb")):
        hits = sorted(glob.glob(pat), key=os.path.getmtime, reverse=True)
        if hits:
            return os.path.dirname(hits[0]) if pat.endswith("appstate.dat") else os.path.dirname(os.path.dirname(hits[0]))
    return None


def first_page(path: str, size: int = 4096) -> bytes:
    with open(path, "rb") as f:
        return f.read(size)


class MemoryKeys:
    def __init__(self, acc: str, log=print, cache_path: Path | None = None):
        self.acc = acc
        self.log = log
        self.cache_path = cache_path or (app_home() / "keys.dpapi")
        self.keys: dict[str, tuple[bytes, SqlCipher4Params]] = {}
        self.hot: set[int] = set()
        self._load()

    def _load(self) -> None:
        try:
            blob = self.cache_path.read_bytes()
        except OSError:
            return
        raw = dpapi_call(blob, True)
        if not raw:
            return
        try:
            for rel, v in json.loads(raw.decode("utf-8")).items():
                self.keys[rel] = (bytes.fromhex(v["k"]), SqlCipher4Params(**v["p"]))
        except Exception:
            self.keys = {}

    def _save(self) -> None:
        data = {rel: {"k": k.hex(), "p": dataclasses.asdict(p)} for rel, (k, p) in self.keys.items()}
        blob = dpapi_call(json.dumps(data).encode("utf-8"), False)
        if blob:
            tmp = self.cache_path.with_suffix(".tmp")
            tmp.write_bytes(blob)
            os.replace(tmp, self.cache_path)

    def key_for(self, relpath: str):
        return self.keys.get(relpath)

    def scan(self, relpaths: list[str], deep: bool = False) -> int:
        want: dict[str, bytes] = {}
        for rel in relpaths:
            if rel in self.keys:
                continue
            try:
                want[rel] = first_page(os.path.join(self.acc, rel))
            except OSError:
                continue
        if not want:
            return 0
        pids = find_kakaotalk_pids()
        if not pids:
            return 0
        found = 0

        def accept(key: bytes) -> bool:
            nonlocal found
            for rel, fp in list(want.items()):
                matched = _matching_format(fp, key, SQLCIPHER4_DEFAULTS)
                if matched is not None:
                    self.keys[rel] = (key, matched)
                    del want[rel]
                    found += 1
            return not want

        passes = [("hex", None), ("raw8", 8)]
        if deep:
            passes.append(("raw1", 1))
        for _label, step in passes:
            if not want:
                break
            seen: set[bytes] = set()
            pre = _HeaderPrefilter(want) if step else None
            for pid in pids:
                try:
                    h = _open_process_readonly(pid)
                except OSError:
                    continue
                try:
                    regions = sorted(_iter_regions(h), key=lambda r: r[0] not in self.hot)
                    for base, size in regions:
                        blob = _read_region(h, base, size)
                        if not blob:
                            continue
                        before = found
                        if step is None:
                            for key in _hex_candidates(blob):
                                if key not in seen:
                                    seen.add(key)
                                    if accept(key):
                                        break
                        else:
                            sizes = (32, 16) if step == 1 else (32,)
                            for key in _raw_candidates(blob, set(), sizes=sizes, min_distinct=20, step=step):
                                if (len(key) != 32 or pre.hit(key)) and accept(key):
                                    break
                                if pre.stale(want):
                                    pre = _HeaderPrefilter(want)
                        if found > before:
                            self.hot.add(base)
                        if not want:
                            break
                finally:
                    kernel32.CloseHandle(h)
                if not want:
                    break
        if found:
            self._save()
        return found


@contextlib.contextmanager
def open_decrypted(enc_path: str, key: bytes, params: SqlCipher4Params):
    with open(enc_path, "rb") as f:
        enc = f.read()
    plain = decrypt_database(enc, key, params)
    try:
        with open(enc_path + "-wal", "rb") as wf:
            wal = wf.read()
    except OSError:
        wal = b""
    if len(wal) > 32:
        plain, _n = apply_wal(plain, enc, wal, key, params)
    conn, tmp = _connect_plain(plain)
    try:
        yield conn
    finally:
        conn.close()
        for p in ((tmp, tmp + "-wal", tmp + "-shm") if tmp else ()):
            try:
                os.unlink(p)
            except OSError:
                pass


def _connect_plain(plain: bytes) -> tuple[sqlite3.Connection, str]:
    try:
        img = bytearray(plain)
        if len(img) > 20 and (img[18] == 2 or img[19] == 2):
            img[18] = img[19] = 1
        conn = sqlite3.connect(":memory:")
        try:
            conn.deserialize(bytes(img))
            conn.execute("SELECT count(*) FROM sqlite_master").fetchone()
        except Exception:
            conn.close()
            raise
        conn.row_factory = sqlite3.Row
        return conn, ""
    except Exception:
        pass
    fd, tmp = tempfile.mkstemp(suffix=".db", prefix="kknat_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(plain)
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
    except Exception:
        for p in (tmp, tmp + "-wal", tmp + "-shm"):
            try:
                os.unlink(p)
            except OSError:
                pass
        raise
    conn.row_factory = sqlite3.Row
    return conn, tmp


def _rows(conn: sqlite3.Connection | None, sql: str, bind=()) -> list[sqlite3.Row]:
    if conn is None:
        return []
    try:
        return list(conn.execute(sql, bind))
    except sqlite3.DatabaseError:
        return []


class KakaoAccountReader:
    def __init__(self, log=print):
        self.log = log
        self.acc = find_account_dir()
        if not self.acc:
            raise RuntimeError("PC 카카오톡 로컬 계정 폴더를 찾지 못했습니다.")
        self.keys = MemoryKeys(self.acc, log)
        self.names: dict[str, str] = {}
        self.my_id = ""
        self.rooms: list[dict] = []
        self.keys.scan([ROOMLIST_DB, USER_DB])
        self._load_users()
        self._load_rooms()

    def chat_relpath(self, chat_id: str) -> str:
        return f"chat_data\\chatLogs_{chat_id}.edb"

    @contextlib.contextmanager
    def db(self, relpath: str):
        path = os.path.join(self.acc, relpath)
        got = self.keys.key_for(relpath)
        if got is None or not os.path.exists(path):
            yield None
            return
        key, params = got
        try:
            with open_decrypted(path, key, params) as conn:
                yield conn
        except Exception:
            yield None

    def query(self, relpath: str, sql: str, bind=()) -> list[sqlite3.Row]:
        with self.db(relpath) as conn:
            return _rows(conn, sql, bind)

    def scan_rooms(self, chat_ids: list[str] | None = None) -> int:
        ids = chat_ids if chat_ids is not None else [r["id"] for r in self.rooms if r["type"] != "PlusChat"]
        return self.keys.scan([self.chat_relpath(c) for c in ids])

    def readable(self, chat_id: str) -> bool:
        return self.keys.key_for(self.chat_relpath(chat_id)) is not None

    def _load_users(self) -> None:
        for r in self.query(USER_DB, "SELECT userId, nickName, friendNickName FROM talkUser"):
            nm = (r["friendNickName"] or r["nickName"] or "").strip()
            if nm:
                self.names[str(r["userId"])] = nm

    def _load_rooms(self) -> None:
        with self.db(ROOMLIST_DB) as conn:
            if conn is None:
                raise RuntimeError("방 목록 DB(chatListInfo.edb) 키를 아직 읽지 못했습니다.")
            members: dict[str, list[str]] = {}
            for r in _rows(conn, "SELECT chatId, userId FROM chatMembers WHERE isActive=1"):
                members.setdefault(str(r["chatId"]), []).append(str(r["userId"]))
            freq: dict[str, int] = {}
            for ms in members.values():
                for u in ms:
                    freq[u] = freq.get(u, 0) + 1
            self.my_id = max(freq, key=freq.get) if freq else ""
            lst = _rows(
                conn,
                "SELECT chatId, type, useCustomChatRoomTitle, chatRoomTitle, directChatMemberId, "
                "activeMembersCount, lastUpdatedAt, lastLogId, linkId FROM chatRoomList",
            )
        self.rooms = []
        for r in lst:
            cid, typ = str(r["chatId"]), str(r["type"] or "")
            ms = [m for m in members.get(cid, []) if m != self.my_id]
            self.rooms.append({
                "id": cid,
                "type": typ,
                "name": self.room_name(r, typ, ms),
                "title": (r["chatRoomTitle"] or "").strip(),
                "members": ms,
                "member_count": _int(r["activeMembersCount"], len(ms) + 1),
                "last": _int(r["lastUpdatedAt"]),
                "last_log_id": _int(r["lastLogId"]),
            })
        self.rooms.sort(key=lambda x: x["last"], reverse=True)

    def room_name(self, r, typ: str, members: list[str]) -> str:
        if typ == "MemoChat":
            return "나와의 채팅"
        title = (r["chatRoomTitle"] or "").strip()
        if _int(r["useCustomChatRoomTitle"]) and title:
            return title
        if typ in ("DirectChat", "PlusChat"):
            other = str(r["directChatMemberId"] or (members[0] if members else ""))
            return self.names.get(other) or title or f"{TYPE_KO.get(typ, typ)} {str(r['chatId'])[-4:]}"
        if title:
            return title
        known = [self.names.get(m) for m in members[:5] if self.names.get(m)]
        if known:
            return ", ".join(known[:4]) + (f" 외 {len(members) - 4}명" if len(members) > 4 else "")
        return f"{TYPE_KO.get(typ, typ or '방')} {str(r['chatId'])[-4:]}"

    def signature(self, chat_id: str) -> tuple:
        path = os.path.join(self.acc, self.chat_relpath(chat_id))
        out = []
        for p in (path, path + "-wal"):
            try:
                st = os.stat(p)
                out.append((st.st_mtime_ns, st.st_size))
            except OSError:
                out.append(None)
        return tuple(out)

    def read_since(self, chat_id: str, since_logid: int = 0) -> list[sqlite3.Row] | None:
        sql = "SELECT logId, authorId, type, message, attachement, sendAt FROM chatLogs WHERE logId > ? ORDER BY logId ASC"
        with self.db(self.chat_relpath(chat_id)) as conn:
            if conn is None:
                return None
            try:
                return list(conn.execute(sql, (since_logid,)))
            except sqlite3.DatabaseError:
                return None

    def max_log_id(self, chat_id: str) -> int | None:
        with self.db(self.chat_relpath(chat_id)) as conn:
            if conn is None:
                return None
            try:
                row = conn.execute("SELECT COALESCE(MAX(logId), 0) FROM chatLogs").fetchone()
                return _int(row[0]) if row else 0
            except sqlite3.DatabaseError:
                return None


class KakaoNativeLiveWatcher:
    """
    1단계 중복 방어(Watermark 선점) + 열린 대화창 실시간 대화(수신 + 내 PC 직접 발신) 감시 워커
    - 브리지 시작 시점 이전에 쌓인 과거 대화는 MAX(logId) 기준점으로만 기록하고 절대 전송하지 않습니다.
    - 브리지 시작 이후 새로 발생한 메시지(logId > last_log_id AND sendAt >= start_ts - 5)만 파투 시트로 실시간 전송합니다.
    """

    def __init__(self, server_url: str, email: str, code: str, pc_name: str, ssl_ctx):
        self.server_url = server_url
        self.email = email
        self.code = code
        self.pc_name = pc_name
        self.ssl_ctx = ssl_ctx
        self.cursor_path = app_home() / "sync_cursor.json"
        self.bridge_start_ts = int(time.time())
        self.acct: KakaoAccountReader | None = None
        self.last_by_room: dict[str, int] = self._load_cursor()
        self._seen_sig: dict[str, tuple] = {}
        self._mtimes: dict[str, float] = {}
        self._last_rescan = 0.0

    def _load_cursor(self) -> dict[str, int]:
        try:
            if self.cursor_path.exists():
                data = json.loads(self.cursor_path.read_text(encoding="utf-8"))
                return {str(k): _int(v) for k, v in (data.get("last_by_room") or {}).items()}
        except Exception:
            pass
        return {}

    def _save_cursor(self) -> None:
        try:
            payload = {"last_by_room": self.last_by_room, "updated_at": int(time.time())}
            self.cursor_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    def _ensure_initialized(self) -> bool:
        if self.acct is not None:
            return True
        if not HAS_CRYPTOGRAPHY or not find_kakaotalk_pids():
            return False
        try:
            self.acct = KakaoAccountReader()
            self.acct.scan_rooms()
            readable_count = 0
            for room in self.acct.rooms:
                cid = room["id"]
                if not self.acct.readable(cid):
                    continue
                readable_count += 1
                mx = self.acct.max_log_id(cid)
                if mx is not None:
                    self.last_by_room[cid] = max(self.last_by_room.get(cid, 0), mx)
                self._seen_sig[cid] = (self.acct.signature(cid), self.last_by_room.get(cid, 0))
            self._save_cursor()
            ts = time.strftime("%H:%M:%S")
            print(
                f"[{ts}] 🔍 [열린 대화창 실시간 기록 가동] 감지 가능한 대화방 {readable_count}개 기준점(Watermark) 설정 완료 (과거 대화 중복 0%)"
            )
            return True
        except Exception:
            self.acct = None
            return False

    def _rescan_changed_rooms(self) -> None:
        if not self.acct or time.time() - self._last_rescan < 6.0:
            return
        self._last_rescan = time.time()
        changed_unkeyed = []
        for room in self.acct.rooms:
            cid = room["id"]
            if room["type"] == "PlusChat" or self.acct.readable(cid):
                continue
            path = os.path.join(self.acct.acc, self.acct.chat_relpath(cid))
            try:
                m = max(os.path.getmtime(p) for p in (path, path + "-wal") if os.path.exists(p))
            except ValueError:
                continue
            if self._mtimes.get(cid) != m:
                self._mtimes[cid] = m
                changed_unkeyed.append(cid)
        if changed_unkeyed:
            try:
                self.acct.scan_rooms(changed_unkeyed)
            except Exception:
                pass

    def _format_message_row(self, r: sqlite3.Row, room: dict) -> dict | None:
        assert self.acct is not None
        typ = _int(r["type"], 1)
        msg = (r["message"] or "").strip()
        if typ == 0 or typ >= 16384:
            return None
        if typ in (1, 26):
            body = msg
        elif typ in MARK:
            body = MARK[typ]
            if typ == 18:
                try:
                    body = f"[파일: {json.loads(r['attachement'] or '{}').get('name') or ''}]"
                except Exception:
                    pass
            elif typ in (12, 20, 25) and msg:
                body += " " + msg
        else:
            body = msg or f"[기타 {typ}]"
        if not body:
            return None
        uid = str(r["authorId"])
        mine = uid == self.acct.my_id
        who = "나" if mine else (self.acct.names.get(uid) or room["name"] or f"사용자{uid[-4:]}")
        send_at = _int(r["sendAt"])
        return {
            "logId": _int(r["logId"]),
            "roomName": room["name"],
            "senderName": re.sub(r"[\r\n]+", " ", who).strip(),
            "message": body,
            "mine": mine,
            "sentAt": send_at,
            "sentAtStr": format_kst_ts(send_at),
        }

    def poll_and_sync(self) -> None:
        if not self._ensure_initialized() or self.acct is None:
            return
        self._rescan_changed_rooms()
        new_events: list[dict] = []
        cursor_dirty = False

        for room in self.acct.rooms:
            cid = room["id"]
            if room["type"] == "PlusChat" or not self.acct.readable(cid):
                continue
            is_first_unlock = cid not in self.last_by_room
            last_lid = self.last_by_room.get(cid, 0)
            sig = self.acct.signature(cid)
            if self._seen_sig.get(cid) == (sig, last_lid):
                continue

            rows = self.acct.read_since(cid, last_lid)
            if rows is None:
                continue
            if not rows:
                self._seen_sig[cid] = (sig, last_lid)
                continue

            for r in rows:
                lid = _int(r["logId"])
                send_at = _int(r["sendAt"])
                if lid > self.last_by_room.get(cid, 0):
                    self.last_by_room[cid] = lid
                    cursor_dirty = True
                # 브리지 기동 이전에 작성된 과거 메시지는 새로 열린 방이라도 절대 전송하지 않음 (1단계 중복 차단)
                if is_first_unlock and send_at < self.bridge_start_ts - 5:
                    continue
                ev = self._format_message_row(r, room)
                if ev:
                    new_events.append(ev)

            self._seen_sig[cid] = (sig, self.last_by_room.get(cid, 0))

        if cursor_dirty:
            self._save_cursor()

        if not new_events:
            return

        payload = json.dumps({
            "action": "SYNC_MESSAGES",
            "email": self.email,
            "code": self.code,
            "pcName": self.pc_name,
            "messages": new_events,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.server_url}/api/user/messages/kakao/pc-agent",
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "SheetBot-PC-Kakao-Agent/2.0",
            },
        )
        with urllib.request.urlopen(req, timeout=10, context=self.ssl_ctx) as resp:
            res_data = json.loads(resp.read().decode("utf-8", errors="replace"))
            synced = res_data.get("syncedCount", 0)
            dedup = res_data.get("deduplicatedCount", 0)
            ts = time.strftime("%H:%M:%S")
            for ev in new_events:
                dir_tag = "📤 내 PC 직접발신" if ev["mine"] else "📩 열린창 수신"
                print(
                    f"[{ts}] 💬 [{dir_tag}] [{ev['roomName']}] {ev['senderName']}: {ev['message'][:35]} "
                    f"(파투적재: {synced}건, 중복스킵: {dedup}건)"
                )

    def start_background_thread(self) -> None:
        def _loop():
            while True:
                try:
                    self.poll_and_sync()
                except Exception:
                    pass
                time.sleep(2.0)

        t = threading.Thread(target=_loop, daemon=True)
        t.start()


# ============================================================================
# 3. SheetBot / FileToSheet(파투) 클라우드 서버 아웃바운드 릴레이 루프
# ============================================================================
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")
HOME_CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".sheetbot_kakao_bridge.json")
DEFAULT_SERVER_URL = "https://sheetbot.cloud"


def load_saved_config() -> dict:
    merged: dict = {}
    for p in (HOME_CONFIG_PATH, LOCAL_CONFIG_PATH):
        try:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        merged.update({k: v for k, v in data.items() if v})
        except Exception:
            pass
    return merged


def save_config(cfg: dict) -> None:
    for p in (LOCAL_CONFIG_PATH, HOME_CONFIG_PATH):
        try:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
        except Exception:
            pass


def resolve_agent_settings() -> tuple[str, str, str]:
    cfg = load_saved_config()
    server_url = os.environ.get("SHEETBOT_SERVER_URL") or cfg.get("sheetbotServerUrl") or cfg.get("serverUrl") or DEFAULT_SERVER_URL
    email = os.environ.get("SHEETBOT_USER_EMAIL") or cfg.get("userEmail") or ""
    phone = os.environ.get("SHEETBOT_USER_PHONE") or cfg.get("phoneNumber") or ""
    code = os.environ.get("SHEETBOT_PAIRING_CODE") or cfg.get("pairingCode") or ""

    if not email and phone:
        digits = "".join(ch for ch in str(phone) if ch.isdigit())
        if len(digits) >= 9 and digits.startswith("01"):
            email = f"{digits}@fts.local"

    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a in ("--email", "-e") and i + 1 < len(args):
            email = args[i + 1].strip()
        elif a in ("--phone", "-p") and i + 1 < len(args):
            p_digits = "".join(ch for ch in args[i + 1] if ch.isdigit())
            if len(p_digits) >= 9:
                email = f"{p_digits}@fts.local"
        elif a in ("--code", "-c") and i + 1 < len(args):
            code = args[i + 1].strip()
        elif a in ("--server", "-s") and i + 1 < len(args):
            server_url = args[i + 1].strip().rstrip("/")

    if not email and not code:
        print("=" * 68)
        print("  💛 [SheetBot / 파투(FileToSheet)] 내 PC 카카오톡 원격 자동 발송 브리지 설정")
        print("=" * 68)
        print("시트봇/파투 모바일 앱에 연동된 [파투 휴대폰 번호], [구글 이메일], 또는 [6자리 연결 코드]를 입력하세요.")
        user_input = input("👉 휴대폰 번호(010-XXXX-XXXX) 또는 이메일 입력: ").strip()
        digits_only = "".join(ch for ch in user_input if ch.isdigit())
        if "@" in user_input:
            email = user_input.lower()
        elif len(digits_only) >= 9 and digits_only.startswith("01"):
            email = f"{digits_only}@fts.local"
        else:
            code = user_input.upper().replace("SB-", "")

    save_config({"serverUrl": server_url, "userEmail": email, "phoneNumber": phone, "pairingCode": code})
    return server_url.rstrip("/"), email, code


def run_bridge_loop():
    server_url, email, code = resolve_agent_settings()
    pc_name = socket.gethostname() or "Windows-PC"
    ssl_ctx = ssl.create_default_context()

    print("\n" + "=" * 68)
    print("  🚀 [SheetBot & 파투 내 PC 카톡 브리지 v2.0] 실시간 연결 시작!")
    print(f"  • 연결 서버   : {server_url}")
    print(f"  • 연동 계정   : {email or code}")
    print(f"  • 내 PC 이름  : {pc_name}")
    print("=" * 68)

    ready, detail = check_kakao_ready()
    status_icon = "🟢 준비 완료" if ready else "🟡 대기 중 (PC 카카오톡 로그인/잠금해제 필요)"
    print(f"  • PC 카카오톡 : {status_icon} — {detail}")
    print("  • 기능 1: 스마트폰 [AI 비서 카드]에서 [내 PC 카톡 자동 발송] 시 무포커스 자동 전송")
    print("  • 기능 2: PC 카톡 열린 대화창의 실시간 대화(수신 + 내 PC 직접 발신) 파투 시트 자동 기록\n")

    # 열린 대화창 실시간 감시 백그라운드 스레드 기동 (kakao_native)
    watcher = KakaoNativeLiveWatcher(server_url, email, code, pc_name, ssl_ctx)
    watcher.start_background_thread()

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
            req = urllib.request.Request(poll_url, method="GET", headers={"User-Agent": "SheetBot-PC-Kakao-Agent/2.0"})

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
                    "User-Agent": "SheetBot-PC-Kakao-Agent/2.0",
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
