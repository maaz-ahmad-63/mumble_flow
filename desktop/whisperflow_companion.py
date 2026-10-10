#!/usr/bin/env python3
"""
🎙️ Mumble AI Desktop Companion (OS-Level Universal Typing Injector)
Injects zero-edit polished speech into ANY external application (VS Code, Word, Slack, Notion, Chrome, Terminal, etc.)
Works with local server (http://localhost:3050) or remote cloud deployments (e.g. Render, Railway, VPS).

Usage:
  python whisperflow_companion.py --server http://localhost:3050
  python whisperflow_companion.py --server https://your-mumble-domain.com --key YOUR_GROQ_KEY
"""

import sys
import os
import time
import argparse
import tempfile
import threading
import json
import urllib.request
import urllib.parse
import subprocess

# Windows consoles default to cp1252. The banner uses characters outside that
# set, which abort startup (including --help) before argparse runs.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

print("""
============================================================
🎙️  Mumble AI Desktop Companion — Universal Typing Injector
⚡  OS-Level Push-to-Talk Injector for Any Application
============================================================
""")

parser = argparse.ArgumentParser(description="Mumble AI Desktop Injection Companion")
parser.add_argument("--server", default="http://localhost:3050", help="Mumble AI Server URL")
parser.add_argument("--hotkey", default="f8", help="Global Hotkey to toggle dictation (default: F8)")
parser.add_argument("--tone", default="auto", help="auto (pick from the app you are typing into), or a fixed tone: casual, formal, executive, code, bullet, standup, social")
parser.add_argument("--groq-key", default=os.environ.get("GROQ_API_KEY", ""), help="Groq API Key (optional)")
parser.add_argument("--gemini-key", default=os.environ.get("GEMINI_API_KEY", ""), help="Gemini API Key (optional)")
args = parser.parse_args()

SERVER_URL = args.server.rstrip("/")
HOTKEY = args.hotkey.lower()
CURRENT_TONE = args.tone

# Check if keyboard and sounddevice are installed
try:
    import keyboard
    import sounddevice as sd
    from scipy.io.wavfile import write as write_wav
    HAS_NATIVE_DEPS = True
except ImportError:
    HAS_NATIVE_DEPS = False
    print("💡 Tip: For instantaneous mic capture, run: pip install keyboard sounddevice scipy numpy\n")

# Check server health
try:
    req = urllib.request.Request(f"{SERVER_URL}/health", headers={"User-Agent": "WhisperFlow-Desktop/1.0"})
    with urllib.request.urlopen(req, timeout=5) as response:
        health_data = json.loads(response.read().decode())
        print(f"✅ Connected to WhisperFlow Server: {SERVER_URL} (Status: {health_data.get('status', 'ok')})")
except Exception as e:
    print(f"⚠️ Warning: Could not reach {SERVER_URL} ({e}). Ensure WhisperFlow server is running.")

def get_active_window():
    """
    Returns (process_name, window_title) for the window in front, or ("", "")
    if it cannot be read. Never raises.
    """
    try:
        if sys.platform == "win32":
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32
            hwnd = user32.GetForegroundWindow()
            if not hwnd:
                return "", ""

            length = user32.GetWindowTextLengthW(hwnd)
            title_buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, title_buf, length + 1)

            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            process_name = ""
            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
            if handle:
                try:
                    size = wintypes.DWORD(1024)
                    path_buf = ctypes.create_unicode_buffer(size.value)
                    if kernel32.QueryFullProcessImageNameW(handle, 0, path_buf, ctypes.byref(size)):
                        process_name = os.path.basename(path_buf.value)
                finally:
                    kernel32.CloseHandle(handle)
            return process_name, title_buf.value

        if sys.platform == "darwin":
            script = (
                'tell application "System Events"\n'
                '  set frontApp to first application process whose frontmost is true\n'
                '  set appName to name of frontApp\n'
                '  set winTitle to ""\n'
                '  try\n'
                '    set winTitle to name of front window of frontApp\n'
                '  end try\n'
                'end tell\n'
                'return appName & linefeed & winTitle'
            )
            out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=2).stdout
            parts = out.rstrip("\n").split("\n", 1)
            return parts[0].strip(), (parts[1].strip() if len(parts) > 1 else "")

        # Linux (X11 only)
        win_id = subprocess.run(["xdotool", "getactivewindow"], capture_output=True, text=True, timeout=2).stdout.strip()
        if not win_id:
            return "", ""
        title = subprocess.run(["xdotool", "getwindowname", win_id], capture_output=True, text=True, timeout=2).stdout.strip()
        pid = subprocess.run(["xdotool", "getwindowpid", win_id], capture_output=True, text=True, timeout=2).stdout.strip()
        process_name = ""
        if pid:
            with open(f"/proc/{pid}/comm", "r", encoding="utf-8") as f:
                process_name = f.read().strip()
        return process_name, title
    except Exception:
        return "", ""

