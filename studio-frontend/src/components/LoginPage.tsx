import React, { useState } from 'react';
import { login as apiLogin } from '../api/studio';
import type { LoginResponse } from '../types';

interface LoginPageProps {
  onLogin: (res: LoginResponse) => void;
}

// Стартовая страница входа. Логин подразделения = его наименование;
// если введён логин администратора — откроется панель администрирования.
const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!loginName.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    setLoading(true);
    try {
      const res = await apiLogin(loginName.trim(), password);
      onLogin(res);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🎬</div>
        <h1>Видеостудия</h1>
        <p className="subtitle">Запись видеолекций • Войдите в сервис, чтобы записаться или управлять записями</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login-name">Логин</label>
            <input
              id="login-name"
              type="text"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              placeholder="Наименование подразделения"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-pass">Пароль</label>
            <input
              id="login-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль выдаёт администратор"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="status-msg show error">{error}</div>}

          <button className="btn-submit" type="submit" disabled={loading}>
            {loading ? 'Проверяем…' : 'Войти'}
          </button>
        </form>

        <div className="login-hint">
          Пароль для подразделения создаёт администратор видеостудии.<br />
          Если у вас нет учётной записи — обратитесь по вопросам поддержки.
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
