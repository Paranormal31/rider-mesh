import { responderService } from './responderService';
import { riderHeartbeatService } from './riderHeartbeatService';
import { socketService } from './socketService';

class AppRuntimeService {
  private running = false;

  async startForegroundRuntime(): Promise<void> {
    if (this.running) {
      return;
    }

    await socketService.start();
    await responderService.start();
    await riderHeartbeatService.start();
    this.running = true;
  }

  stopForegroundRuntime(): void {
    if (!this.running) {
      return;
    }

    riderHeartbeatService.stop();
    responderService.stop();
    socketService.stop();
    this.running = false;
  }
}

export const appRuntimeService = new AppRuntimeService();
