'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const verifyMfa = useAuthStore((s) => s.verifyMfa);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await login(email, password);
      if (result.requiresMfa) setRequiresMfa(true);
      else router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally { setLoading(false); }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await verifyMfa(email, mfaCode);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid MFA code');
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{requiresMfa ? 'Enter Verification Code' : 'Sign In'}</CardTitle>
          <CardDescription>
            {requiresMfa ? 'Enter the 6-digit code from your authenticator app' : 'Enter your credentials to access the legal operations platform'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!requiresMfa ? (
            <form onSubmit={handleSubmit}>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email" />
              </Field>
              <Field label="Password">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </Field>
              {error && <p className="mb-4 text-sm text-[var(--destructive)]">{error}</p>}
              <Button type="submit" className="w-full" loading={loading}>Sign In</Button>
              <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
                Don&apos;t have an account? <a href="/register" className="text-[var(--primary)] hover:underline">Register</a>
              </p>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit}>
              <Field label="Verification Code">
                <Input type="text" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required placeholder="123456" maxLength={6} pattern="[0-9]{6}" autoComplete="one-time-code" />
              </Field>
              {error && <p className="mb-4 text-sm text-[var(--destructive)]">{error}</p>}
              <Button type="submit" className="w-full" loading={loading}>Verify</Button>
              <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => { setRequiresMfa(false); setMfaCode(''); setError(''); }}>Back</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
