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
  slot: string;        // отображаемое время начала (может быть перенесённым)
  original: string;    // исходное время слота из генератора
  endTime: string;     // время окончания
  duration: number;    // длительность в минутах
  booked: boolean;
  blocked?: boolean;   // слот перекрыт временной блокировкой
}

export interface ScheduleInfo {
  openTime: string;
  closeTime: string;
  slotDuration: number;
}

export interface SlotsResponse {
  date: string;
  blocked: boolean;
  blockedMessage: string | null;
  schedule?: ScheduleInfo;
  slots: Slot[];
}

export type BlockAudience = 'teacher' | 'student' | 'all';

export interface DayBlock {
  id?: number;
  audience: BlockAudience;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  timeFrom?: string | null; // HH:mm — необязательно, иначе блокировка на весь день
  timeTo?: string | null;   // HH:mm
}

export const AUDIENCE_RU: Record<BlockAudience, string> = {
  teacher: 'Преподаватель',
  student: 'Студент',
  all: 'Для всех',
};

// Проверка: заблокирован ли день для указанной роли по списку блокировок
export function isDateBlockedFor(dateKeyStr: string, role: 'teacher' | 'student', blocks: DayBlock[]): boolean {
  return blocks.some(
    (b) => b.dateFrom <= dateKeyStr && dateKeyStr <= b.dateTo && (b.audience === 'all' || b.audience === role),
  );
}

// Индивидуальное изменение конкретного слота (перенос времени / длительность / удаление)
export interface TimeOverride {
  original: string;  // исходное время слота "HH:mm"
  newTime?: string | null;
  duration?: number | null;
  deleted?: boolean;
}

export interface ScheduleConfig extends ScheduleInfo {
  overrides: TimeOverride[];
}

export interface StudioConfig {
  blockedDays: number[]; // 1=Пн ... 5=Пт
  msgTeacher: string;
  msgStudent: string;
  dayBlocks?: DayBlock[];
  openTime?: string;
  closeTime?: string;
  slotDuration?: number;
  timeOverrides?: TimeOverride[];
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
