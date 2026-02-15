import * as Speech from 'expo-speech';

const ALERT_MESSAGE = 'Emergency alert. Crash detected.';

class AlarmAudioService {
  private active = false;
  private speaking = false;

  start(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    this.speakNext();
  }

  stop(): void {
    this.active = false;
    this.speaking = false;
    try {
      Speech.stop();
    } catch {
      // Keep emergency flow resilient even when audio stop fails.
    }
  }

  isPlaying(): boolean {
    return this.active;
  }

  private speakNext(): void {
    if (!this.active || this.speaking) {
      return;
    }

    this.speaking = true;
    try {
      Speech.speak(ALERT_MESSAGE, {
        rate: 0.9,
        pitch: 1.0,
        onDone: () => {
          this.speaking = false;
          if (this.active) {
            this.speakNext();
          }
        },
        onStopped: () => {
          this.speaking = false;
        },
        onError: () => {
          this.speaking = false;
        },
      });
    } catch {
      this.speaking = false;
    }
  }
}

export const alarmAudioService = new AlarmAudioService();
