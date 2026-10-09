/**
 * WhisperFlow Production Hotkey Manager
 * Handles:
 * - Spacebar Push-to-Talk (hold to speak, release to send)
 * - Spacebar Double-Tap (locks into Hands-Free mode)
 * - F8 Global Hotkey Toggle (toggle start/stop, matching Desktop Companion)
 * - Escape key instant cancellation
 */

export class HotkeyManager {
  constructor({ onPushToTalkStart, onPushToTalkStop, onCancel, onHandsFreeToggle }) {
    this.onPushToTalkStart = onPushToTalkStart;
    this.onPushToTalkStop = onPushToTalkStop;
    this.onCancel = onCancel;
    this.onHandsFreeToggle = onHandsFreeToggle;

    this.isKeyDown = false;
    this.isRecording = false;
    this.isHandsFree = false;

    // Double-tap state tracking
    this.lastSpacePressTime = 0;
    this.lastSpaceReleaseTime = 0;
    this.pressStartTime = 0;
    this.doubleTapWindowMs = 350;

    this.init();
  }

  init() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  isInputFocused() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || active.isContentEditable;
  }

  handleKeyDown(e) {
    // 1. Escape key: Instant Cancel anytime from anywhere
    if (e.key === 'Escape') {
      if (this.isRecording) {
        e.preventDefault();
        this.resetState();
        if (this.onCancel) this.onCancel();
      }
      return;
    }

    // 2. F8 Key: Global toggle (works even if textarea is focused)
    if (e.key === 'F8' || e.code === 'F8') {
      e.preventDefault();
      if (this.isKeyDown) return; // Prevent auto-repeat
      this.isKeyDown = true;

      if (this.isRecording) {
        // Toggle OFF
        this.isRecording = false;
        this.isHandsFree = false;
        if (this.onPushToTalkStop) this.onPushToTalkStop();
      } else {
        // Toggle ON (hands-free)
        this.isRecording = true;
        this.isHandsFree = true;
        if (this.onPushToTalkStart) this.onPushToTalkStart(true);
      }
      return;
    }

    // 3. Spacebar Handling
    if (e.code === 'Space') {
      // If typing in a text field, let Space type normally
      if (this.isInputFocused()) {
        return;
      }

      e.preventDefault();
      if (this.isKeyDown) return; // Ignore repeat events
      this.isKeyDown = true;

      const now = Date.now();
      const timeSinceLastPress = now - this.lastSpacePressTime;
      const timeSinceLastRelease = now - this.lastSpaceReleaseTime;
      this.lastSpacePressTime = now;
      this.pressStartTime = now;

      // If already recording in hands-free mode, pressing Space stops it
      if (this.isRecording && this.isHandsFree) {
        this.isRecording = false;
        this.isHandsFree = false;
        if (this.onPushToTalkStop) this.onPushToTalkStop();
        return;
      }

      // Check for Double-Tap (quick tap, then tap again within 350ms)
      if (timeSinceLastPress < this.doubleTapWindowMs || timeSinceLastRelease < this.doubleTapWindowMs) {
        this.isHandsFree = true;
        this.isRecording = true;
        if (this.onHandsFreeToggle) this.onHandsFreeToggle(true);
        if (this.onPushToTalkStart) this.onPushToTalkStart(true);
        return;
      }

      // Normal Push-to-Talk Start (hold to speak)
      if (!this.isRecording) {
        this.isRecording = true;
        this.isHandsFree = false;
        if (this.onPushToTalkStart) this.onPushToTalkStart(false);
      }
    }
  }

  handleKeyUp(e) {
    if (e.key === 'F8' || e.code === 'F8') {
      this.isKeyDown = false;
      return;
    }

    if (e.code === 'Space') {
      if (this.isInputFocused()) return;
      this.isKeyDown = false;
      const now = Date.now();
      this.lastSpaceReleaseTime = now;

      // If in Hands-Free mode, DO NOT stop recording on key up!
      if (this.isHandsFree) {
        return;
      }

      // Normal push-to-talk: releasing Space stops recording
      if (this.isRecording) {
        this.isRecording = false;
        if (this.onPushToTalkStop) this.onPushToTalkStop();
      }
    }
  }

  resetState() {
    this.isKeyDown = false;
    this.isRecording = false;
    this.isHandsFree = false;
  }

  setRecordingState(isRec, isHandsFree = false) {
    this.isRecording = isRec;
    this.isHandsFree = isHandsFree;
  }
}
