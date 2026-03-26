import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const { username, password } = await request.json()

  // Check Supabase users table first
  const { data: user } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', username)
    .eq('password', password)
    .eq('active', true)
    .single()

  // Fall back to env vars if no users table or no match
  if (!user) {
    const validUsername = process.env.SITE_USERNAME || 'admin'
    const validPassword = process.env.SITE_PASSWORD || 'trader2024!'
    if (username !== validUsername || password !== validPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
  }

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
