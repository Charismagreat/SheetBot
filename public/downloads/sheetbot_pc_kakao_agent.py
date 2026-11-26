#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SheetBot & 파투(FileToSheet) 내 PC 카카오톡 원격 발송 + 열린 대화창 실시간 자동 기록 브리지 (v2.2)
- 기능 1 (원격 무포커스 자동 발송): 외출 중 스마트폰 [시트봇 앱 ➔ AI 비서 카드]에서 [🖥️ 내 PC 카톡으로 자동 발송]을 누르면
  내 PC 카카오톡이 창을 앞으로 띄우지 않고(SW_SHOWMINNOACTIVE) 대화방을 검색해 자동 전송합니다.
- 기능 2 (열린 대화창 실시간 대화 시트·파투 자동 기록 - kakao_native):
  스마트폰 알림이 울리지 않는 'PC 카카오톡 열린 대화창의 실시간 대화(상대방 수신 + 내가 PC 키보드로 직접 타이핑한 발신)'와
  삭제된 메시지(MARK_DELETED)를 로컬 DB(.edb / -wal) 메모리 읽기 전용 방식으로 감지하여 자동 적재합니다.
- 기능 3 (사진·파일 원본 증빙 자동 수집 + 청크 분할 업로드 - v2.2):
  700KB 이하는 multipart 단일 요청(413 시 자동 청크 폴백), 700KB 초과~20MB는 450KB 단위 3단계 청크 업로드(init→chunk→commit)와
  로컬 '카카오톡 받은 파일' 2시간 지속 감시를 결합하여 구글 드라이브·구글 시트·파투에 무손실 자동 저장합니다.
