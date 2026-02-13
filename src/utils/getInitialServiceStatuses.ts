import {
  crashDetectionService,
  emergencyControllerService,
  locationService,
  type ServiceHealth,
} from '@/src/services';

export function getInitialServiceStatuses(): ServiceHealth[] {
  return [
    crashDetectionService.getHealth(),
    emergencyControllerService.getHealth(),
    locationService.getHealth(),
  ];
}