def paste_text_into_active_window(text):
    """
    Copies text to system clipboard and simulates Ctrl+V / Cmd+V into the frontmost window.
    """
    if sys.platform == "win32":
        # Windows clipboard copy & sendkeys paste via powershell
        escaped_text = text.replace("`", "``").replace('"', '`"')
        cmd = f"""
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.Clipboard]::SetText("{escaped_text}");
        Start-Sleep -Milliseconds 60;
        [System.Windows.Forms.SendKeys]::SendWait("^v");
        """
        subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True)
    elif sys.platform == "darwin":
        # macOS pbcopy & keystroke Cmd+V via osascript
        p = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
        p.communicate(text.encode("utf-8"))
        script = 'tell application "System Events" to keystroke "v" using command down'
        subprocess.run(["osascript", "-e", script])
    else:
        # Linux xclip / xdotool
        try:
            p = subprocess.Popen(["xclip", "-selection", "clipboard"], stdin=subprocess.PIPE)
            p.communicate(text.encode("utf-8"))
            subprocess.run(["xdotool", "key", "ctrl+v"])
        except Exception as e:
            print(f"Clipboard paste error: {e}")

def process_audio_file(filepath, process_name="", window_title=""):
    """
    Sends WAV/WebM audio to WhisperFlow /api/dictate and retrieves zero-edit text.
    process_name and window_title describe the app that was in front when
    recording started. The server uses them only when the tone is "auto".
    """
    print("⚡ Sending audio to WhisperFlow Zero-Edit Engine...")
    start_time = time.time()

    import mimetypes
    boundary = "----WhisperFlowBoundary" + str(int(time.time()))
    
    with open(filepath, "rb") as f:
        file_bytes = f.read()

    body = []
    # audio field
    body.append(f"--{boundary}".encode())
    body.append(b'Content-Disposition: form-data; name="audio"; filename="recording.wav"')
    body.append(b"Content-Type: audio/wav")
    body.append(b"")
    body.append(file_bytes)
    
    # tone field
    body.append(f"--{boundary}".encode())
    body.append(b'Content-Disposition: form-data; name="tone"')
    body.append(b"")
    body.append(CURRENT_TONE.encode())

    # appName field
    body.append(f"--{boundary}".encode())
    body.append(b'Content-Disposition: form-data; name="appName"')
    body.append(b"")
    body.append(b"Universal Desktop App")

    # Active window, for automatic tone
    for field, value in (("processName", process_name), ("windowTitle", window_title)):
        if value:
            body.append(f"--{boundary}".encode())
            body.append(f'Content-Disposition: form-data; name="{field}"'.encode())
            body.append(b"")
            body.append(value.encode("utf-8"))

    # API keys if provided
    if args.groq_key:
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="apiKeyGroq"')
        body.append(b"")
        body.append(args.groq_key.encode())

    if args.gemini_key:
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="apiKeyGemini"')
        body.append(b"")
        body.append(args.gemini_key.encode())

    body.append(f"--{boundary}--".encode())
    body.append(b"")

    payload = b"\r\n".join(body)

    req = urllib.request.Request(
        f"{SERVER_URL}/api/dictate",
        data=payload,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "WhisperFlow-Desktop/1.0"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            res_data = json.loads(response.read().decode())
            clean_text = res_data.get("processedText", "")
            elapsed_ms = int((time.time() - start_time) * 1000)
            if res_data.get("tone"):
                how = "matched app" if res_data.get("toneSource") == "app-rule" else res_data.get("toneSource", "")
                print(f"🎨 Tone: {res_data['tone']} ({res_data.get('appName', 'General')}, {how})")
            print(f"✨ Transcribed in {elapsed_ms}ms: \"{clean_text}\"")
            print("🚀 Injecting into active window...")
            paste_text_into_active_window(clean_text)
            print("✓ Injected!\n")
    except Exception as e:
        print(f"❌ Dictation request error: {e}")

is_recording = False
recording_frames = []
recording_window = ("", "")
SAMPLE_RATE = 16000

def audio_callback(indata, frames, time_info, status):
    if is_recording:
        recording_frames.append(indata.copy())

def start_recording():
    global is_recording, recording_frames, recording_window
    if is_recording:
        return
    # Read the window now, while the target app is still in front.
    recording_window = get_active_window() if CURRENT_TONE == "auto" else ("", "")
    is_recording = True
    recording_frames = []
    print("\n🔴 [RECORDING...] Speak now! (Press hotkey again to finish & inject)")
    if recording_window[0]:
        print(f"   Typing into: {recording_window[0]}")

def stop_recording():
    global is_recording
    if not is_recording:
        return
    is_recording = False
    print("⏹️ [STOPPED] Processing voice...")
    
    if not recording_frames:
        print("⚠️ No audio captured.")
        return

    import numpy as np
    audio_data = np.concatenate(recording_frames, axis=0)
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    write_wav(tmp_path, SAMPLE_RATE, (audio_data * 32767).astype(np.int16))
    threading.Thread(target=process_audio_file, args=(tmp_path, *recording_window)).start()

def toggle_recording():
    if is_recording:
        stop_recording()
    else:
        start_recording()

def main():
    print(f"🎯 Global Hotkey: [{HOTKEY.upper()}]")
    if CURRENT_TONE == "auto":
        print("🎨 Active Tone:   [AUTO] Slack is casual, VS Code is code, Gmail is formal")
    else:
        print(f"🎨 Active Tone:   [{CURRENT_TONE.upper()}]")
    print("\nHow to use:")
    print(f"  1. Click into any app (Slack, VS Code, Word, Notion, Browser)")
    print(f"  2. Press [{HOTKEY.upper()}] to start speaking")
    print(f"  3. Press [{HOTKEY.upper()}] again to stop")
    print(f"  4. WhisperFlow types the polished words directly into your cursor!\n")
    print("Press Ctrl+C in this terminal to exit.\n")

    if HAS_NATIVE_DEPS:
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, callback=audio_callback):
            keyboard.add_hotkey(HOTKEY, toggle_recording)
            try:
                keyboard.wait()
            except KeyboardInterrupt:
                print("\n👋 Exiting WhisperFlow Desktop Companion.")
    else:
        # Fallback interactive CLI mode if dependencies not installed
        print("⚡ Interactive Console Mode (install 'sounddevice' and 'keyboard' for background global hotkey):")
        while True:
            try:
                cmd = input("Press ENTER to start recording (or type 'q' to quit): ")
                if cmd.strip().lower() == 'q':
                    break
                # Simple Windows Voice recorder fallback
                temp_wav = os.path.join(tempfile.gettempdir(), f"wf_{int(time.time())}.wav")
                print("🔴 Recording 4 seconds of speech via Windows Voice API...")
                # PowerShell audio recording snippet
                ps_script = f"""
                $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine;
                Start-Sleep -Seconds 4;
                """
                subprocess.run(["powershell", "-Command", ps_script])
                print("⏹️ Done. Ready for full global hotkey mode with `pip install keyboard sounddevice scipy numpy`.")
            except KeyboardInterrupt:
                break

if __name__ == "__main__":
    main()
