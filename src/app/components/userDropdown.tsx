'use client'

import { UserOutlined, QuestionCircleOutlined, LogoutOutlined } from '@ant-design/icons'
import { Dropdown } from 'antd'
import { Avatar } from 'antd'

export default function UserDropdown({ user, onLogout }: { user: { username: string } | null, onLogout: () => void }) {
  if (!user) return null

  const menuItems = [
    { key: 'username', disabled: true, icon: <UserOutlined />, label: user.username },
    { type: 'divider' as const },
    { key: 'help', icon: <QuestionCircleOutlined />, label: 'Trợ giúp' },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: onLogout },
  ]

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
      <Avatar
        style={{ cursor: 'pointer', background: '#fde3cf', color: '#f56a00' }}
        icon={<UserOutlined />}
        src="https://api.dicebear.com/7.x/adventurer/svg?seed=User"
      />
    </Dropdown>
  )
}