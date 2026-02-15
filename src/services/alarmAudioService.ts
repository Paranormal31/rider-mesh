import { Audio, type AVPlaybackStatusSuccess } from 'expo-av';

class AlarmAudioService {
  private sound: Audio.Sound | null = null;
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
      if (!this.sound) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const { sound } = await Audio.Sound.createAsync(
          require('./alarmAudioService.mp3'),
          { isLooping: true, shouldPlay: false, volume: 1.0 }
        );
        this.sound = sound;
      }

      if (!this.active || !this.sound) {
        return;
      }

      const status = await this.sound.getStatusAsync();
      if ((status as AVPlaybackStatusSuccess).isLoaded) {
        await this.sound.setPositionAsync(0);
        await this.sound.playAsync();
      }
    } catch {
      this.active = false;
      await this.stopAndUnload();
    } finally {
      this.loading = false;
    }
  }

  private async stopAndUnload(): Promise<void> {
    if (!this.sound) {
      return;
    }

    try {
      const status = await this.sound.getStatusAsync();
      if ((status as AVPlaybackStatusSuccess).isLoaded) {
        await this.sound.stopAsync();
      }
    } catch {
      // Ignore playback-stop errors; emergency flow should continue.
    }

    try {
      await this.sound.unloadAsync();
    } catch {
      // Ignore unload errors.
    } finally {
      this.sound = null;
    }
  }
}

export const alarmAudioService = new AlarmAudioService();
