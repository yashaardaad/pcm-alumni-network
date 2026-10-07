export type Role = 'member' | 'alumni';
export type Status = 'pending' | 'approved' | 'rejected';
export type RequestType = 'coffee_chat' | 'resume_review' | 'mock_interview';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type Audience = 'alumni' | 'members' | 'all';

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  status: Status;
  is_admin: boolean;
  grad_year: number | null;
  headline: string | null;
  company: string | null;
  sector: string | null;
  city: string | null;
  bio: string | null;
  fund_role: string | null;
  linkedin_url: string | null;
  open_to: RequestType[];
  monthly_cap: number;
  created_at: string;
};

type Person = Pick<
  Profile,
  'id' | 'full_name' | 'role' | 'grad_year' | 'headline' | 'company' | 'fund_role'
>;

export type RequestRow = {
  id: string;
  requester_id: string;
  alum_id: string;
  type: RequestType;
  topic: string;
  message: string;
  availability: string;
  status: RequestStatus;
  conversation_id: string | null;
  created_at: string;
  responded_at: string | null;
  requester: Person | null;
  alum: Person | null;
};

export type Conversation = {
  id: string;
  kind: 'channel' | 'dm';
  name: string | null;
  description: string | null;
  audience: Audience;
  from_request: boolean;
  other_id: string | null;
  other_name: string | null;
  last_body: string | null;
  last_sender: string | null;
  last_at: string | null;
  unread: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender: { full_name: string } | null;
};

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  audience: Audience;
  created_by: string;
  event_rsvps: { user_id: string }[];
};

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: Status;
  is_admin: boolean;
  grad_year: number | null;
  created_at: string;
};

export type Channel = {
  id: string;
  name: string;
  description: string | null;
  audience: Audience;
};
