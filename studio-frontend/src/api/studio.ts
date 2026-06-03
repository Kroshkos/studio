import axios from 'axios';
import { Booking, SlotsResponse, StudioConfig, AdminLoginResponse, Stats } from '../types';

const api = axios.create({
  baseURL: '/api/studio', // через Vite proxy
  headers: { 'Content-Type': 'application/json' },
});

// Добавляем токен администратора, если он есть
export const setAdminToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Публичные эндпоинты
export const getSlots = (date: string, role: 'teacher' | 'student') =>
  api.get<SlotsResponse>('/slots', { params: { date, role } }).then(res => res.data);

export const getAllBookings = () =>
  api.get<Booking[]>('/bookings').then(res => res.data);

export const createBooking = (data: Omit<Booking, 'id' | 'createdAt' | 'dateLabel'>) =>
  api.post<Booking>('/bookings', data).then(res => res.data);

export const getConfig = () =>
  api.get<StudioConfig>('/config').then(res => res.data);

// Административные эндпоинты (требуют токен)
export const adminLogin = (login: string, password: string) =>
  api.post<AdminLoginResponse>('/admin/login', { login, password }).then(res => res.data);

export const deleteBooking = (id: string) =>
  api.delete(`/bookings/${id}`);

export const deleteAllBookings = () =>
  api.delete('/bookings');

export const updateConfig = (config: Partial<StudioConfig>) =>
  api.put<StudioConfig>('/config', config).then(res => res.data);

export const downloadReport = async (token: string): Promise<Blob> => {
  const response = await axios.get('/api/studio/report', {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  });
  return response.data;
};