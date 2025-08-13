import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { App as AntdApp, Layout } from 'antd'
import { AuthProvider } from "@/context/AuthContext";
import PageHeader from "@/app/components/header";
import PageFooter from "@/app/components/footer";
import { Analytics } from "@vercel/analytics/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zippy Send",
  description: "Send files to your friends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Zippy Send</title>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <AntdApp>
            <Layout style={{ minHeight: '100vh' }}>
              <PageHeader />
              {children}
              <PageFooter />
            </Layout>
          </AntdApp>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
