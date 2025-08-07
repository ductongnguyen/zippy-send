export interface JwtPayload {
  exp: number; 
  username?: string;
  sub?: string; 
  [key: string]: any;
}
export interface UserData {
  username: string;
  id: string;
}

export type User = JwtPayload | null;