"""
from __future__ import annotations

import base64
import contextlib
import ctypes
import ctypes.wintypes as W
import dataclasses
import datetime as dt
import glob
import hashlib
import hmac as _hmac
import json
import mimetypes
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
import uuid
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
        try:
            if process_exe(window_pid(h)) == KAKAO_EXE:
                out.append(h)
        except BaseException:
            return False
        return True

    user32.EnumWindows(EnumProc(cb), 0)
    return out


def descendants(hwnd: int) -> list[int]:
    out: list[int] = []

    def cb(h, _):
        try:
            out.append(h)
        except BaseException:
            return False
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

    def scan(self, relpaths: list[str], deep: bool = False, hex_only: bool = False) -> int:
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

        passes: list[tuple[str, int | None]] = [("hex", None)]
        if not hex_only:
            passes.append(("raw8", 8))
        if deep and not hex_only:
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
        self.keys.scan([ROOMLIST_DB, USER_DB], hex_only=True)
        if not self.keys.key_for(ROOMLIST_DB):
            self.keys.scan([ROOMLIST_DB])
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

    def scan_rooms(self, chat_ids: list[str] | None = None, hex_only: bool = True) -> int:
        if chat_ids is not None:
            ids = chat_ids
        else:
            # PC 카카오톡에서 현재 실제로 열려 있어 WAL 파일(.edb-wal)이 존재하는 활성 대화방만 스캔 (닫힌 방은 메모리에 키가 없으므로 스캔 제외)
            wal_rooms: list[tuple[float, str]] = []
            for r in self.rooms:
                if r["type"] == "PlusChat":
                    continue
                cid = r["id"]
                if self.readable(cid):
                    continue
                rel = self.chat_relpath(cid)
                wal_path = os.path.join(self.acc, rel) + "-wal"
                try:
                    if os.path.exists(wal_path) and os.path.getsize(wal_path) > 0:
                        wal_rooms.append((os.path.getmtime(wal_path), cid))
                except OSError:
                    continue
            wal_rooms.sort(reverse=True)
            ids = [cid for _, cid in wal_rooms]
            if not ids:
                return 0
        return self.keys.scan([self.chat_relpath(c) for c in ids], hex_only=hex_only)

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

    def read_recent(self, chat_id: str, limit: int = 120) -> list[sqlite3.Row] | None:
        sql = "SELECT logId, authorId, type, message, attachement, sendAt FROM chatLogs ORDER BY logId DESC LIMIT ?"
        with self.db(self.chat_relpath(chat_id)) as conn:
            if conn is None:
                return None
            try:
                return list(conn.execute(sql, (limit,)))
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


def compute_fts_pairing_code(clean_phone: str) -> str:
    if not clean_phone:
        return ""
    seed = f"sheetbot-kakao-bridge:{clean_phone}@fts.local".encode("utf-8")
    return hashlib.sha256(seed).hexdigest().upper()[:6]


class KakaoNativeLiveWatcher:
    """
    1단계 중복 방어(Watermark 선점) + 열린 대화창 실시간 대화(수신 + 내 PC 직접 발신) + 삭제 감지 + 사진/파일 통합 20MB 청크 업로드 워커
    - 브리지 시작 시점 이전에 쌓인 과거 대화는 MAX(logId) 기준점으로만 기록하고 절대 전송하지 않습니다.
    - 사진·파일은 파투(/api/staging/kakao-media)와 시트봇(/api/user/messages/kakao/attachment) 양쪽에 20MB 자동 청크 분할 업로드합니다.
    """

    def __init__(self, server_url: str, fts_server_url: str, email: str, phone: str, code: str, pc_name: str, ssl_ctx):
        self.server_url = server_url.rstrip("/")
        self.fts_server_url = (fts_server_url or "").rstrip("/")
        self.email = email
        self.phone = phone
        self.code = code or compute_fts_pairing_code(phone)
        self.pc_name = pc_name
        self.ssl_ctx = ssl_ctx
        self.cursor_path = app_home() / "sync_cursor.json"
        self.bridge_start_ts = int(time.time())
        self.acct: KakaoAccountReader | None = None
        self.last_by_room: dict[str, int] = self._load_cursor()
        self._seen_sig: dict[str, tuple] = {}
        self._mtimes: dict[str, float] = {}
        self._last_rescan = 0.0
        # 삭제 감지용 최근 메시지 추적 스냅샷 (방별 최대 100건)
        self._tracked_messages: dict[str, dict[int, dict]] = {}
        self._reported_deleted: set[tuple[str, int]] = set()
        self._last_del_sig: dict[str, tuple] = {}
        self._last_delete_check = 0.0
        # 하이브리드 첨부 파일 자동 수집 큐 (1차 URL 다운로드 + 2차 로컬 '카카오톡 받은 파일' 폴더 감시)
        self._att_lock = threading.Lock()
        self._attachment_queue: list[dict] = []
        self._pending_local_files: list[dict] = []
        self._uploaded_att_keys: set[str] = set()
        self._seen_local_files: dict[str, tuple[int, int]] = {}
        self._last_local_scan = 0.0

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
                self._seed_tracked_recent(cid, room, limit=30)
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

    def _track_message(self, cid: str, ev: dict, orig_type: int) -> None:
        lid = _int(ev.get("logId"))
        if lid <= 0:
            return
        bucket = self._tracked_messages.setdefault(cid, {})
        bucket[lid] = {
            "logId": lid,
            "roomName": ev.get("roomName") or "",
            "senderName": ev.get("senderName") or "",
            "message": ev.get("message") or "",
            "origType": orig_type,
            "sentAtStr": ev.get("sentAtStr") or "",
        }
        # 방당 최근 100건만 메모리 유지
        if len(bucket) > 100:
            for old_lid in sorted(bucket.keys())[:-100]:
                bucket.pop(old_lid, None)

    def _seed_tracked_recent(self, cid: str, room: dict, limit: int = 30) -> None:
        if not self.acct:
            return
        rows = self.acct.read_recent(cid, limit=limit)
        if not rows:
            return
        for r in reversed(rows):
            ev = self._format_message_row(r, room)
            if ev:
                self._track_message(cid, ev, _int(r["type"], 1))
        self._last_del_sig[cid] = self.acct.signature(cid)

    @staticmethod
    def _is_deleted_message_row(r: sqlite3.Row, tracked: dict) -> bool:
        typ = _int(r["type"], 1)
        msg = (r["message"] or "").strip()
        # 카카오톡 '모두에게서 삭제' 시 삭제 비트마스크(>=16384) 또는 type==0 적용
        if typ == 0 or typ >= 16384:
            return True
        # 본문이 삭제 안내 문구로 치환된 경우 (원본이 해당 문구가 아니었을 때만)
        deleted_phrases = ("삭제된 메시지입니다.", "삭제된 메시지입니다", "This message was deleted.")
        if msg in deleted_phrases and (tracked.get("message") or "").strip() not in deleted_phrases:
            return True
        return False

    def _detect_and_sync_deletions(self) -> None:
        if not self.acct:
            return
        now = time.time()
        if now - self._last_delete_check < 10.0:
            return
        self._last_delete_check = now

        deleted_events: list[dict] = []
        now_kst = dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")

        for room in self.acct.rooms:
            cid = room["id"]
            tracked_map = self._tracked_messages.get(cid)
            if not tracked_map or room["type"] == "PlusChat" or not self.acct.readable(cid):
                continue

            sig = self.acct.signature(cid)
            if self._last_del_sig.get(cid) == sig:
                continue

            # 활성 방에서 정상적으로 최근 120건을 읽은 경우에만 삭제 판정 (방 닫힘/키 해제 오탐 원천 방지)
            recent_rows = self.acct.read_recent(cid, limit=120)
            if not recent_rows:
                continue
            self._last_del_sig[cid] = sig

            rows_by_id = {_int(r["logId"]): r for r in recent_rows}
            min_fetched_lid = min(rows_by_id.keys())
            expired_lids: list[int] = []

            for lid, info in list(tracked_map.items()):
                if (cid, lid) in self._reported_deleted:
                    expired_lids.append(lid)
                    continue

                if lid in rows_by_id:
                    if self._is_deleted_message_row(rows_by_id[lid], info):
                        deleted_events.append({
                            "cid": cid,
                            "logId": lid,
                            "roomName": info["roomName"],
                            "senderName": info["senderName"],
                            "message": info["message"],
                            "deleteType": "ALL",
                            "deletedAtStr": now_kst,
                        })
                        expired_lids.append(lid)
                else:
                    if lid < min_fetched_lid:
                        # 최근 120건 윈도우 밖으로 밀려난 정상 오래된 메시지 -> 추적 종료
                        expired_lids.append(lid)
                    else:
                        # 최신 윈도우 내부에서 행 자체가 소실됨 -> 나에게만 삭제(로컬 삭제) 판정
                        deleted_events.append({
                            "cid": cid,
                            "logId": lid,
                            "roomName": info["roomName"],
                            "senderName": info["senderName"],
                            "message": info["message"],
                            "deleteType": "LOCAL",
                            "deletedAtStr": now_kst,
                        })
                        expired_lids.append(lid)

            for lid in expired_lids:
                tracked_map.pop(lid, None)

        if not deleted_events:
            return

        payload = json.dumps({
            "action": "MARK_DELETED",
            "email": self.email,
            "phone": self.phone,
            "code": self.code,
            "pcName": self.pc_name,
            "deletedMessages": [
                {
                    "logId": ev["logId"],
                    "roomName": ev["roomName"],
                    "senderName": ev["senderName"],
                    "message": ev["message"],
                    "deleteType": ev["deleteType"],
                    "deletedAtStr": ev["deletedAtStr"],
                }
                for ev in deleted_events
            ],
        }).encode("utf-8")

        res_data = None
        for attempt in range(4):
            try:
                req = urllib.request.Request(
                    f"{self.server_url}/api/user/messages/kakao/pc-agent",
                    data=payload,
                    method="POST",
                    headers={
                        "Content-Type": "application/json; charset=utf-8",
                        "User-Agent": "SheetBot-PC-Kakao-Agent/2.0",
                        "Cookie": "__egdesk_tunnel_ctx=mcp-server-fxkud1:SheetBot",
                    },
                )
                with urllib.request.urlopen(req, timeout=10, context=self.ssl_ctx) as resp:
                    res_data = json.loads(resp.read().decode("utf-8", errors="replace"))
                    break
            except Exception:
                if attempt < 3:
                    time.sleep(0.5 * (attempt + 1))

        if res_data is not None:
            for ev in deleted_events:
                self._reported_deleted.add((ev["cid"], ev["logId"]))
            updated = res_data.get("updatedCount", 0)
            ts = time.strftime("%H:%M:%S")
            for ev in deleted_events:
                scope_tag = "모두에게 삭제" if ev["deleteType"] == "ALL" else "대화창 삭제"
                print(
                    f"[{ts}] 🗑️ [{scope_tag} 감지] [{ev['roomName']}] {ev['senderName']}: {ev['message'][:35]} "
                    f"(시트 원본 보존 · '삭제됨' 표시: {updated}건)"
                )

    # ------------------------------------------------------------------
    # 하이브리드 첨부 파일 자동 저장 (1차 URL 다운로드 + 2차 로컬 폴더 감시 + 자동 청크 분할 업로드)
    # ------------------------------------------------------------------
    MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024  # 20MB 상한
    CHUNKED_ATTACHMENT_THRESHOLD_BYTES = 700 * 1024  # 700KB 초과 시 자동 청크 업로드
    ATTACHMENT_CHUNK_RAW_BYTES = 450 * 1024  # 450KB 원본 (Base64 약 600KB)

    @staticmethod
    def _build_multipart_form_data(
        fields: dict[str, str],
        file_field: str,
        filename: str,
        content_type: str,
        file_bytes: bytes,
    ) -> tuple[bytes, str]:
        boundary = f"----SheetBotKakaoAtt{uuid.uuid4().hex}"
        chunks: list[bytes] = []
        for k, v in fields.items():
            chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            chunks.append(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode("utf-8"))
            chunks.append(f"{v}\r\n".encode("utf-8"))

        safe_name = filename.replace('"', "_").replace("\r", "").replace("\n", "")
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            f'Content-Disposition: form-data; name="{file_field}"; filename="{safe_name}"\r\n'.encode("utf-8")
        )
        chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        chunks.append(file_bytes)
        chunks.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
        return b"".join(chunks), f"multipart/form-data; boundary={boundary}"

    @staticmethod
    def _normalize_kakao_filename(name: str) -> str:
        """카톡 중복 다운로드 접미사('파일 (1).pdf' -> '파일.pdf')를 제거해 매칭용 이름을 정규화합니다."""
        base, ext = os.path.splitext((name or "").strip())
        base = re.sub(r"\s*\(\d+\)$", "", base).strip()
        return (base + ext).lower()

    @staticmethod
    def _kakao_download_dirs() -> list[Path]:
        home = Path.home()
        candidates = [
            home / "Documents" / "카카오톡 받은 파일",
            home / "OneDrive" / "Documents" / "카카오톡 받은 파일",
            home / "OneDrive" / "문서" / "카카오톡 받은 파일",
            home / "문서" / "카카오톡 받은 파일",
            home / "Downloads" / "카카오톡 받은 파일",
        ]
        out: list[Path] = []
        seen: set[str] = set()
        for p in candidates:
            try:
                if p.exists() and p.is_dir():
                    rp = str(p.resolve()).lower()
                    if rp not in seen:
                        seen.add(rp)
                        out.append(p)
            except Exception:
                pass
        return out

    def _enqueue_attachment_if_any(self, r: sqlite3.Row, ev: dict) -> None:
        typ = _int(r["type"], 1)
        if typ not in (2, 3, 5, 18, 27):
            return
        try:
            att = json.loads(r["attachement"] or "{}")
            if not isinstance(att, dict):
                att = {}
        except Exception:
            att = {}

        # URL 후보 추출 (단일 url / originalUrl / imageUrls 등)
        urls: list[str] = []
        for k in ("url", "originalUrl", "orgUrl", "path", "fileUrl"):
            v = att.get(k)
            if isinstance(v, str) and v.startswith(("http://", "https://")) and v not in urls:
                urls.append(v)
        for k in ("imageUrls", "urls", "orgUrls"):
            arr = att.get(k)
            if isinstance(arr, list):
                for item in arr:
                    if isinstance(item, str) and item.startswith(("http://", "https://")) and item not in urls:
                        urls.append(item)
        urls = urls[:5]

        raw_name = str(att.get("name") or att.get("fileName") or "").strip()
        if not raw_name:
            default_ext = {2: ".jpg", 27: ".jpg", 3: ".mp4", 5: ".m4a", 18: ".bin"}.get(typ, ".bin")
            if urls:
                parsed_path = urllib.parse.urlparse(urls[0]).path
                _, url_ext = os.path.splitext(parsed_path)
                if url_ext and len(url_ext) <= 6:
                    default_ext = url_ext
            raw_name = f"kakao_{ev['logId']}{default_ext}"

        size = _int(att.get("size") or att.get("s"), 0)
        if size > self.MAX_ATTACHMENT_BYTES:
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] ⚠️ [첨부 스킵] [{ev['roomName']}] {raw_name} (20MB 초과: {size // (1024*1024)}MB)")
            return

        msg_type_label = {2: "사진", 27: "사진 묶음", 3: "동영상", 5: "음성", 18: "파일"}.get(typ, "파일")
        job = {
            "logId": ev["logId"],
            "roomName": ev["roomName"],
            "senderName": ev["senderName"],
            "direction": "발신" if ev.get("mine") else "수신",
            "sentAtStr": ev.get("sentAtStr") or "",
            "messageType": msg_type_label,
            "fileName": raw_name,
            "urls": urls,
            "msgType": typ,
            "createdAt": time.time(),
        }
        with self._att_lock:
            self._attachment_queue.append(job)

    def _post_json_attachment(self, endpoint: str, payload_obj: dict, timeout: int = 30) -> dict:
        data = json.dumps(payload_obj).encode("utf-8")
        last_err: Exception | None = None
        for attempt in range(2):
            try:
                req = urllib.request.Request(
                    endpoint,
                    data=data,
                    method="POST",
                    headers={
                        "Content-Type": "application/json; charset=utf-8",
                        "User-Agent": "SheetBot-PC-Kakao-Agent/2.2",
                        "Cookie": "__egdesk_tunnel_ctx=mcp-server-fxkud1:SheetBot",
                    },
                )
                with urllib.request.urlopen(req, timeout=timeout, context=self.ssl_ctx) as resp:
                    return json.loads(resp.read().decode("utf-8", errors="replace"))
            except Exception as err:
                last_err = err
                if attempt == 0:
                    time.sleep(0.5)
        raise last_err or RuntimeError("chunked attachment request failed")

    def _upload_attachment_chunked(
        self,
        endpoint: str,
        fields: dict[str, str],
        file_name: str,
        mime_type: str,
        data: bytes,
    ) -> dict:
        # 1단계: init
        init_res = self._post_json_attachment(
            endpoint,
            {
                "action": "init",
                **fields,
                "fileName": file_name,
                "mimeType": mime_type,
                "totalSize": len(data),
            },
            timeout=20,
        )
        upload_id = init_res.get("uploadId")
        if not (init_res.get("ok") or init_res.get("success")) or not upload_id:
            raise RuntimeError(init_res.get("error") or "chunked attachment init failed")

        # 2단계: 450KB 원본(Base64 ~600KB) 단위 순차 청크 전송
        offset = 0
        total_len = len(data)
        while offset < total_len:
            chunk = data[offset : offset + self.ATTACHMENT_CHUNK_RAW_BYTES]
            chunk_b64 = base64.b64encode(chunk).decode("ascii")
            chunk_res = self._post_json_attachment(
                endpoint,
                {
                    "action": "chunk",
                    "uploadId": upload_id,
                    "email": fields.get("email", ""),
                    "phone": fields.get("phone", ""),
                    "code": fields.get("code", ""),
                    "chunkBase64": chunk_b64,
                },
                timeout=30,
            )
            if not (chunk_res.get("ok") or chunk_res.get("success")):
                raise RuntimeError(chunk_res.get("error") or "chunked attachment append failed")
            offset += len(chunk)

        # 3단계: commit
        return self._post_json_attachment(
            endpoint,
            {
                "action": "commit",
                "uploadId": upload_id,
                "email": fields.get("email", ""),
                "phone": fields.get("phone", ""),
                "code": fields.get("code", ""),
            },
            timeout=60,
        )

    def _upload_to_fts_kakao_media(
        self,
        *,
        log_id: int,
        room_name: str,
        sender_name: str,
        file_name: str,
        data: bytes,
        mime_type: str,
        sent_at_str: str = "",
        message_type: str = "파일",
        direction: str = "수신",
        media_index: int = 1,
        media_total: int = 1,
    ) -> bool:
        """파투(FileToSheet) /api/staging/kakao-media 20MB 자동 청크 분할 업로드"""
        if not self.phone or not self.fts_server_url or not data or len(data) > self.MAX_ATTACHMENT_BYTES:
            return False
        pairing_code = compute_fts_pairing_code(self.phone)
        endpoint = f"{self.fts_server_url}/api/staging/kakao-media"
        common_fields = {
            "phoneNumber": self.phone,
            "pairingCode": pairing_code,
            "roomName": room_name,
            "senderName": sender_name,
            "direction": direction,
            "sentAtStr": sent_at_str,
            "messageType": message_type,
            "logId": str(log_id),
            "pcName": self.pc_name,
            "mediaIndex": str(media_index),
            "mediaTotal": str(media_total),
        }

        def _post_fts_json(payload_obj: dict, timeout: int = 30) -> dict:
            raw_bytes = json.dumps(payload_obj).encode("utf-8")
            last_err: Exception | None = None
            for attempt in range(2):
                try:
                    req = urllib.request.Request(
                        endpoint,
                        data=raw_bytes,
                        method="POST",
                        headers={
                            "Content-Type": "application/json; charset=utf-8",
                            "User-Agent": "SheetBot-PC-Kakao-Agent/2.2",
                        },
                    )
                    with urllib.request.urlopen(req, timeout=timeout, context=self.ssl_ctx) as resp:
                        return json.loads(resp.read().decode("utf-8", errors="replace"))
                except Exception as err:
                    last_err = err
                    if attempt == 0:
                        time.sleep(0.5)
            raise last_err or RuntimeError("fts chunked upload failed")

        def _upload_fts_chunked() -> dict:
            init_res = _post_fts_json(
                {
                    "action": "init",
                    **common_fields,
                    "fileName": file_name,
                    "mimeType": mime_type or "application/octet-stream",
                    "totalSize": len(data),
                },
                timeout=20,
            )
            upload_id = init_res.get("uploadId")
            if not init_res.get("success") or not upload_id:
                raise RuntimeError(init_res.get("error") or "fts init failed")

            offset = 0
            while offset < len(data):
                chunk = data[offset : offset + self.ATTACHMENT_CHUNK_RAW_BYTES]
                chunk_res = _post_fts_json(
                    {
                        "action": "chunk",
                        "uploadId": upload_id,
                        "phoneNumber": self.phone,
                        "pairingCode": pairing_code,
                        "chunkBase64": base64.b64encode(chunk).decode("ascii"),
                    },
                    timeout=30,
                )
                if not chunk_res.get("success"):
                    raise RuntimeError(chunk_res.get("error") or "fts chunk failed")
                offset += len(chunk)

            return _post_fts_json(
                {
                    "action": "commit",
                    "uploadId": upload_id,
                    "phoneNumber": self.phone,
                    "pairingCode": pairing_code,
                },
                timeout=60,
            )

        use_chunked = len(data) > self.CHUNKED_ATTACHMENT_THRESHOLD_BYTES
        try:
            if use_chunked:
                res = _upload_fts_chunked()
            else:
                try:
                    body_bytes, ct_header = self._build_multipart_form_data(
                        fields=common_fields,
                        file_field="file",
                        filename=file_name,
                        content_type=mime_type or "application/octet-stream",
                        file_bytes=data,
                    )
                    req = urllib.request.Request(
                        endpoint,
                        data=body_bytes,
                        method="POST",
                        headers={
                            "Content-Type": ct_header,
                            "User-Agent": "SheetBot-PC-Kakao-Agent/2.2",
                        },
                    )
                    with urllib.request.urlopen(req, timeout=30, context=self.ssl_ctx) as resp:
                        res = json.loads(resp.read().decode("utf-8", errors="replace"))
                except urllib.error.HTTPError as http_err:
                    if http_err.code == 413:
                        use_chunked = True
                        res = _upload_fts_chunked()
                    else:
                        raise
            if res and res.get("success"):
                ts = time.strftime("%H:%M:%S")
                mode_tag = "청크분할" if use_chunked else "단일"
                print(
                    f"[{ts}] 📎 [파투 원본 저장({mode_tag})] [{room_name}] {file_name} "
                    f"(파일ID: #{res.get('fileId')}, 처리: {res.get('action')})"
                )
                return True
        except Exception as fts_err:
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] ⚠️ [파투 원본 저장 경고] [{room_name}] {file_name}: {fts_err}")
        return False

    def _upload_attachment_bytes(
        self,
        *,
        log_id: int,
        room_name: str,
        sender_name: str,
        file_name: str,
        data: bytes,
        mime_type: str,
        source: str,
        sent_at_str: str = "",
        message_type: str = "파일",
        direction: str = "수신",
        media_index: int = 1,
        media_total: int = 1,
    ) -> bool:
        if not data or len(data) > self.MAX_ATTACHMENT_BYTES:
            return False
        dedupe_key = f"{log_id}:{file_name}:{len(data)}"
        if dedupe_key in self._uploaded_att_keys:
            return True

        # 1. 파투(FileToSheet) 직결 20MB 청크 업로드 (원본 증빙 + AI 요약)
        fts_ok = self._upload_to_fts_kakao_media(
            log_id=log_id,
            room_name=room_name,
            sender_name=sender_name,
            file_name=file_name,
            data=data,
            mime_type=mime_type,
            sent_at_str=sent_at_str,
            message_type=message_type,
            direction=direction,
            media_index=media_index,
            media_total=media_total,
        )

        # 2. 시트봇(SheetBot) 20MB 청크 업로드 (구글 드라이브 보관 + 구글 시트 E열 AI 요약 + I열 파일링크 + 할 일 연계)
        endpoint = f"{self.server_url}/api/user/messages/kakao/attachment"
        common_fields = {
            "email": self.email,
            "phone": self.phone,
            "code": self.code,
            "pcName": self.pc_name,
            "logId": str(log_id),
            "roomName": room_name,
            "senderName": sender_name,
            "sentAtStr": sent_at_str,
            "messageType": message_type,
            "mediaIndex": str(media_index),
            "mediaTotal": str(media_total),
            "fileName": file_name,
            "mimeType": mime_type or "application/octet-stream",
            "source": source,
            "skipFtsSync": "1" if fts_ok else "0",
        }

        use_chunked = len(data) > self.CHUNKED_ATTACHMENT_THRESHOLD_BYTES
        sb_ok = False
        for attempt in range(3):
            try:
                if use_chunked:
                    res = self._upload_attachment_chunked(
                        endpoint, common_fields, file_name, mime_type or "application/octet-stream", data
                    )
                else:
                    try:
                        body_bytes, ct_header = self._build_multipart_form_data(
                            fields=common_fields,
                            file_field="file",
                            filename=file_name,
                            content_type=mime_type or "application/octet-stream",
                            file_bytes=data,
                        )
                        req = urllib.request.Request(
                            endpoint,
                            data=body_bytes,
                            method="POST",
                            headers={
                                "Content-Type": ct_header,
                                "User-Agent": "SheetBot-PC-Kakao-Agent/2.2",
                                "Cookie": "__egdesk_tunnel_ctx=mcp-server-fxkud1:SheetBot",
                            },
                        )
                        with urllib.request.urlopen(req, timeout=30, context=self.ssl_ctx) as resp:
                            res = json.loads(resp.read().decode("utf-8", errors="replace"))
                    except urllib.error.HTTPError as http_err:
                        if http_err.code == 413:
                            use_chunked = True
                            res = self._upload_attachment_chunked(
                                endpoint, common_fields, file_name, mime_type or "application/octet-stream", data
                            )
                        else:
                            raise

                if res.get("ok") or res.get("success"):
                    sb_ok = True
                    ts = time.strftime("%H:%M:%S")
                    src_tag = "URL 자동저장" if source == "URL_DOWNLOAD" else "로컬폴더 자동저장"
                    mode_tag = "청크분할" if use_chunked else "단일"
                    print(
                        f"[{ts}] 📎 [시트봇 {src_tag}({mode_tag})] [{room_name}] {file_name} -> 구글 드라이브 & 시트 링크 기록 완료"
                    )
                    break
                if res.get("skipped"):
                    sb_ok = True
                    break
            except Exception:
                if attempt < 2:
                    time.sleep(1.0 * (attempt + 1))

        if fts_ok or sb_ok:
            self._uploaded_att_keys.add(dedupe_key)
            return True
        return False

    def _download_url_bytes(self, url: str) -> tuple[bytes | None, str]:
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KakaoTalk"},
            )
            with urllib.request.urlopen(req, timeout=15, context=self.ssl_ctx) as resp:
                ctype = (resp.headers.get("Content-Type") or "application/octet-stream").split(";")[0].strip().lower()
                if ctype.startswith("text/html"):
                    return None, ctype
                clen = _int(resp.headers.get("Content-Length"), 0)
                if clen > self.MAX_ATTACHMENT_BYTES:
                    return None, ctype
                chunks: list[bytes] = []
                total = 0
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > self.MAX_ATTACHMENT_BYTES:
                        return None, ctype
                    chunks.append(chunk)
                data = b"".join(chunks)
                return (data if data else None), ctype
        except Exception:
            return None, "application/octet-stream"

    def _process_attachment_queue_once(self) -> None:
        with self._att_lock:
            jobs = list(self._attachment_queue)
            self._attachment_queue.clear()

        for job in jobs:
            uploaded_any = False
            urls = job.get("urls") or []
            base_name = job["fileName"]
            total_urls = max(1, len(urls))

            # 1차 시도: attachement URL 직접 다운로드
            for idx, u in enumerate(urls):
                data, ctype = self._download_url_bytes(u)
                if not data:
                    continue
                fname = base_name
                if len(urls) > 1:
                    stem, ext = os.path.splitext(base_name)
                    fname = f"{stem}_{idx + 1}{ext}"
                guessed_mime = mimetypes.guess_type(fname)[0] or ctype
                if self._upload_attachment_bytes(
                    log_id=job["logId"],
                    room_name=job["roomName"],
                    sender_name=job["senderName"],
                    file_name=fname,
                    data=data,
                    mime_type=guessed_mime,
                    source="URL_DOWNLOAD",
                    sent_at_str=job.get("sentAtStr") or "",
                    message_type=job.get("messageType") or "파일",
                    direction=job.get("direction") or "수신",
                    media_index=idx + 1,
                    media_total=total_urls,
                ):
                    uploaded_any = True

            # 2차 보완: URL이 없거나 다운로드 실패한 파일(type==18 등)은 로컬 '카카오톡 받은 파일' 폴더 감시 대기열로 이관
            if not uploaded_any:
                with self._att_lock:
                    self._pending_local_files.append(job)
                    # 최대 50건, 최근 2시간 이내 항목만 유지
                    cutoff = time.time() - 7200
                    self._pending_local_files = [
                        x for x in self._pending_local_files[-50:] if x.get("createdAt", 0) >= cutoff
                    ]
                ts = time.strftime("%H:%M:%S")
                print(
                    f"[{ts}] 📎 [로컬 저장 대기] [{job['roomName']}] {base_name} "
                    f"(PC 카톡에서 파일을 클릭해 저장하면 자동으로 구글 드라이브에 업로드됩니다)"
                )

    def _scan_kakao_download_folder_once(self) -> None:
        now = time.time()
        if now - self._last_local_scan < 5.0:
            return
        self._last_local_scan = now

        with self._att_lock:
            if not self._pending_local_files:
                return
            cutoff = now - 7200
            self._pending_local_files = [x for x in self._pending_local_files if x.get("createdAt", 0) >= cutoff]
            pending_snapshot = list(self._pending_local_files)

        if not pending_snapshot:
            return

        dirs = self._kakao_download_dirs()
        if not dirs:
            return

        matched_log_ids: set[int] = set()
        for d in dirs:
            try:
                entries = list(d.iterdir())
            except Exception:
                continue
            for p in entries:
                if not p.is_file():
                    continue
                try:
                    st = p.stat()
                except OSError:
                    continue
                # 쓰기 완료된 1초 이상 경과 + 20MB 이하 파일만 대상
                if st.st_size <= 0 or st.st_size > self.MAX_ATTACHMENT_BYTES:
                    continue
                if now - st.st_mtime < 1.0:
                    continue
                sig = (st.st_mtime_ns, st.st_size)
                key_path = str(p)
                if self._seen_local_files.get(key_path) == sig:
                    continue

                norm_local = self._normalize_kakao_filename(p.name)
                matched_job = None
                for job in reversed(pending_snapshot):
                    if job["logId"] in matched_log_ids:
                        continue
                    # 메시지가 감지된 시점 전후(최대 30초 이전~이후)에 저장된 파일 매칭
                    if st.st_mtime < job.get("createdAt", 0) - 30:
                        continue
                    if self._normalize_kakao_filename(job["fileName"]) == norm_local:
                        matched_job = job
                        break

                if not matched_job:
                    continue

                try:
                    data = p.read_bytes()
                except Exception:
                    continue

                guessed_mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
                ok = self._upload_attachment_bytes(
                    log_id=matched_job["logId"],
                    room_name=matched_job["roomName"],
                    sender_name=matched_job["senderName"],
                    file_name=matched_job["fileName"],
                    data=data,
                    mime_type=guessed_mime,
                    source="LOCAL_FOLDER",
                    sent_at_str=matched_job.get("sentAtStr") or "",
                    message_type=matched_job.get("messageType") or "파일",
                    direction=matched_job.get("direction") or "수신",
                    media_index=1,
                    media_total=1,
                )
                if ok:
                    self._seen_local_files[key_path] = sig
                    matched_log_ids.add(matched_job["logId"])

        if matched_log_ids:
            with self._att_lock:
                self._pending_local_files = [
                    x for x in self._pending_local_files if x["logId"] not in matched_log_ids
                ]

    def _start_attachment_worker_thread(self) -> None:
        def _att_loop():
            while True:
                try:
                    self._process_attachment_queue_once()
                    self._scan_kakao_download_folder_once()
                except Exception:
                    pass
                time.sleep(2.0)

        t = threading.Thread(target=_att_loop, daemon=True)
        t.start()

    def poll_and_sync(self) -> None:
        if not self._ensure_initialized() or self.acct is None:
            return
        self._rescan_changed_rooms()
        new_events: list[dict] = []
        pending_att_rows: list[tuple[sqlite3.Row, dict]] = []
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
                    self._track_message(cid, ev, _int(r["type"], 1))
                    pending_att_rows.append((r, ev))

            self._seen_sig[cid] = (sig, self.last_by_room.get(cid, 0))

        if cursor_dirty:
            self._save_cursor()

        # 삭제된 대화/첨부파일 감지 및 시트 '삭제됨' 표시 동기화 (10초 주기, DB 변경 시에만 조회)
        try:
            self._detect_and_sync_deletions()
        except Exception:
            pass

        if not new_events:
            return

        payload = json.dumps({
            "action": "SYNC_MESSAGES",
            "email": self.email,
            "phone": self.phone,
            "code": self.code,
            "pcName": self.pc_name,
            "messages": new_events,
        }).encode("utf-8")

        res_data = None
        for attempt in range(4):
            try:
                req = urllib.request.Request(
                    f"{self.server_url}/api/user/messages/kakao/pc-agent",
                    data=payload,
                    method="POST",
                    headers={
                        "Content-Type": "application/json; charset=utf-8",
                        "User-Agent": "SheetBot-PC-Kakao-Agent/2.0",
                        "Cookie": "__egdesk_tunnel_ctx=mcp-server-fxkud1:SheetBot",
                    },
                )
                with urllib.request.urlopen(req, timeout=10, context=self.ssl_ctx) as resp:
                    res_data = json.loads(resp.read().decode("utf-8", errors="replace"))
                    break
            except Exception:
                if attempt < 3:
                    time.sleep(0.5 * (attempt + 1))
                else:
                    raise

        if res_data is not None:
            synced = res_data.get("syncedCount", 0)
            dedup = res_data.get("deduplicatedCount", 0)
            ts = time.strftime("%H:%M:%S")
            for ev in new_events:
                dir_tag = "📤 내 PC 직접발신" if ev["mine"] else "📩 열린창 수신"
                print(
                    f"[{ts}] 💬 [{dir_tag}] [{ev['roomName']}] {ev['senderName']}: {ev['message'][:35]} "
                    f"(파투적재: {synced}건, 중복스킵: {dedup}건)"
                )

        # 메시지 행이 시트에 먼저 적재된 뒤 첨부 파일 업로드 워커로 전달 (I열 파일링크 100% 매칭)
        for r, ev in pending_att_rows:
            self._enqueue_attachment_if_any(r, ev)

    def start_background_thread(self) -> None:
        self._start_attachment_worker_thread()

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
DEFAULT_FTS_SERVER_URL = "https://file2sheet.cloud"


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


def resolve_agent_settings() -> tuple[str, str, str, str, str]:
    cfg = load_saved_config()
    server_url = os.environ.get("SHEETBOT_SERVER_URL") or cfg.get("sheetbotServerUrl") or cfg.get("serverUrl") or DEFAULT_SERVER_URL
    fts_server_url = os.environ.get("FTS_SERVER_URL") or cfg.get("ftsServerUrl") or DEFAULT_FTS_SERVER_URL
    email = (os.environ.get("SHEETBOT_USER_EMAIL") or cfg.get("userEmail") or "").strip()
    phone = (os.environ.get("SHEETBOT_USER_PHONE") or cfg.get("phoneNumber") or "").strip()
    code = (os.environ.get("SHEETBOT_PAIRING_CODE") or cfg.get("pairingCode") or "").strip()

    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a in ("--email", "-e") and i + 1 < len(args):
            email = args[i + 1].strip()
        elif a in ("--phone", "-p") and i + 1 < len(args):
            phone = args[i + 1].strip()
        elif a in ("--code", "-c") and i + 1 < len(args):
            code = args[i + 1].strip()
        elif a in ("--server", "-s") and i + 1 < len(args):
            server_url = args[i + 1].strip().rstrip("/")
        elif a in ("--fts-server",) and i + 1 < len(args):
            fts_server_url = args[i + 1].strip().rstrip("/")

    # SB- 접두어 자동 정규화
    if code:
        code = code.upper().replace("SB-", "").strip()

    # 전화번호 숫자 정규화 및 이메일이 비어 있을 때 자동 생성
    clean_phone = "".join(ch for ch in str(phone) if ch.isdigit())
    if not clean_phone and email:
        m = re.match(r"^([0-9]{9,12})@", email)
        if m:
            clean_phone = m.group(1)

    if not email and clean_phone and len(clean_phone) >= 9 and clean_phone.startswith("01"):
        email = f"{clean_phone}@fts.local"

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
            clean_phone = digits_only
            email = f"{digits_only}@fts.local"
        else:
            code = user_input.upper().replace("SB-", "").strip()

    if not code and clean_phone:
        code = compute_fts_pairing_code(clean_phone)

    save_config({
        "serverUrl": server_url,
        "ftsServerUrl": fts_server_url,
        "userEmail": email,
        "phoneNumber": clean_phone,
        "pairingCode": code,
    })
    return server_url.rstrip("/"), fts_server_url.rstrip("/"), email, clean_phone, code


def run_bridge_loop():
    server_url, fts_server_url, email, phone, code = resolve_agent_settings()
    pc_name = socket.gethostname() or "Windows-PC"
    ssl_ctx = ssl.create_default_context()

    print("\n" + "=" * 68)
    print("  🚀 [SheetBot & 파투 내 PC 카톡 브리지 v2.2] 실시간 연결 시작!")
    print(f"  • 연결 서버   : {server_url} (파투 미디어: {fts_server_url})")
    print(f"  • 연동 계정   : {email or phone or code}")
    print(f"  • 내 PC 이름  : {pc_name}")
    print("=" * 68)

    ready, detail = check_kakao_ready()
    status_icon = "🟢 준비 완료" if ready else "🟡 대기 중 (PC 카카오톡 로그인/잠금해제 필요)"
    print(f"  • PC 카카오톡 : {status_icon} — {detail}")
    print("  • 기능 1: 스마트폰 [AI 비서 카드]에서 [내 PC 카톡 자동 발송] 시 무포커스 자동 전송")
    print("  • 기능 2: PC 카톡 열린 대화창의 실시간 대화·삭제 감지 자동 기록")
    print("  • 기능 3: 사진·파일 원본 20MB 자동 청크 분할 업로드 (구글 시트 + 파투 동시 연동)\n")

    # 열린 대화창 실시간 감시 백그라운드 스레드 기동 (kakao_native)
    watcher = KakaoNativeLiveWatcher(server_url, fts_server_url, email, phone, code, pc_name, ssl_ctx)
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
                "phone": phone,
                "code": code,
                "pcName": pc_name,
                "kakaoReady": "1" if ready else "0",
                "kakaoDetail": detail,
                "waitMs": "0",
            })
            poll_url = f"{server_url}/api/user/messages/kakao/pc-agent?{query}"
            req = urllib.request.Request(
                poll_url,
                method="GET",
                headers={
                    "User-Agent": "SheetBot-PC-Kakao-Agent/2.0",
                    "Cookie": "__egdesk_tunnel_ctx=mcp-server-fxkud1:SheetBot",
                },
            )

            with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                data = json.loads(raw)

            if consecutive_errors >= 5:
                ts = time.strftime("%H:%M:%S")
                print(f"[{ts}] 🟢 서버 연결이 정상 복구되었습니다.")
            consecutive_errors = 0
            job = data.get("job")
            if not job:
                time.sleep(2.5)
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
                "phone": phone,
                "code": code,
                "pcName": pc_name,
                "ok": bool(send_res.get("ok")),
                "confirmed": bool(send_res.get("confirmed")),
                "alreadyOpen": bool(send_res.get("already_open")),
                "draftPresent": bool(send_res.get("draft_present")),
                "error": send_res.get("error", ""),
            }).encode("utf-8")

            for _rep_try in range(4):
                try:
                    report_req = urllib.request.Request(
                        f"{server_url}/api/user/messages/kakao/pc-agent",
                        data=report_payload,
                        method="POST",
                        headers={
                            "Content-Type": "application/json; charset=utf-8",
                            "User-Agent": "SheetBot-PC-Kakao-Agent/2.0",
                            "Cookie": "__egdesk_tunnel_ctx=mcp-server-fxkud1:SheetBot",
                        },
                    )
                    with urllib.request.urlopen(report_req, timeout=10, context=ssl_ctx) as _:
                        break
                except Exception:
                    time.sleep(0.5)

        except KeyboardInterrupt:
            print("\n👋 사용자에 의해 시트봇 내 PC 카톡 브리지가 종료되었습니다.")
            break
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="replace").strip()[:160]
            except Exception:
                pass
            consecutive_errors += 1
            # Render/Cloudflare 터널 프록시의 간헐적 빈 400 응답(Content-Length: 0)은 콘솔을 어지럽히지 않고 1초 뒤 조용히 재시도
            if e.code == 400 and not err_body and consecutive_errors < 5:
                time.sleep(1.0)
                continue
            wait_sec = min(10, 2 * consecutive_errors)
            ts = time.strftime("%H:%M:%S")
            detail_msg = f"HTTP {e.code} {e.reason}" + (f" - {err_body}" if err_body else "")
            print(f"[{ts}] 🔄 서버 재연결 대기 중 ({wait_sec}초)... ({detail_msg})")
            time.sleep(wait_sec)
        except Exception as e:
            consecutive_errors += 1
            if consecutive_errors < 3:
                time.sleep(1.0)
                continue
            wait_sec = min(10, 2 * consecutive_errors)
            ts = time.strftime("%H:%M:%S")
            print(f"[{ts}] 🔄 서버 재연결 대기 중 ({wait_sec}초)... ({e})")
            time.sleep(wait_sec)


if __name__ == "__main__":
    run_bridge_loop()
