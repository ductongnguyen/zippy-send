// utils/auth.ts

import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';
import type { JwtPayload } from '@/interfaces/types';
import { apiBaseUrl } from "@/lib/config";

// Định nghĩa kiểu dữ liệu cho phản hồi từ API refresh token
interface RefreshResponse {
  token: string;
}

/**
 * Kiểm tra xem token có hợp lệ và đã hết hạn chưa.
 * @param token - Access token (có thể là null hoặc undefined)
 * @returns {boolean} - true nếu token không tồn tại hoặc đã hết hạn.
 */
export const isTokenExpired = (token: string | null | undefined): boolean => {
  if (!token) return true;
  try {
    const { exp }: JwtPayload = jwtDecode(token);
    const buffer = 60; // Làm mới token 60 giây trước khi nó thực sự hết hạn
    const currentTimeInSeconds = Date.now() / 1000;
    return exp < currentTimeInSeconds + buffer;
  } catch (error) {
    console.error("Invalid token:", error);
    return true;
  }
};

/**
 * Gọi API để lấy access token mới bằng refresh token.
 * @returns {Promise<string>} - Trả về một Promise giải quyết với access token mới.
 * @throws {Error} - Ném lỗi nếu không thể làm mới token.
 */
export const refreshTokenAPI = async (): Promise<string> => {
  const refreshToken = Cookies.get('refresh_token');
  if (!refreshToken) {
    return Promise.reject(new Error('No refresh token found'));
  }

  try {
    const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token:refreshToken }),
    });

    const data: RefreshResponse = await res.json();
    if (!res.ok) {
      throw new Error('Failed to refresh token');
    }

    const { token: newAccessToken } = data;
    Cookies.set('token', newAccessToken);
    return newAccessToken;

  } catch (error) {
    console.error("Critical: Refresh token failed. Logging out.", error);
    Cookies.remove('token');
    Cookies.remove('refresh_token');
    return Promise.reject(error as Error);
  }
};