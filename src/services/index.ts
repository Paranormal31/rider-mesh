export { alarmAudioService } from './alarmAudioService';
export { crashDetectionService } from './crashDetectionService';
export type {
  CrashDetectedEvent,
  CrashDetectionConfig,
  CrashDetectionPhase,
  DetectionPhaseChangedEvent,
  PhaseChangeReason,
  SpikeOrientation,
} from './crashDetectionService';
export {
  EMERGENCY_CONTACT_MAX_NAME_LENGTH,
  emergencyContactsService,
} from './emergencyContactsService';
export type { AddContactError, UpdateContactError } from './emergencyContactsService';
export { emergencyControllerService } from './emergencyControllerService';
export type { EmergencyContact } from './emergencyContactsService';
export type {
  EmergencyControllerLocationPayload,
  EmergencyControllerState,
} from './emergencyControllerService';
export { locationService } from './locationService';
export { settingsService } from './settingsService';
export type {
  CountdownDurationSeconds,
  DetectionSensitivity,
  SettingsChangedEvent,
  UserSettings,
} from './settingsService';
export type { ServiceHealth, ServiceState } from './types';
