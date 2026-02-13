import type { ServiceHealth } from './types';

class EmergencyControllerService {
  private armed = false;

  arm(): void {
    this.armed = true;
  }

  disarm(): void {
    this.armed = false;
  }

  getHealth(): ServiceHealth {
    return {
      name: 'Emergency Controller',
      state: this.armed ? 'active' : 'idle',
      detail: this.armed ? 'Emergency actions are armed.' : 'Emergency actions are idle.',
    };
  }
}

export const emergencyControllerService = new EmergencyControllerService();
