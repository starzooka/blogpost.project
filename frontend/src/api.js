import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080';
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');
const LOGIN_PATH = '/login';
const REFRESH_PATH = '/refresh';
const REFRESH_TOKEN_KEY = 'refresh_token';
const ACCESS_TOKEN_KEY = 'access_token';
const AVATAR_URL_KEY = 'avatar_url';

// Create an Axios instance pointing to your FastAPI backend URL
const api = axios.create({
    baseURL: API_BASE_URL,
});

const CANDIDATE_API_BASE_URLS = Array.from(new Set([
    API_BASE_URL,
    'http://127.0.0.1:8080',
    'http://localhost:8080',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'http://127.0.0.1:8003',
    'http://localhost:8003',
]));

let baseUrlProbePromise = null;

const probeApiBaseUrl = async (baseUrl) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    try {
        const response = await fetch(`${baseUrl}/`, {
            method: 'GET',
            signal: controller.signal,
            credentials: 'omit',
        });
        return response.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
};

const resolveApiBaseUrl = async () => {
    if (baseUrlProbePromise) {
        return baseUrlProbePromise;
    }

    baseUrlProbePromise = (async () => {
        for (const baseUrl of CANDIDATE_API_BASE_URLS) {
            const isReachable = await probeApiBaseUrl(baseUrl);
            if (isReachable) {
                api.defaults.baseURL = baseUrl;
                return baseUrl;
            }
        }
        return null;
    })().finally(() => {
        baseUrlProbePromise = null;
    });

    return baseUrlProbePromise;
};

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
    avatarUrl: localStorage.getItem(AVATAR_URL_KEY) || '',
});

export const setSessionData = ({ accessToken, refreshToken, username, userId, avatarUrl }) => {
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
    if (avatarUrl !== undefined) {
        if (avatarUrl) {
            localStorage.setItem(AVATAR_URL_KEY, avatarUrl);
        } else {
            localStorage.removeItem(AVATAR_URL_KEY);
        }
    }
};

export const clearSessionData = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem('username');
    localStorage.removeItem('user_id');
    localStorage.removeItem(AVATAR_URL_KEY);
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
        const shouldRetryWithBaseUrlSwitch =
            !error.response &&
            !originalRequest._retryBaseUrl &&
            !originalRequest.skipBaseUrlRetry;

        if (shouldRetryWithBaseUrlSwitch) {
            originalRequest._retryBaseUrl = true;
            const nextBaseUrl = await resolveApiBaseUrl();
            if (nextBaseUrl) {
                originalRequest.baseURL = nextBaseUrl;
                return api(originalRequest);
            }
        }

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
