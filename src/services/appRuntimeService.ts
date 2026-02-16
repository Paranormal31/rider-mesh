import { responderService } from './responderService';
import { riderHeartbeatService } from './riderHeartbeatService';
import { transportRouterService } from './transport/transportRouterService';

class AppRuntimeService {
  private running = false;

  async startForegroundRuntime(): Promise<void> {
    if (this.running) {
      return;
    }

    await transportRouterService.start();
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
    transportRouterService.stop();
    this.running = false;
  }
}

export const appRuntimeService = new AppRuntimeService();
