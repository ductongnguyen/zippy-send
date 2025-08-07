"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';
import { isTokenExpired, refreshTokenAPI } from '@/utils/auth';
import type { User, JwtPayload } from '../interfaces/types';

interface AuthContextType {
  user: User;
  isAuthenticated: boolean;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const verifyAuth = async () => {
      let token = Cookies.get('token');

      if (token && isTokenExpired(token)) {
        try {
          console.log('Access token expired, attempting to refresh...');
          token = await refreshTokenAPI();
        } catch (error) {
          console.log('Could not refresh token. User is logged out.');
          token = undefined;
        }
      }

      if (token) {
        try {
          const decodedUser: JwtPayload = jwtDecode(token);
          setUser(decodedUser);
          setIsAuthenticated(true);
        } catch {
          setUser(null);
          setIsAuthenticated(false);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      
      setLoading(false);
    };

    verifyAuth();
  }, []);

  const logout = () => {
    Cookies.remove('token');
    Cookies.remove('refresh_token');
    setUser(null);
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const value: AuthContextType = { user, isAuthenticated, loading, logout };

  return (
    <AuthContext.Provider value={value}>
      {loading ? <div>Loading session...</div> : children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};