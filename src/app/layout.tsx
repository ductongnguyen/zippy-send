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
        <meta name="description" content="Zippy Send is a super-fast, easy-to-use file-sharing service with end-to-end encryption. No account needed. Send files of any size effortlessly." />
        <meta name="keywords" content="file sharing, bulk upload, secure file transfer, no account needed, Zippy Send, fast file transfer" />
        <meta property="og:title" content="Zippy Send - Super-Fast & Easy File Sharing" />
        <meta property="og:description" content="Zippy Send is a super-fast, easy-to-use file-sharing service with end-to-end encryption. No account needed. Send files of any size effortlessly." />
        <meta property="og:image" content="https://zippysend.vercel.app/logo.svg" />
        <meta property="og:url" content="https://zippysend.vercel.app/" />
        <link rel="icon" href="/logo.ico" type="image/x-icon" />
        <title>Zippy Send - Super-Fast & Easy File Sharing</title>
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
