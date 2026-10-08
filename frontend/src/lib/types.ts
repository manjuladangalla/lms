export type Role = "admin" | "lecturer" | "counselor" | "student";
export type Theme = "light" | "dark" | "normal";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  role: Role;
  specialty?: string | null;
  bio?: string | null;
  status: string;
  theme: Theme;
  created_at?: string;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface InstituteSettings {
  site_name: string;
  tagline: string;
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  manual_payment_instructions?: string;
  currency?: string;
  currencies?: string;
  footer_text?: string;
  about_body?: string;
  home_hero_title?: string;
  home_hero_subtitle?: string;
  certificate_issuer?: string;
  google_client_id?: string | null;
  paypal_configured?: boolean;
}

export interface Lesson {
  id: string;
  title: string;
  content?: string | null;
  video_url?: string | null;
  duration_min?: number;
  sort_order?: number;
  is_free_preview?: boolean;
  status?: string;
  subject_id?: string;
  programme_id?: string;
  available_at?: string | null;
  due_at?: string | null;
  locked?: boolean;
  purchased?: boolean;
  price?: number;
  resources?: Material[];
}

export interface Subject {
  id: string;
  title: string;
  description?: string;
  sort_order?: number;
  is_free_preview?: boolean;
  start_at?: string | null;
  due_at?: string | null;
  price?: number;
  resources?: Material[];
  lessons?: Lesson[];
}

export interface Material {
  id: string;
  title: string;
  file_url: string;
  mime?: string | null;
  size?: number | null;
  subject_id?: string | null;
  lesson_id?: string | null;
  created_at?: string;
}

export interface Programme {
  id: string;
  type: "class" | "course" | "diploma";
  title: string;
  slug: string;
  summary?: string;
  description?: string;
  cover_image_url?: string | null;
  intro_video_url?: string | null;
  category?: string | null;
  level?: string | null;
  duration?: string | null;
  price: number;
  currency?: string | null;
  is_free?: boolean;
  status: string;
  pricing_mode?: "once" | "subscription" | "per_lesson" | "per_module";
  billing_interval?: "weekly" | "monthly" | "semester" | "yearly" | null;
  created_by?: string | null;
  final_exam_required?: boolean;
  assignment_weight?: number;
  exam_weight?: number;
  pass_percent?: number;
  learn_outcomes?: string[];
  prerequisites?: string[];
  instructors?: { id: string; name: string; avatar_url?: string | null }[];
  student_count?: number;
  exam_count?: number;
  subjects?: Subject[];
  materials?: Material[];
  progress_percent?: number;
}

export interface Enrolment {
  id: string;
  user_id: string;
  programme_id: string;
  status: string;
  source?: string;
  payment_id?: string | null;
  scope_key?: string;
  scope_type?: "programme" | "subject" | "lesson";
  scope_id?: string | null;
  billing_interval?: "weekly" | "monthly" | "semester" | "yearly" | null;
  access_expires_at?: string | null;
  base_amount?: number;
  amount?: number;
  currency?: string;
  member_discount_percent?: number;
  promo_code?: string | null;
  promo_discount_percent?: number;
  progress_percent?: number;
  completed_at?: string | null;
  certificate_id?: string | null;
  created_at?: string;
  programme?: Programme | null;
  payment?: Payment | null;
  certificate?: Certificate | null;
  student?: { id: string; name: string; email?: string } | null;
}

export interface MembershipPlan {
  id: string;
  name: string;
  description?: string;
  discount_percent: number;
  price: number;
  yearly_price?: number | null;
  currency?: string;
  duration_days?: number;
  benefits?: string[];
  status?: string;
}

export interface Membership {
  id: string;
  plan_id: string;
  status: string;
  cycle?: "monthly" | "yearly";
  discount_percent?: number;
  duration_days?: number;
  started_at?: string | null;
  expires_at?: string | null;
  plan?: MembershipPlan | null;
  payment?: Payment | null;
}

