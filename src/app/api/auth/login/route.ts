import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const { username, password } = await request.json()

  const validUsername = process.env.SITE_USERNAME || 'admin'
  const validPassword = process.env.SITE_PASSWORD || 'trader2024!'

  if (username === validUsername && password === validPassword) {
    const cookieStore = cookies()
    cookieStore.set('auth-token', process.env.AUTH_SECRET || 'fallback-secret', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
}
