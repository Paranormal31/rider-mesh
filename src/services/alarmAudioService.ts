import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

class AlarmAudioService {
  private player: AudioPlayer | null = null;
  private active = false;
  private loading = false;

  start(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    void this.playLoop();
  }

  stop(): void {
    this.active = false;
    void this.stopAndUnload();
  }

  isPlaying(): boolean {
    return this.active;
  }

  private async playLoop(): Promise<void> {
    if (!this.active || this.loading) {
      return;
    }

    this.loading = true;
    try {
      if (!this.player) {
        await setAudioModeAsync({
          allowsRecording: false,
          shouldPlayInBackground: false,
          playsInSilentMode: true,
          interruptionMode: 'duckOthers',
          shouldRouteThroughEarpiece: false,
        });

        this.player = createAudioPlayer(require('./alarmAudioService.mp3'), {
          keepAudioSessionActive: false,
        });
        this.player.loop = true;
        this.player.volume = 1;
      }

      if (!this.active || !this.player) {
        return;
      }

      await this.player.seekTo(0);
      this.player.play();
    } catch {
      this.active = false;
      await this.stopAndUnload();
    } finally {
      this.loading = false;
    }
  }

  private async stopAndUnload(): Promise<void> {
    if (!this.player) {
      return;
    }

    try {
      this.player.pause();
      await this.player.seekTo(0);
    } catch {
      // Ignore playback-stop errors; emergency flow should continue.
    }

    try {
      this.player.remove();
    } catch {
      // Ignore cleanup errors.
    } finally {
      this.player = null;
    }
  }
}

export const alarmAudioService = new AlarmAudioService();
