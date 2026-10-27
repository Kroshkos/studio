export type BookingStage =
  | 'AWAITING_RECORD'
  | 'RECORDING'
  | 'PROCESSING'
  | 'SENT';

export const STAGES: BookingStage[] = ['AWAITING_RECORD', 'RECORDING', 'PROCESSING', 'SENT'];

export const STAGE_RU: Record<BookingStage, string> = {
  AWAITING_RECORD: 'Ожидает записи',
  RECORDING: 'Запись видео',
  PROCESSING: 'Обработка видео',
  SENT: 'Видео отправлено',
};

export interface DepartmentInfo {
  id: string;
  name: string;
}

export interface DepartmentAdmin {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  bookingsCount: number;
}

export interface StageChange {
  stage: BookingStage;
  at: string;
  by: string;
}

export interface Booking {
  id: string;
  departmentId: string;
  department?: DepartmentInfo;
  phone: string;
  email: string;
  purpose?: string | null;
  role: 'teacher' | 'student';
  date: string;
  slot: string;
  dateLabel?: string | null;
  stage: BookingStage;
  stageUpdatedAt: string;
  stageHistory: StageChange[];
  createdAt: string;
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

export interface StudioConfig {
  blockedDays: number[]; // 1=Пн ... 5=Пт
  msgTeacher: string;
  msgStudent: string;
}

export type SessionKind = 'admin' | 'department';

export interface LoginResponse {
  kind: SessionKind;
  token: string;
  department?: DepartmentInfo;
}

export interface DashboardData {
  totalBookings: number;
  recordedVideos: number;
  processedSentVideos: number;
  teachers: number;
  students: number;
  stages: Record<BookingStage, number>;
  byDepartment: { departmentId: string; departmentName: string; count: number }[];
}

export interface BookingFilters {
  q?: string;
  stage?: BookingStage | 'ALL';
  role?: 'teacher' | 'student' | 'ALL';
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
}
