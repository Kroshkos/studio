import axios from 'axios';
import {
  Booking, SlotsResponse, StudioConfig, LoginResponse, OccupiedSlot,
  Department, DashboardData, StageKey,
} from '../types';

const api = axios.create({
  baseURL: '/api/studio', // через Vite proxy
  headers: { 'Content-Type': 'application/json' },
});

// Токен текущей сессии (администратора или подразделения)
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// === Публичные эндпоинты ===
export const getSlots = (date: string, role: 'teacher' | 'student') =>
  api.get<SlotsResponse>('/slots', { params: { date, role } }).then(res => res.data);

// Занятость всех дат (только дата+слот, без персональных данных) — для календаря
export const getOccupiedSlots = () =>
  api.get<OccupiedSlot[]>('/public/occupied').then(res => res.data);

export interface CreateBookingData {
  phone: string;
  email: string;
  purpose?: string;
  role: 'teacher' | 'student';
  date: string;
  slot: string;
}

export const createBooking = (data: CreateBookingData) =>
  api.post<Booking>('/bookings', data).then(res => res.data);

export const getConfig = () =>
  api.get<StudioConfig>('/config').then(res => res.data);

// Единая точка входа: логин подразделения или администратора
export const login = (loginName: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { login: loginName, password }).then(res => res.data);

// === Подразделение ===
export const getMyBookings = () =>
  api.get<Booking[]>('/my/bookings').then(res => res.data);

// === Администратор ===
export const getDashboard = () =>
  api.get<DashboardData>('/admin/dashboard').then(res => res.data);

// Полный список бронирований с персональными данными — только для администратора
export const getAllBookings = () =>
  api.get<Booking[]>('/bookings').then(res => res.data);

// Бронирование студии администратором (от имени подразделения)
export const adminCreateBooking = (data: CreateBookingData & { departmentId?: number }) => {
  const { departmentId, ...booking } = data;
  return api
    .post<Booking>('/admin/bookings', booking, { params: departmentId ? { departmentId } : {} })
    .then(res => res.data);
};

// Перенос/редактирование брони
export const updateBooking = (id: string, data: Partial<Booking>) =>
  api.patch<Booking>(`/admin/bookings/${id}`, data).then(res => res.data);

// Отметка этапа
export const setBookingStage = (id: string, stageKey: StageKey) =>
  api.patch<Booking>(`/admin/bookings/${id}/stage`, { stageKey }).then(res => res.data);

export const deleteBooking = (id: string) => api.delete(`/bookings/${id}`);

export const deleteAllBookings = () => api.delete('/bookings');

export const listDepartments = () =>
  api.get<Department[]>('/admin/departments').then(res => res.data);

export const createDepartment = (name: string, password: string) =>
  api.post<Department>('/admin/departments', { name, password }).then(res => res.data);

export const updateDepartment = (id: number, name: string, password: string) =>
  api.put<Department>(`/admin/departments/${id}`, { name, password }).then(res => res.data);

export const deleteDepartment = (id: number) =>
  api.delete(`/admin/departments/${id}`);

export const updateConfig = (config: Partial<StudioConfig>) =>
  api.put<StudioConfig>('/config', config).then(res => res.data);

export const downloadReport = async (token: string): Promise<Blob> => {
  const response = await axios.get('/api/studio/report', {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  });
  return response.data;
};