export interface Promo {
  id: string;
  code: string;
  discount_percent: number;
  scope: "all" | "programme";
  programme_id?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_uses?: number | null;
  used_count?: number;
  status: "active" | "inactive";
  created_at?: string;
}

export interface CounsellorWeek {
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
}

export interface Counsellor {
  id: string;
  name: string;
  specialty?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  weekly: CounsellorWeek[];
  upcoming_slots: number;
  next_available?: string | null;
}

export interface CounsellingDateOption {
  date: string;
  free: number;
  total?: number;
}

export interface CounsellingSlot {
  schedule_id: string;
  counsellor_id?: string;
  title?: string;
  description?: string | null;
  weekday?: number;
  start: string;
  end: string;
  duration_min: number;
  mode: "online" | "in_person" | "both";
  price: number;
  currency?: string;
  location?: string | null;
  capacity: number;
  seats_left: number;
  available: boolean;
  counsellor_name?: string;
  specialty?: string | null;
}

export interface CounsellingSchedule {
  id: string;
  counsellor_id?: string;
  counsellor_name?: string | null;
  title: string;
  description?: string | null;
  weekdays: number[];
  start_time: string;
  end_time: string;
  slot_minutes: number;
  mode: "online" | "in_person" | "both";
  capacity: number;
  price: number;
  currency?: string;
  location?: string | null;
  status: "active" | "paused";
  upcoming_bookings?: number;
  free_next_14d?: number;
  next_free?: string | null;
  created_at?: string;
}

export interface CounsellingBooking {
  id: string;
  schedule_id: string;
  counsellor_id?: string | null;
  counsellor_name?: string;
  slot_start: string;
  slot_end?: string;
  duration_min?: number;
  title?: string;
  price?: number;
  currency?: string;
  location?: string | null;
  user_id?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  mode?: "online" | "in_person";
  join_url?: string | null;
  meeting_password?: string | null;
  meeting_note?: string | null;
  venue?: string | null;
  status: "booked" | "cancelled" | "attended";
  created_at?: string;
  is_past?: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  image_url?: string | null;
  link_url?: string | null;
  cta_text?: string;
  theme: string;
  sort_order?: number;
  active: boolean;
}

export interface PricingQuote {
  base_amount: number;
  currency: string;
  member_discount_percent: number;
  promo_code: string | null;
  promo_discount_percent: number;
  promo_error: string | null;
  amount: number;
  bundle_error: string | null;
  pricing_mode: string;
  billing_interval: string | null;
  interval_days: number | null;
  programme_is_free: boolean;
  scope_type: "programme" | "subject" | "lesson";
  scope_id: string | null;
}

export interface Payment {
  id: string;
  provider: string;
  provider_ref?: string | null;
  amount: number;
  currency: string;
  status: string;
  purpose: string;
  target_id: string;
  proof_url?: string | null;
  notes?: string | null;
  created_at?: string;
  user?: { id?: string; name: string; email: string } | null;
}

export interface Question {
  id: string;
  type: "mcq" | "true_false" | "fill_blank" | "short_answer" | "essay" | "matching" | "ordering";
  statement: string;
  options?: string[];
  correct_answer?: unknown;
  accepted_answers?: string[];
  marks: number;
  explanation?: string;
  sort_order?: number;
}

export interface Exam {
  id: string;
  programme_id: string;
  title: string;
  description?: string;
  type: string;
  duration_min: number;
  total_marks: number;
  pass_marks: number;
  max_attempts: number;
  shuffle: boolean;
  status: string;
  window_start?: string | null;
  window_end?: string | null;
  submission_mode?: "online" | "file" | "both";
  paper_file_url?: string | null;
  question_count?: number;
  attempts_used?: number;
  questions?: Question[];
}

export interface LiveSession {
  id: string;
  programme_id: string;
  title: string;
  description?: string;
  start_time?: string | null;
  end_time?: string | null;
  duration_min?: number;
  provider?: string;
  join_url?: string | null;
  zoom_meeting_id?: string | null;
  zoom_password?: string | null;
  passcode?: string | null;
  status?: string;
  recurrence?: "none" | "daily" | "weekly" | "monthly";
  recurrence_until?: string | null;
  series_id?: string | null;
  occurrence_index?: number;
  lesson_id?: string | null;
  blocked_user_ids?: string[];
  created_at?: string;
}

