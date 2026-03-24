import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const DEFAULT_USER_ID = 'default-user'

// Get all saved indicators
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('custom_indicators')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch indicators'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Save new indicator
export async function POST(request: Request) {
  try {
    const { name, description, pine_script, category } = await request.json()

    if (!name || !pine_script) {
      return NextResponse.json({ error: 'Name and Pine Script code are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('custom_indicators')
      .insert({
        user_id: DEFAULT_USER_ID,
        name,
        description: description || null,
        pine_script,
        category: category || 'custom',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save indicator'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Update indicator
export async function PUT(request: Request) {
  try {
    const { id, name, description, pine_script, category } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Indicator ID required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('custom_indicators')
      .update({
        name,
        description: description || null,
        pine_script,
        category: category || 'custom',
      })
      .eq('id', id)
      .eq('user_id', DEFAULT_USER_ID)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update indicator'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Delete indicator
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Indicator ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('custom_indicators')
      .delete()
      .eq('id', id)
      .eq('user_id', DEFAULT_USER_ID)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete indicator'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
