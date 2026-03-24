import Link from 'next/link'
import {
  TrendingUp,
  BarChart3,
  Briefcase,
  Shield,
  Zap,
  Target,
} from 'lucide-react'

const features = [
  {
    icon: TrendingUp,
    title: 'Paper Trading',
    description: 'Practice trading with $500 virtual cash using real-time market data. No risk, all the learning.',
  },
  {
    icon: Briefcase,
    title: 'Portfolio Tracking',
    description: 'Track your positions, P&L, and overall portfolio performance with detailed analytics.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Charts',
    description: 'Professional candlestick charts with multiple timeframes powered by TradingView technology.',
  },
  {
    icon: Target,
    title: 'Trade Journal',
    description: 'Log every trade with notes. Review your wins and losses to improve your strategy.',
  },
  {
    icon: Zap,
    title: 'Instant Execution',
    description: 'Place trades instantly with market orders. See your portfolio update in real-time.',
  },
  {
    icon: Shield,
    title: 'Risk-Free Learning',
    description: 'Learn to trade without risking real money. Reset your portfolio anytime to start fresh.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-950/50 via-surface-0 to-surface-0" />
        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <span className="text-xl font-bold text-text-primary">AI Trader</span>
            </div>
            <Link
              href="/login"
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </nav>

          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-block px-4 py-1.5 bg-brand-600/10 text-brand-400 text-sm font-medium rounded-full mb-6">
              Paper Trading Platform
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-text-primary mb-6 leading-tight">
              Trade Smarter,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-brand-600">
                Risk Nothing
              </span>
            </h1>
            <p className="text-lg text-text-secondary mb-10 max-w-2xl mx-auto">
              Practice trading with real market data and $500 in virtual cash.
              Track your portfolio, analyze your trades, and build confidence before risking real money.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors text-base"
              >
                Start Trading
              </Link>
              <Link
                href="#features"
                className="px-8 py-3.5 bg-surface-2 hover:bg-surface-3 text-text-primary font-medium rounded-lg transition-colors text-base border border-surface-4"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-text-primary mb-4">Everything you need to learn trading</h2>
          <p className="text-text-secondary max-w-xl mx-auto">
            Professional-grade tools without the price tag. Perfect for beginners and experienced traders alike.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-surface-1 rounded-xl border border-surface-3 p-6 hover:border-surface-4 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-600/10 flex items-center justify-center mb-4">
                <feature.icon className="text-brand-400" size={20} />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">{feature.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="bg-gradient-to-r from-brand-950 to-surface-1 rounded-2xl border border-surface-3 p-12 text-center">
          <h2 className="text-3xl font-bold text-text-primary mb-4">Ready to start trading?</h2>
          <p className="text-text-secondary mb-8 max-w-lg mx-auto">
            Get started with $500 in virtual cash. No credit card required.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors"
          >
            Launch Dashboard
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-surface-3 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-text-muted text-sm">
          AI Trader - Paper Trading Platform. Not financial advice. All trades are simulated.
        </div>
      </footer>
    </div>
  )
}
