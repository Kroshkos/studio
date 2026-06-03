export interface Booking {
  id: string;
  name: string;
  phone: string;
  email?: string;
  purpose?: string;
  role: 'teacher' | 'student';
  date: string;
  slot: string;
  dateLabel?: string;
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
  blockedDays: number[];        // 1=Пн ... 5=Пт
  msgTeacher: string;
  msgStudent: string;
}

export interface AdminLoginResponse {
  token: string;
}

export interface Stats {
  total: number;
  upcoming: number;
  teachers: number;
  students: number;
}