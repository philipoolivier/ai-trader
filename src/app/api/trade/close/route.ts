import { NextResponse } from 'next/server'

// Close from portfolio → MT4 is disabled until properly fixed
// Close trades from MT4 directly for now
export async function POST() {
  return NextResponse.json({
    error: 'Close from portfolio is temporarily disabled. Please close trades directly in MT4.',
  }, { status: 400 })
}
