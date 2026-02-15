export const colors = {
  background: '#030712',
  surface: '#111827',
  surfaceAlt: '#0F172A',
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  primaryBlue: '#2563EB',
  dangerRed: '#DC2626',
  hazardYellow: '#F59E0B',
  meshCyan: '#22D3EE',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#DC2626',
  border: '#1F2937',
} as const;

export type AppColor = keyof typeof colors;
