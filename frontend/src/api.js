import axios from 'axios';

// Create an Axios instance pointing to your FastAPI backend URL
const api = axios.create({
    baseURL: 'http://127.0.0.1:8080', // Make sure this matches your Uvicorn port!
});

// Add an interceptor to automatically attach the JWT token to requests
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;