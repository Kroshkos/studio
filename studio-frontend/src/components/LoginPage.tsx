import { FormEvent, useState } from 'react';
import { login } from '../api/studio';
import { LoginResponse } from '../types';

interface Props {
  onSuccess: (res: LoginResponse) => void;
}

export default function LoginPage({ onSuccess }: Props) {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginName.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await login(loginName.trim(), password);
      onSuccess(res);
    } catch {
      setError('Неверный логин или пароль');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🎬</div>
        <h1>Видеостудия</h1>
        <p className="login-sub">
          Военно-медицинская академия<br />
          Запись в лабораторию видеолекций
        </p>

        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="lg-name">Подразделение (логин)</label>
            <input
              id="lg-name"
              type="text"
              autoComplete="username"
              placeholder="Например: Кафедра анатомии"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="lg-pass">Пароль</label>
            <input
              id="lg-pass"
              type="password"
              autoComplete="current-password"
              placeholder="Пароль выдаёт администратор"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="status-msg show error">{error}</div>}

          <button className="btn-submit" type="submit" disabled={busy}>
            {busy ? 'Вход…' : 'Войти'}
          </button>
        </form>

        <p className="login-hint">
          Логин подразделения — его наименование. Пароль выдаёт администратор видеостудии.
        </p>
      </div>
    </div>
  );
}
