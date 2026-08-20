'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgNameEn, setOrgNameEn] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await register({ email, password, firstName, lastName, organizationName: orgName, organizationNameEn: orgNameEn || undefined, slug });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Create Account</CardTitle>
          <CardDescription>Register your organization and create your first admin user</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <h3 className="mb-4 text-sm font-semibold text-[var(--muted-foreground)]">Organization</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Organization Name (Arabic)">
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="شركة النور القانونية" />
              </Field>
              <Field label="Organization Name (English)">
                <Input value={orgNameEn} onChange={(e) => setOrgNameEn(e.target.value)} placeholder="Al-Noor Legal Co." />
              </Field>
            </div>
            <Field label="URL Slug">
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} required placeholder="al-noor-legal" pattern="[a-z0-9-]+" />
            </Field>
            <h3 className="mb-4 mt-6 text-sm font-semibold text-[var(--muted-foreground)]">Admin User</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="First Name"><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></Field>
              <Field label="Last Name"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} required /></Field>
            </div>
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@example.com" autoComplete="email" /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></Field>
            {error && <p className="mb-4 text-sm text-[var(--destructive)]">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>Create Account</Button>
            <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
              Already have an account? <a href="/en/login" className="text-[var(--primary)] hover:underline">Sign in</a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
