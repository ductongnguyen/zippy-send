// utils/apiClient.ts

import Cookies from 'js-cookie';
import { isTokenExpired, refreshTokenAPI } from './auth';

let isRefreshing = false;
let failedQueue: { 
  resolve: (value: Response) => void; 
  reject: (reason?: any) => void 
}[] = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(new Response(null, { status: 200 })); // Đây là một ví dụ đơn giản
    }
  });
  failedQueue = [];
};

/**
 * Một trình bao bọc fetch được xác thực, tự động làm mới token.
 * @param url - URL của API
 * @param options - Các tùy chọn của Fetch API (RequestInit)
 * @returns {Promise<Response>} - Trả về một Promise giải quyết với đối tượng Response.
 */
export const apiClient = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`;
  let token = Cookies.get('token');

  if (token && isTokenExpired(token)) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshTokenAPI()
        .then(newToken => {
          isRefreshing = false;
        })
        .catch(err => {
          isRefreshing = false;
          if (typeof window !== 'undefined') window.location.href = '/login';
        });
    }

  
    await new Promise(resolve => setTimeout(resolve, 1000)); 
    token = Cookies.get('token');
  }

  const finalHeaders = new Headers(options.headers);
  if (token) {
    finalHeaders.set('Authorization', `${token}`);
  }
  if (!finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }

  const finalOptions: RequestInit = {
    ...options,
    headers: finalHeaders,
  };

  const response = await fetch(url, finalOptions);

  if (response.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    return Promise.reject(new Error('Unauthorized'));
  }

  return response;
};