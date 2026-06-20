export type ChallengeStatus =
  | 'open' | 'investigating' | 'mitigation_in_progress' | 'resolved' | 'closed';
export type ChallengeType =
  | 'financial' | 'technical' | 'operational' | 'insurance' | 'regulatory' | 'hr_training' | 'others';
export type ChallengePriority = 'low' | 'medium' | 'high' | 'critical';

export type Challenge = {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  status: ChallengeStatus;
  priority: ChallengePriority;
  type: ChallengeType;
  domainId: string;
  subDomainId: string | null;
  assignedToId: string | null;
  resolutionNote: string | null;
  completionPercentage: number;
  createdById: string;
  closedById: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  investorId: string | null;
};

export type ChallengeStatusHistoryEntry = {
  id: string;
  challengeId: string;
  fromStatus: ChallengeStatus;
  toStatus: ChallengeStatus;
  changedById: string;
  reason: string | null;
  changedAt: string;
};

export type ChallengeCreateInput = {
  title: string;
  titleAr: string;
  description?: string;
  descriptionAr?: string;
  type: ChallengeType;
  priority?: ChallengePriority;
  domainId: string;
  subDomainId?: string | null;
};

export type ChallengeFilters = {
  status?: ChallengeStatus;
  type?: ChallengeType;
  priority?: ChallengePriority;
  domainId?: string;
};