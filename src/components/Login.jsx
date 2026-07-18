import SignInButton from './SignInButton.jsx'
import EmailPasswordForm from './EmailPasswordForm.jsx'

// Full-page sign-in shown when there's no session. Matches the app's serif,
// white/gray aesthetic.
export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm text-center">
        <div className="flex items-baseline justify-center gap-1 mb-3">
          <span className="font-serif text-4xl font-medium tracking-tight" style={{ color: 'var(--ink)' }}>Theses</span>
          <span className="font-serif text-4xl" style={{ color: 'var(--bear)' }}>.</span>
        </div>
        <p className="text-sm mb-1" style={{ color: 'var(--ink-soft)' }}>
          Publish what you believe. Track what happens.
        </p>
        <p className="text-[13px] mb-8" style={{ color: 'var(--muted)' }}>
          Sign in to write and track your investment theses.
        </p>
        <EmailPasswordForm />

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--faint)' }}>or</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        <div className="flex justify-center">
          <SignInButton />
        </div>
        <p className="text-[11px] font-mono mt-8" style={{ color: 'var(--faint)' }}>
          Integrity-protected · timestamps are system-generated
        </p>
      </div>
    </div>
  )
}
