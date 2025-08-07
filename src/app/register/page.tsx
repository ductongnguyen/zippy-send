'use client'

import {
  LockOutlined,
  UserOutlined,
  MailOutlined,
} from '@ant-design/icons'
import {
  LoginForm,
  ProFormText,
  ProFormSelect,
} from '@ant-design/pro-components'
import { App, Typography } from 'antd'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiBaseUrl } from '@/lib/config'

export default function Register() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { message } = App.useApp()

  return (
    <div style={{ background: '#f5f6fa', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <LoginForm
        logo="https://github.githubassets.com/favicons/favicon.png"
        title="Github"
        subTitle="Create your account to join the world’s largest code hosting platform"
        actions={
          <div style={{ width: '100%', textAlign: 'center' }}>
            <Typography.Text type="secondary">
              Already have an account?{' '}
              <Typography.Link href="/login" style={{ color: '#1677ff' }}>Sign in!</Typography.Link>
            </Typography.Text>
          </div>
        }
        submitter={{
          searchConfig: { submitText: 'Register' },
          submitButtonProps: { loading },
        }}
        onFinish={async (values) => {
          setLoading(true)
          try {
            const res = await fetch(`${apiBaseUrl}/auth/register`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: values.username,
                email: values.email,
                password: values.password,
                role: 'user', // always submit as user
              }),
            })
            const result = await res.json()
            if (!res.ok) {
              message.error(result.message || 'Registration failed!')
              setLoading(false)
              return false
            }
            message.success('Registration successful!')
            setTimeout(() => {
              router.push('/login')
            }, 1500)
            setLoading(false)
            return true
          } catch (e) {
            message.error('Network error!')
            setLoading(false)
            return false
          }
        }}
      >
        <ProFormText
          name="username"
          fieldProps={{
            size: 'large',
            prefix: <UserOutlined className={'prefixIcon'} />,
          }}
          placeholder={'Username'}
          rules={[
            {
              required: true,
              message: 'Please enter your username!',
            },
          ]}
        />
        <ProFormText
          name="email"
          fieldProps={{
            size: 'large',
            prefix: <MailOutlined className={'prefixIcon'} />,
          }}
          placeholder={'Email'}
          rules={[
            {
              required: true,
              message: 'Please enter your email!',
            },
            {
              type: 'email',
              message: 'Please enter a valid email!',
            },
          ]}
        />
        <ProFormText.Password
          name="password"
          fieldProps={{
            size: 'large',
            prefix: <LockOutlined className={'prefixIcon'} />,
          }}
          placeholder={'Password'}
          rules={[
            {
              required: true,
              message: 'Please enter your password!',
            },
            {
              min: 6,
              message: 'Password must be at least 6 characters!',
            },
          ]}
        />
      </LoginForm>
    </div>
  )
} 