export interface Assignment {
  id: string;
  programme_id: string;
  subject_id: string;
  title: string;
  description?: string;
  due_at?: string | null;
  max_marks: number;
  status: string;
  created_at?: string;
  subject?: { id: string; title: string } | null;
  programme?: { id: string; title: string } | null;
  submission_count?: number;
  submission?: AssignmentSubmission | null;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  user_id: string;
  programme_id: string;
  max_marks: number;
  text?: string;
  file_url?: string | null;
  status: string;
  score?: number | null;
  feedback?: string;
  submitted_at?: string;
  graded_at?: string | null;
  student?: { id: string; name: string; email?: string } | null;
}

export interface SystemConfig {
  storage: {
    backend: "local" | "s3";
    local_dir: string;
    local_public_url: string;
    s3_endpoint_url: string;
    s3_access_key: string;
    s3_secret_key: string;
    s3_secret_key_set?: boolean;
    s3_bucket: string;
    s3_region: string;
    s3_public_url: string;
    test?: { backend: string; ready: boolean; bucket?: string; dir?: string };
  };
  zoom: {
    account_id: string;
    client_id: string;
    client_secret: string;
    client_secret_set?: boolean;
    host_email: string;
  };
  google: {
    enabled: boolean;
    client_id: string;
    client_secret: string;
    client_secret_set?: boolean;
  };
  mail: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    password: string;
    password_set?: boolean;
    from_email: string;
    tls: boolean;
    otp_ttl_seconds: number;
    otp_length: number;
  };
}

export interface AttemptAnswer {
  question_id: string;
  answer: unknown;
  awarded_marks?: number;
  feedback?: string;
  question?: Question;
}

export interface Attempt {
  id: string;
  exam_id: string;
  user_id: string;
  attempt_no: number;
  status: string;
  started_at?: string;
  created_at?: string;
  submitted_at?: string | null;
  obtained?: number | null;
  total?: number;
  percentage?: number | null;
  is_passed?: boolean | null;
  auto_score?: number;
  essay_pending_count?: number;
  manual_grade?: boolean;
  manual_feedback?: string | null;
  answer_file_url?: string | null;
  answers?: AttemptAnswer[];
  exam?: Exam | null;
  programme?: { id: string; title: string } | null;
  student?: { id: string; name: string; email?: string } | null;
  questions?: Question[];
  deadline?: number;
}

export interface Certificate {
  id: string;
  cert_no: string;
  student_name: string;
  programme_name: string;
  programme_type?: string;
  completion_date?: string;
  final_grade?: number | null;
  status: string;
  issued_at?: string;
  qr_url?: string | null;
  pdf_url?: string | null;
  print_pdf_url?: string | null;
  print_values?: Record<string, string | null> | null;
  verify_url?: string | null;
}

export interface CertField {
  x: number;
  y: number;
  size: number;
  align?: "left" | "center" | "right";
  visible?: boolean;
}

export interface CertificateTemplate {
  page: { width: number; height: number };
  fields: Record<string, CertField>;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  status: string;
  created_at?: string;
}

export interface PageContent {
  id?: string;
  slug: string;
  title: string;
  subtitle?: string;
  body?: string;
  sections?: { heading?: string; text?: string }[];
  published?: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface StudentDashboard {
  stats: Record<string, number>;
  enrolments: Enrolment[];
  membership: Membership | null;
  payments: Payment[];
  recent_attempts: Attempt[];
  certificates: Certificate[];
}

export interface AdminDashboard {
  stats: Record<string, number | Record<string, number>>;
  enrolment_trend: { date: string; count: number }[];
  recent_payments: Payment[];
}

export interface StaffDashboard {
  stats: Record<string, number>;
  recent_programmes: Programme[];
}
