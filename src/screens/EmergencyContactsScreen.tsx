import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  EMERGENCY_CONTACT_MAX_NAME_LENGTH,
  emergencyContactsService,
  type AddContactError,
  type EmergencyContact,
  type UpdateContactError,
} from '@/src/services';

const MAX_CONTACTS = 3;

export function EmergencyContactsScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
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

  const isEditing = editingContactId !== null;
  const isAtMaxContacts = contacts.length >= MAX_CONTACTS;
  const submitButtonDisabled = isLoading || isSubmitting || (!isEditing && isAtMaxContacts);
  const rowActionsDisabled = isLoading || isSubmitting;

  const helperText = useMemo(() => {
    if (!isEditing && isAtMaxContacts) {
      return 'Maximum of 3 emergency contacts reached.';
    }
    return null;
  }, [isAtMaxContacts, isEditing]);

  const clearForm = () => {
    setEditingContactId(null);
    setNameInput('');
    setPhoneInput('');
  };

  const onStartEdit = (contact: EmergencyContact) => {
    if (rowActionsDisabled) {
      return;
    }

    setStorageError(null);
    setFormError(null);
    setEditingContactId(contact.id);
    setNameInput(contact.name);
    setPhoneInput(contact.phone);
  };

  const onCancelEdit = () => {
    if (isSubmitting) {
      return;
    }

    setStorageError(null);
    setFormError(null);
    clearForm();
  };

  const onSubmitContact = async () => {
    if (submitButtonDisabled) {
      return;
    }

    setFormError(null);
    setStorageError(null);
    setIsSubmitting(true);

    const result =
      editingContactId !== null
        ? emergencyContactsService.updateContact(
            { id: editingContactId, name: nameInput, phone: phoneInput },
            contacts
          )
        : emergencyContactsService.addContact({ name: nameInput, phone: phoneInput }, contacts);

    if (!result.ok) {
      setFormError(getFormErrorMessage(result.error));
      setIsSubmitting(false);
      return;
    }

    try {
      await emergencyContactsService.saveContacts(result.contacts);
      setContacts(result.contacts);
      clearForm();
    } catch {
      setStorageError('Unable to save contacts right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDeleteContact = (contact: EmergencyContact) => {
    if (rowActionsDisabled) {
      return;
    }

    Alert.alert(
      'Delete contact?',
      `Delete ${contact.name} (${formatPhoneForDisplay(contact.phone)}) from emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void onDeleteContactConfirmed(contact);
          },
        },
      ]
    );
  };

  const onDeleteContactConfirmed = async (contact: EmergencyContact) => {
    setStorageError(null);

    const wasEditingDeletedContact = editingContactId === contact.id;
    const previousEditingContactId = editingContactId;
    const previousNameInput = nameInput;
    const previousPhoneInput = phoneInput;
    const previousContacts = contacts;
    const nextContacts = emergencyContactsService.deleteContact(contact.id, previousContacts);

    if (wasEditingDeletedContact) {
      clearForm();
    }
    setContacts(nextContacts);

    try {
      await emergencyContactsService.saveContacts(nextContacts);
    } catch {
      setContacts(previousContacts);
      if (wasEditingDeletedContact) {
        setEditingContactId(previousEditingContactId);
        setNameInput(previousNameInput);
        setPhoneInput(previousPhoneInput);
      }
      setStorageError('Unable to delete contact right now. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Emergency Contacts</Text>
      <Text style={styles.subtitle}>Add up to 3 trusted contacts for emergency alerts.</Text>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{isEditing ? 'Edit Contact' : 'Add Contact'}</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={nameInput}
          onChangeText={setNameInput}
          placeholder="Contact name"
          placeholderTextColor="#6B7280"
          style={styles.input}
          editable={!isLoading && !isSubmitting}
          autoCapitalize="words"
          maxLength={EMERGENCY_CONTACT_MAX_NAME_LENGTH}
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
          style={[styles.submitButton, submitButtonDisabled && styles.submitButtonDisabled]}
          onPress={() => {
            void onSubmitContact();
          }}
          disabled={submitButtonDisabled}>
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Contact' : 'Add Contact'}
          </Text>
        </Pressable>

        {isEditing ? (
          <Pressable style={styles.cancelEditButton} onPress={onCancelEdit} disabled={isSubmitting}>
            <Text style={styles.cancelEditText}>Cancel Edit</Text>
          </Pressable>
        ) : null}
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
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.emptyText}>No emergency contacts added yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.contactRow}>
                <View style={styles.contactMeta}>
                  <Text style={styles.contactName} numberOfLines={1} ellipsizeMode="tail">
                    {item.name}
                  </Text>
                  <Text style={styles.contactPhone}>{formatPhoneForDisplay(item.phone)}</Text>
                </View>
                <View style={styles.actionsRow}>
                  <Pressable
                    style={styles.editButton}
                    disabled={rowActionsDisabled}
                    onPress={() => {
                      onStartEdit(item);
                    }}>
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.deleteButton, rowActionsDisabled && styles.rowButtonDisabled]}
                    disabled={rowActionsDisabled}
                    onPress={() => {
                      onDeleteContact(item);
                    }}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

function getFormErrorMessage(error: AddContactError | UpdateContactError): string {
  switch (error) {
    case 'EMPTY_NAME':
      return 'Name is required.';
    case 'NAME_TOO_LONG':
      return `Name must be ${EMERGENCY_CONTACT_MAX_NAME_LENGTH} characters or fewer.`;
    case 'EMPTY_PHONE':
      return 'Phone number is required.';
    case 'INVALID_PHONE':
      return 'Phone number must contain exactly 10 digits.';
    case 'DUPLICATE_PHONE':
      return 'This phone number is already added.';
    case 'MAX_LIMIT':
      return 'You can add up to 3 emergency contacts.';
    case 'NOT_FOUND':
      return 'Contact no longer exists. Refresh and try again.';
    default:
      return 'Unable to save contact.';
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
    padding: 16,
    gap: 10,
  },
  formTitle: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
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
  submitButton: {
    marginTop: 6,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#374151',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelEditButton: {
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelEditText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '700',
  },
  listSection: {
    flex: 1,
    marginTop: 22,
  },
  sectionTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  contactMeta: {
    flex: 1,
    gap: 4,
    paddingTop: 2,
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
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  editText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  deleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  rowButtonDisabled: {
    opacity: 0.6,
  },
  deleteText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '700',
  },
});
