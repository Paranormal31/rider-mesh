export type ServiceState = 'idle' | 'active' | 'error';

export interface ServiceHealth {
  name: string;
  state: ServiceState;
  detail: string;
}
