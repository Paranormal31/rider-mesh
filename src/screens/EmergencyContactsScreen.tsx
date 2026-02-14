import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { emergencyContactsService, type EmergencyContact } from '@/src/services';

const MAX_CONTACTS = 3;

export function EmergencyContactsScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const loaded = await emergencyContactsService.loadContacts();
        if (active) {
          setContacts(loaded);
          setStorageError(null);
        }
      } catch {
        if (active) {
          setStorageError('Unable to load contacts. You can still add new ones.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const isAtMaxContacts = contacts.length >= MAX_CONTACTS;
  const addButtonDisabled = isLoading || isSubmitting || isAtMaxContacts;

  const helperText = useMemo(() => {
    if (isAtMaxContacts) {
      return 'Maximum of 3 emergency contacts reached.';
    }
    return null;
  }, [isAtMaxContacts]);

  const onAddContact = async () => {
    if (addButtonDisabled) {
      return;
    }

    setFormError(null);
    setStorageError(null);
    setIsSubmitting(true);

    const result = emergencyContactsService.addContact(
      { name: nameInput, phone: phoneInput },
      contacts
    );

    if (!result.ok) {
      setFormError(getFormErrorMessage(result.error));
      setIsSubmitting(false);
      return;
    }

    try {
      await emergencyContactsService.saveContacts(result.contacts);
      setContacts(result.contacts);
      setNameInput('');
      setPhoneInput('');
    } catch {
      setStorageError('Unable to save contacts right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDeleteContact = async (id: string) => {
    setStorageError(null);

    const previousContacts = contacts;
    const nextContacts = emergencyContactsService.deleteContact(id, previousContacts);

    setContacts(nextContacts);

    try {
      await emergencyContactsService.saveContacts(nextContacts);
    } catch {
      setContacts(previousContacts);
      setStorageError('Unable to delete contact right now. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Emergency Contacts</Text>
      <Text style={styles.subtitle}>Add up to 3 trusted contacts for emergency alerts.</Text>

      <View style={styles.formCard}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={nameInput}
          onChangeText={setNameInput}
          placeholder="Contact name"
          placeholderTextColor="#6B7280"
          style={styles.input}
          editable={!isLoading && !isSubmitting}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          value={phoneInput}
          onChangeText={setPhoneInput}
          placeholder="Phone number"
          placeholderTextColor="#6B7280"
          style={styles.input}
          editable={!isLoading && !isSubmitting}
          keyboardType="phone-pad"
        />

        {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        {storageError ? <Text style={styles.errorText}>{storageError}</Text> : null}

        <Pressable
          style={[styles.addButton, addButtonDisabled && styles.addButtonDisabled]}
          onPress={() => {
            void onAddContact();
          }}
          disabled={addButtonDisabled}>
          <Text style={styles.addButtonText}>{isSubmitting ? 'Saving...' : 'Add Contact'}</Text>
        </Pressable>
      </View>

      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>Saved Contacts</Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={contacts.length === 0 ? styles.emptyListContainer : undefined}
            ListEmptyComponent={<Text style={styles.emptyText}>No emergency contacts added yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.contactRow}>
                <View style={styles.contactMeta}>
                  <Text style={styles.contactName}>{item.name}</Text>
                  <Text style={styles.contactPhone}>{formatPhoneForDisplay(item.phone)}</Text>
                </View>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => {
                    void onDeleteContact(item.id);
                  }}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

function getFormErrorMessage(error: string): string {
  switch (error) {
    case 'EMPTY_NAME':
      return 'Name is required.';
    case 'EMPTY_PHONE':
      return 'Phone number is required.';
    case 'INVALID_PHONE':
      return 'Phone number must contain exactly 10 digits.';
    case 'DUPLICATE_PHONE':
      return 'This phone number is already added.';
    case 'MAX_LIMIT':
      return 'You can add up to 3 emergency contacts.';
    default:
      return 'Unable to add contact.';
  }
}

function formatPhoneForDisplay(phone: string): string {
  if (phone.length === 10) {
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  }

  return phone;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 6,
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    marginTop: 18,
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    gap: 8,
  },
  label: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helperText: {
    color: '#FBBF24',
    fontSize: 13,
    marginTop: 2,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    marginTop: 2,
  },
  addButton: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#374151',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  listSection: {
    flex: 1,
    marginTop: 18,
  },
  sectionTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  loadingContainer: {
    paddingTop: 24,
    alignItems: 'center',
  },
  emptyListContainer: {
    paddingTop: 6,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  contactRow: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  contactMeta: {
    flex: 1,
    gap: 2,
  },
  contactName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  contactPhone: {
    color: '#D1D5DB',
    fontSize: 14,
  },
  deleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  deleteText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '700',
  },
});
