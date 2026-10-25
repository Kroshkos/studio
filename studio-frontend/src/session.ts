import { useCallback, useEffect, useState } from 'react';
import { LoginResponse, setAuthToken } from './api/studio';

export interface Session extends Omit<LoginResponse, 'token'> {
  token: string;
}

const STORAGE_KEY = 'studioSession';

// Хранилище сессии текущей роли (администратор / подразделение).
// Токен и роль нужны для корректной маршрутизации интерфейса после перезагрузки страницы.
export function useSession() {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  });

  // Прокидываем Bearer-токен в axios при каждой смене сессии
  useEffect(() => {
    if (session?.token) {
      setAuthToken(session.token);
    } else {
      setAuthToken(null);
    }
  }, [session]);

  const login = useCallback((res: LoginResponse) => {
    const s: Session = { role: res.role, name: res.name, departmentId: res.departmentId, token: res.token };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  return { session, login, logout };
}
