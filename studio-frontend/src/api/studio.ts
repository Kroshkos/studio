import axios from 'axios';
import {
  Booking,
  BookingFilters,
  DashboardData,
  DepartmentAdmin,
  LoginResponse,
  SlotsResponse,
  StudioConfig,
  BookingStage,
} from '../types';

const api = axios.create({
  baseURL: '/api/studio', // через Vite proxy / nginx
  headers: { 'Content-Type': 'application/json' },
});

// ---- Хранилище сессии ----
export interface SessionState {
  token: string;
  kind: 'admin' | 'department';
  department?: { id: string; name: string };
}

const STORAGE_KEY = 'studio-session';

export function saveSession(s: SessionState | null) {
  if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else sessionStorage.removeItem(STORAGE_KEY);
  applyToken(s?.token ?? null);
}

export function loadSession(): SessionState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SessionState;
    applyToken(s.token);
    return s;
  } catch {
    return null;
  }
}

function applyToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete api.defaults.headers.common['Authorization'];
}

// При загрузке модуля подхватываем сохранённую сессию
loadSession();

// ---- Публичные эндпоинты ----
export const getSlots = (date: string, role: 'teacher' | 'student') =>
  api.get<SlotsResponse>('/slots', { params: { date, role } }).then((r) => r.data);

export const getConfig = () =>
  api.get<StudioConfig>('/config').then((r) => r.data);

export const login = (loginName: string, password: string) =>
  api.post<LoginResponse>('/login', { login: loginName, password }).then((r) => r.data);

// ---- Эндпоинты после авторизации ----
export const getMyBookings = () =>
  api.get<Booking[]>('/bookings/mine').then((r) => r.data);

export const createBooking = (data: {
  departmentId: string;
  phone: string;
  email: string;
  purpose?: string;
  role: 'teacher' | 'student';
  date: string;
  slot: string;
}) => api.post<Booking>('/bookings', data).then((r) => r.data);

export const deleteBooking = (id: string) => api.delete(`/bookings/${id}`);

export const setBookingStage = (id: string, stage: BookingStage) =>
  api.patch<Booking>(`/bookings/${id}/stage`, { stage }).then((r) => r.data);

export const getDashboard = () =>
  api.get<DashboardData>('/dashboard').then((r) => r.data);

// ---- Админские эндпоинты ----
export const adminListBookings = (filters: BookingFilters) =>
  api.get<Booking[]>('/admin/bookings', { params: filters }).then((r) => r.data);

export const adminUpdateBooking = (
  id: string,
  data: Partial<Pick<Booking, 'phone' | 'email' | 'purpose' | 'role' | 'date' | 'slot'>>,
) => api.patch<Booking>(`/admin/bookings/${id}`, data).then((r) => r.data);

export const adminMoveBooking = (id: string, date: string, slot: string) =>
  api.post<Booking>(`/admin/bookings/${id}/move`, { date, slot }).then((r) => r.data);

export const adminDeleteAllBookings = () => api.delete('/admin/bookings');

export const listDepartments = () =>
  api.get<DepartmentAdmin[]>('/admin/departments').then((r) => r.data);

export const createDepartment = (name: string, password: string) =>
  api.post<DepartmentAdmin>('/admin/departments', { name, password }).then((r) => r.data);

export const updateDepartment = (
  id: string,
  data: { name?: string; password?: string; isActive?: boolean },
) => api.patch<DepartmentAdmin>(`/admin/departments/${id}`, data).then((r) => r.data);

export const deleteDepartment = (id: string) =>
  api.delete(`/admin/departments/${id}`);

export const updateConfig = (config: Partial<StudioConfig>) =>
  api.put<StudioConfig>('/admin/config', config).then((r) => r.data);

export const downloadReport = async (): Promise<Blob> => {
  const response = await api.get('/admin/report', { responseType: 'blob' });
  return response.data;
};
