export type ContactType = 'internal_moh' | 'external' | 'government' | 'private' | 'other';

export type Contact = {
  id: string;
  name: string;
  nameAr: string;
  email: string | null;
  organization: string;
  role: string;
  phone: string;
  type: ContactType;
  createdById: string;
  editedById: string | null;
  createdAt: string;
};

export type ContactCreateInput = {
  name: string;
  nameAr?: string;
  email?: string | null;
  organization?: string;
  role?: string;
  phone?: string;
  type?: ContactType;
};

export type ContactUpdateInput = Partial<{
  name: string;
  nameAr: string;
  email: string | null;
  organization: string;
  role: string;
  phone: string;
  type: ContactType;
}>;

export type DirectoryEntry = {
  source: 'contact' | 'investor';
  id: string;
  name: string;
  nameAr: string;
  email: string | null;
  organization: string;
  organizationAr?: string;
  role: string;
  roleAr?: string;
  phone: string;
  type: ContactType | 'investor';
  editable: boolean;
  contact?: Contact;
  investorId?: string;
};
