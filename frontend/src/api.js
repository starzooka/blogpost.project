import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080';
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');
const LOGIN_PATH = '/login';
const REFRESH_PATH = '/refresh';
const REFRESH_TOKEN_KEY = 'refresh_token';
const ACCESS_TOKEN_KEY = 'access_token';

// Create an Axios instance pointing to your FastAPI backend URL
const api = axios.create({
    baseURL: API_BASE_URL,
});

// Add an interceptor to automatically attach the JWT token to requests
api.interceptors.request.use(
    (config) => {
        if (config.skipAuthHeader) {
            return config;
        }

        const token = localStorage.getItem(ACCESS_TOKEN_KEY);
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

const getSessionSnapshot = () => ({
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
    username: localStorage.getItem('username'),
    userId: Number(localStorage.getItem('user_id') || 0),
});

export const setSessionData = ({ accessToken, refreshToken, username, userId }) => {
    if (accessToken) {
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    }
    if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
    if (username) {
        localStorage.setItem('username', username);
    }
    if (userId) {
        localStorage.setItem('user_id', String(userId));
    }
};

export const clearSessionData = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem('username');
    localStorage.removeItem('user_id');
};

export const isAdminUser = (userId, username) => Number(userId) === 1 || String(username || '').toLowerCase() === 'admin';

let refreshPromise = null;

const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
        throw new Error('Missing refresh token');
    }

    const response = await api.post(
        REFRESH_PATH,
        { refresh_token: refreshToken },
        { skipAuthHeader: true, skipAuthRefresh: true }
    );

    const newAccessToken = response.data?.access_token;
    if (!newAccessToken) {
        throw new Error('Missing access token in refresh response');
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
    return newAccessToken;
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config || {};
        const statusCode = error.response?.status;

        if (
            statusCode !== 401 ||
            originalRequest._retry ||
            originalRequest.skipAuthRefresh ||
            originalRequest.url === LOGIN_PATH ||
            originalRequest.url === REFRESH_PATH
        ) {
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        if (!refreshPromise) {
            refreshPromise = refreshAccessToken().finally(() => {
                refreshPromise = null;
            });
        }

        try {
            const newToken = await refreshPromise;
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
        } catch (refreshError) {
            clearSessionData();
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
            return Promise.reject(refreshError);
        }
    }
);

export { getSessionSnapshot };

export default api;
