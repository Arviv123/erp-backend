/**
 * SHARED API CLIENT — copied from _shared/src/lib/api.ts
 */
import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://erp-backend-n433.onrender.com/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — מוסיף JWT token לכל בקשה
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — מפשיל את המעטפה { success, data, meta } → data
api.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === 'object' && 'success' in res.data) {
      return { ...res, data: res.data.data };
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('erp_token');
      localStorage.removeItem('erp_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export default api;
