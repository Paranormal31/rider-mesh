import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { hazardService, locationService, type HazardType } from '@/src/services';

type Position = { latitude: number; longitude: number };

type MapModules = {
  available: boolean;
  MapView?: any;
  Marker?: any;
};

const hazardOptions: Array<{
  type: HazardType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { type: 'POTHOLE', label: 'Pothole', icon: 'add-circle-outline' },
  { type: 'CONSTRUCTION', label: 'Construction', icon: 'construct-outline' },
  { type: 'WATERLOGGING', label: 'Waterlogging', icon: 'water-outline' },
  { type: 'ACCIDENT_ZONE', label: 'Accident Zone', icon: 'warning-outline' },
];

function loadMapModules(): MapModules {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const maps = require('react-native-maps');
    return {
      available: true,
      MapView: maps.default,
      Marker: maps.Marker,
    };
  } catch {
    return { available: false };
  }
}

export default function ReportHazardScreen() {
  const router = useRouter();
  const mapModules = useMemo(loadMapModules, []);
  const mapRef = useRef<any>(null);
  const [selectedType, setSelectedType] = useState<HazardType | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    locationService
      .watchPosition((point) => {
        if (!active) {
          return;
        }
        const position = { latitude: point.latitude, longitude: point.longitude };
        setCurrentPosition(position);
        setSelectedPosition(position);
        mapRef.current?.animateToRegion?.({
          latitude: position.latitude,
          longitude: position.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
      })
      .then((off) => {
        unsubscribe = off;
      })
      .catch(() => {});

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const mapRegion = useMemo(
    () => ({
      latitude: selectedPosition?.latitude ?? currentPosition?.latitude ?? 28.6139,
      longitude: selectedPosition?.longitude ?? currentPosition?.longitude ?? 77.209,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }),
    [currentPosition, selectedPosition]
  );

  const canSubmit = Boolean(selectedType);

  const onSubmit = async () => {
    if (!selectedType) {
      return;
    }
    try {
      const livePoint = await locationService.getCurrentLocation();
      await hazardService.addHazard({
        type: selectedType,
        latitude: livePoint.latitude,
        longitude: livePoint.longitude,
      });
      setSelectedType(null);
      Alert.alert('Report submitted', 'You can report another hazard or close this screen.');
    } catch {
      if (!currentPosition) {
        Alert.alert('Location unavailable', 'Please enable location services and try again.');
        return;
      }
      await hazardService.addHazard({
        type: selectedType,
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
      });
      setSelectedType(null);
      Alert.alert('Report submitted', 'You can report another hazard or close this screen.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Report Hazard</Text>
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={18} color="#E5E7EB" />
        </Pressable>
      </View>

      <View style={styles.mapCard}>
        {mapModules.available && mapModules.MapView ? (
          <mapModules.MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={mapRegion}
          >
            {selectedPosition && mapModules.Marker ? (
              <mapModules.Marker coordinate={selectedPosition} pinColor="#2563EB" />
            ) : null}
          </mapModules.MapView>
        ) : (
          <View style={styles.mapFallback}>
            <Ionicons name="location-outline" size={26} color="#60A5FA" />
            <Text style={styles.mapFallbackText}>Select location on map</Text>
          </View>
        )}
        <View style={styles.mapOverlay}>
          <Ionicons name="location" size={18} color="#60A5FA" />
          <Text style={styles.mapOverlayText}>Select location on map</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Select Hazard Type</Text>
      </View>

      <View style={styles.hazardGrid}>
        {hazardOptions.map((option) => {
          const isSelected = option.type === selectedType;
          return (
            <Pressable
              key={option.type}
              style={[styles.hazardCard, isSelected ? styles.hazardCardActive : null]}
              onPress={() => setSelectedType(option.type)}
            >
              <View style={[styles.hazardIcon, isSelected ? styles.hazardIconActive : null]}>
                <Ionicons
                  name={option.icon}
                  size={22}
                  color={isSelected ? '#FFFFFF' : '#60A5FA'}
                />
              </View>
              <Text style={styles.hazardLabel}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.photoCard}>
        <View style={styles.photoIcon}>
          <Ionicons name="camera-outline" size={20} color="#9CA3AF" />
        </View>
        <Text style={styles.photoText}>Add Photo (Optional)</Text>
      </Pressable>

      <Pressable
        style={[styles.submitButton, !canSubmit ? styles.submitButtonDisabled : null]}
        onPress={() => void onSubmit()}
        disabled={!canSubmit}
      >
        <Text style={styles.submitText}>Submit Report</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCard: {
    height: 150,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 18,
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapFallbackText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mapOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 16,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(3, 7, 18, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
  },
  mapOverlayText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionHeader: {
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  hazardCard: {
    width: '48%',
    borderRadius: 16,
    backgroundColor: '#121A2C',
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingVertical: 16,
    alignItems: 'center',
    gap: 10,
  },
  hazardCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#101D3A',
  },
  hazardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardIconActive: {
    backgroundColor: '#2563EB',
  },
  hazardLabel: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  photoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0F172A',
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 18,
  },
  photoIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#1F2937',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
