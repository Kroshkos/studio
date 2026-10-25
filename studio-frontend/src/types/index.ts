// Общие типы сервиса видеостудии

export type StageKey = 'waiting' | 'recording' | 'processing' | 'sent';

export interface BookingStage {
  id: number;
  key: StageKey;
  label: string;
  order: number;
}

export interface DepartmentRef {
  id: number;
  name: string;
}

export interface Booking {
  id: string;
  phone: string;
  email: string;
  purpose?: string | null;
  role: 'teacher' | 'student';
  date: string;        // YYYY-MM-DD
  slot: string;        // "09:00"
  dateLabel?: string | null;
  stageKey: StageKey;
  stage?: BookingStage;
  departmentId?: number | null;
  department?: DepartmentRef | null;
  createdBy: string;   // guest | admin | <название подразделения>
  createdAt: string;
  updatedAt: string;
}

export interface Slot {
  slot: string;
  booked: boolean;
}

export interface SlotsResponse {
  date: string;
  blocked: boolean;
  blockedMessage: string | null;
  slots: Slot[];
}

// Публичная занятость слота (без персональных данных)
export interface OccupiedSlot {
  date: string;
  slot: string;
}

export interface StudioConfig {
  blockedDays: number[];        // схема ISO: 1=Пн … 7=Вс
  msgTeacher: string;
  msgStudent: string;
}

export type UserRole = 'admin' | 'department';

export interface LoginResponse {
  role: UserRole;
  name: string;
  departmentId?: number;
  token: string;
}

export interface Department {
  id: number;
  name: string;
  createdAt: string;
  _count?: { bookings: number };
}

export interface DashboardData {
  total: number;
  teachers: number;
  students: number;
  stages: { key: StageKey; label: string; count: number }[];
}
