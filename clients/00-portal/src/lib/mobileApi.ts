/**
 * mobileApi — Axios instance for mobile employee app (/m/*)
 *
 * Separate from the main `api` instance so that:
 * 1. Auth header uses mobile_token (not erp_token)
 * 2. 401 responses do NOT redirect to the main login page
 */
import axios from 'axios';

export const mobileApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'https://erp-backend-n433.onrender.com/api',
  headers: { 'Content-Type': 'application/json' },
});

// Inject mobile token automatically
mobileApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('mobile_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap { success, data } envelope — same as main api
// Does NOT redirect on 401 (let mobile pages handle auth themselves)
mobileApi.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === 'object' && 'success' in res.data) {
      return { ...res, data: res.data.data };
    }
    return res;
  },
  (err) => Promise.reject(err),
);
