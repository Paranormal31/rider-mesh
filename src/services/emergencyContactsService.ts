import AsyncStorage from '@react-native-async-storage/async-storage';

const CONTACTS_STORAGE_KEY = '@dextrix/emergency-contacts/v1';
const MAX_CONTACTS = 3;
const REQUIRED_PHONE_DIGITS = 10;
const MAX_NAME_LENGTH = 50;

type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  createdAt: number;
};

type AddContactInput = {
  name: string;
  phone: string;
};

type UpdateContactInput = {
  id: string;
  name: string;
  phone: string;
};

type ContactValidationError =
  | 'EMPTY_NAME'
  | 'EMPTY_PHONE'
  | 'INVALID_PHONE'
  | 'DUPLICATE_PHONE'
  | 'NAME_TOO_LONG';
type AddContactError = ContactValidationError | 'MAX_LIMIT';
type UpdateContactError = ContactValidationError | 'NOT_FOUND';

type ContactValidationResult =
  | { ok: true; normalizedPhone: string }
  | { ok: false; error: ContactValidationError };

type AddContactResult =
  | { ok: true; contacts: EmergencyContact[] }
  | { ok: false; error: AddContactError };

type UpdateContactResult =
  | { ok: true; contacts: EmergencyContact[] }
  | { ok: false; error: UpdateContactError };

class EmergencyContactsService {
  async loadContacts(): Promise<EmergencyContact[]> {
    try {
      const raw = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const contacts = parsed.filter(isEmergencyContact);
      return this.sortContacts(contacts);
    } catch {
      return [];
    }
  }

  async saveContacts(contacts: EmergencyContact[]): Promise<void> {
    const serialized = JSON.stringify(this.sortContacts(contacts));
    await AsyncStorage.setItem(CONTACTS_STORAGE_KEY, serialized);
  }

  addContact(input: AddContactInput, existing: EmergencyContact[]): AddContactResult {
    if (existing.length >= MAX_CONTACTS) {
      return { ok: false, error: 'MAX_LIMIT' };
    }

    const validation = this.validateContactInput(input.name, input.phone);
    if (!validation.ok) {
      return validation;
    }

    const duplicateExists = existing.some((contact) => contact.phone === validation.normalizedPhone);
    if (duplicateExists) {
      return { ok: false, error: 'DUPLICATE_PHONE' };
    }

    const nextContact: EmergencyContact = {
      id: createContactId(),
      name: input.name.trim(),
      phone: validation.normalizedPhone,
      createdAt: Date.now(),
    };

    return { ok: true, contacts: this.sortContacts([nextContact, ...existing]) };
  }

  updateContact(input: UpdateContactInput, existing: EmergencyContact[]): UpdateContactResult {
    const existingContact = existing.find((contact) => contact.id === input.id);
    if (!existingContact) {
      return { ok: false, error: 'NOT_FOUND' };
    }

    const validation = this.validateContactInput(input.name, input.phone);
    if (!validation.ok) {
      return validation;
    }

    const duplicateExists = existing.some(
      (contact) => contact.id !== input.id && contact.phone === validation.normalizedPhone
    );
    if (duplicateExists) {
      return { ok: false, error: 'DUPLICATE_PHONE' };
    }

    const nextContacts = existing.map((contact) =>
      contact.id === input.id
        ? { ...contact, name: input.name.trim(), phone: validation.normalizedPhone }
        : contact
    );

    return { ok: true, contacts: this.sortContacts(nextContacts) };
  }

  deleteContact(id: string, existing: EmergencyContact[]): EmergencyContact[] {
    return this.sortContacts(existing.filter((contact) => contact.id !== id));
  }

  validateContactInput(name: string, phone: string): ContactValidationResult {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, error: 'EMPTY_NAME' };
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return { ok: false, error: 'NAME_TOO_LONG' };
    }

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      return { ok: false, error: 'EMPTY_PHONE' };
    }

    const normalizedPhone = this.normalizePhone(trimmedPhone);
    if (normalizedPhone.length !== REQUIRED_PHONE_DIGITS) {
      return { ok: false, error: 'INVALID_PHONE' };
    }

    return { ok: true, normalizedPhone };
  }

  normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private sortContacts(contacts: EmergencyContact[]): EmergencyContact[] {
    return [...contacts].sort((a, b) => b.createdAt - a.createdAt);
  }
}

function createContactId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isEmergencyContact(value: unknown): value is EmergencyContact {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EmergencyContact>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.phone === 'string' &&
    typeof candidate.createdAt === 'number'
  );
}

export const emergencyContactsService = new EmergencyContactsService();
export type {
  AddContactError,
  AddContactResult,
  ContactValidationError,
  ContactValidationResult,
  EmergencyContact,
  UpdateContactError,
  UpdateContactInput,
  UpdateContactResult,
};
export { MAX_NAME_LENGTH as EMERGENCY_CONTACT_MAX_NAME_LENGTH };
