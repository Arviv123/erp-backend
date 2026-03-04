import axios from 'axios';

export const platformApi = axios.create({
  baseURL: 'https://erp-backend-n433.onrender.com/api/platform',
  headers: { 'Content-Type': 'application/json' },
});

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('platform_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformApi.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === 'object' && 'success' in res.data) {
      return { ...res, data: res.data.data };
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('platform_token');
      localStorage.removeItem('platform_admin');
      window.location.href = '/platform/login';
    }
    return Promise.reject(err);
  }
);

export default platformApi;
