"use client";

import {
  AlipayCircleOutlined,
  LockOutlined,
  TaobaoCircleOutlined,
  UserOutlined,
  WeiboCircleOutlined,
} from "@ant-design/icons";
import { LoginForm, ProFormText } from "@ant-design/pro-components";
import { Space, App, Typography } from "antd";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";

// Cookie utility functions
const setCookie = (name: string, value: string, expiryDays?: number) => {
  if (typeof document === "undefined") return;

  let expires = "";
  if (expiryDays) {
    const date = new Date();
    date.setTime(date.getTime() + expiryDays * 24 * 60 * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  }

  document.cookie = name + "=" + value + expires + "; path=/";
};

const iconStyles = {
  marginInlineStart: "16px",
  color: "rgba(0, 0, 0, 0.2)",
  fontSize: "24px",
  verticalAlign: "middle",
  cursor: "pointer",
};

export default function Login() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { message } = App.useApp();
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL; // Sử dụng biến môi trường
  const TOKEN_COOKIE_DEFAULT_EXPIRY_DAYS = 7;
  const REFRESH_TOKEN_COOKIE_DEFAULT_EXPIRY_DAYS = 14;
  const REDIRECT_DELAY_MS = 1000;

  // Một hàm tiện ích để đặt cookie, giúp tránh lặp lại code
  const setAuthCookies = (token: string, refreshToken: string) => {
    try {
      const decoded = jwtDecode(token);
      if (decoded.exp) {
        // Sử dụng trực tiếp đối tượng Date để có độ chính xác cao hơn
        const expiryDate = new Date(decoded.exp * 1000);
        const refreshTokenExpiryDate = new Date(
          expiryDate.getTime() + 7 * 24 * 60 * 60 * 1000
        ); // Thêm 7 ngày

        setCookie(
          "token",
          token,
          Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        );
        setCookie(
          "refresh_token",
          refreshToken,
          Math.ceil(
            (refreshTokenExpiryDate.getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        );
      } else {
        throw new Error("Token không có trường 'exp'.");
      }
    } catch (e) {
      console.error(
        "Lỗi khi giải mã token hoặc token không hợp lệ, sử dụng thời gian mặc định:",
        e
      );
      setCookie("token", token, TOKEN_COOKIE_DEFAULT_EXPIRY_DAYS);
      setCookie(
        "refresh_token",
        refreshToken,
        REFRESH_TOKEN_COOKIE_DEFAULT_EXPIRY_DAYS
      );
    }
  };

  return (
    <div
      style={{
        background: "#f5f6fa",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LoginForm
        logo="https://github.githubassets.com/favicons/favicon.png"
        title="Github"
        subTitle="The world's largest code hosting platform"
        actions={
          <div style={{ width: "100%", textAlign: "center" }}>
            <Typography.Text type="secondary">
              No account yet,{" "}
              <Typography.Link href="/register" style={{ color: "#1677ff" }}>
                Join now !
              </Typography.Link>
            </Typography.Text>
          </div>
        }
        submitter={{
          searchConfig: { submitText: "Login" },
          submitButtonProps: { loading },
        }}
        onFinish={async (values) => {
          setLoading(true);
          try {
            const res = await fetch(`${API_BASE_URL}/auth/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: values.username,
                password: values.password,
              }),
            });

            const result = await res.json();

            if (!res.ok) {
              message.error({
                content:
                  result.message || `Login failed: ${res.status} - ${result.message}`,
                duration: 3,
              });
              setLoading(false);
              return;
            }

            setAuthCookies(result.token, result.refresh_token);

            message.success("Login successful!");

            setTimeout(() => {
              router.push("/");
            }, REDIRECT_DELAY_MS);

          } catch (error) {
            console.error("Login error:", error); // Ghi lại lỗi chi tiết để debug
            message.error("Login failed. Please check your network connection.");
            setLoading(false);
          }
        }}
      >
        <ProFormText
          name="username"
          fieldProps={{
            size: "large",
            prefix: <UserOutlined className={"prefixIcon"} />,
          }}
          placeholder={"Username"}
          rules={[
            {
              required: true,
              message: "Please enter your username!",
            },
          ]}
        />
        <ProFormText.Password
          name="password"
          fieldProps={{
            size: "large",
            prefix: <LockOutlined className={"prefixIcon"} />,
          }}
          placeholder={"Password"}
          rules={[
            {
              required: true,
              message: "Please enter your password!",
            },
          ]}
        />
      </LoginForm>
    </div>
  );
}
