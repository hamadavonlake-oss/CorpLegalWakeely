'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { api, ApiError } from '@/lib/api-client';

export default function ProfilePage() {
  const locale = useLocale();
  const { user, fetchUser } = useAuthStore();

  const [enrolling, setEnrolling] = useState(false);
  const [mfaSecret, setMfaSecret] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disabling, setDisabling] = useState(false);

  const handleEnroll = async () => {
    setEnrollError(''); setEnrolling(true);
    try {
      const result = await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/enroll', {});
      setMfaSecret(result.secret);
      setQrUrl(result.otpauthUrl);
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : 'Failed to enroll MFA');
    } finally { setEnrolling(false); }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault(); setEnrollError(''); setVerifying(true);
    try {
      await api.post('/auth/mfa/verify', { code: verifyCode });
      await fetchUser();
      setEnrolling(false);
      setMfaSecret(''); setQrUrl(''); setVerifyCode('');
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : 'Invalid code');
    } finally { setVerifying(false); }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault(); setDisableError(''); setDisabling(true);
    try {
      await api.post('/auth/mfa/disable', { code: disableCode });
      await fetchUser();
      setDisableOpen(false);
      setDisableCode('');
    } catch (err) {
      setDisableError(err instanceof ApiError ? err.message : 'Invalid code');
    } finally { setDisabling(false); }
  };

  if (!user) return <p>Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{locale === 'ar' ? 'الملف الشخصي' : 'Profile'}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {locale === 'ar' ? 'إدارة معلومات الحساب وإعدادات الأمان' : 'Manage your account info and security settings'}
        </p>
      </div>

      {/* Account info */}
      <Card>
        <CardHeader><CardTitle className="text-base">{locale === 'ar' ? 'معلومات الحساب' : 'Account Info'}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--muted-foreground)]">{locale === 'ar' ? 'الاسم' : 'Name'}: </span>
            <span className="font-medium">{user.displayName || `${user.firstName || ''} ${user.lastName || ''}`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted-foreground)]">Email: </span>
            <span>{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted-foreground)]">{locale === 'ar' ? 'الأدوار' : 'Roles'}: </span>
            <div className="flex gap-1">
              {user.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MFA section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === 'ar' ? 'التحقق الثنائي (MFA)' : 'Multi-Factor Authentication (MFA)'}
          </CardTitle>
          <CardDescription>
            {locale === 'ar'
              ? 'أضف طبقة أمان إضافية لحسابك باستخدام تطبيق مصادقة'
              : 'Add an extra layer of security to your account using an authenticator app'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {locale === 'ar' ? 'حالة MFA' : 'MFA Status'}
              </p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {user.mfaEnabled
                  ? (locale === 'ar' ? 'مفعّل ✓' : 'Enabled ✓')
                  : (locale === 'ar' ? 'غير مفعّل' : 'Not enabled')}
              </p>
            </div>
            {user.mfaEnabled ? (
              <Badge variant="success">Enabled</Badge>
            ) : (
              <Badge variant="warning">Off</Badge>
            )}
          </div>

          {/* Enable MFA flow */}
          {!user.mfaEnabled && !enrolling && (
            <Button onClick={handleEnroll} loading={enrolling}>
              {locale === 'ar' ? 'تفعيل MFA' : 'Enable MFA'}
            </Button>
          )}

          {enrolling && (
            <div className="space-y-4 rounded border border-[var(--border)] p-4">
              <p className="text-sm font-medium">
                {locale === 'ar' ? '1. امسح رمز QR بتطبيق المصادقة' : '1. Scan this QR code with your authenticator app'}
              </p>
              {/* QR code — we use a public QR code generator API since we can't add a QR library easily */}
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                  alt="MFA QR Code"
                  className="rounded border border-[var(--border)]"
                  width={200}
                  height={200}
                />
              </div>
              <p className="text-center text-xs text-[var(--muted-foreground)]">
                {locale === 'ar' ? 'أو أدخل المفتاح يدوياً:' : 'Or enter this key manually:'}
              </p>
              <div className="rounded bg-[var(--muted)] p-2 text-center font-mono text-xs break-all">
                {mfaSecret}
              </div>

              <form onSubmit={handleVerify} className="space-y-3">
                <p className="text-sm font-medium">
                  {locale === 'ar' ? '2. أدخل الرمز من 6 أرقام' : '2. Enter the 6-digit code'}
                </p>
                <Field label={locale === 'ar' ? 'رمز التحقق' : 'Verification Code'}>
                  <Input
                    type="text"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    required
                    maxLength={6}
                    pattern="[0-9]{6}"
                    placeholder="123456"
                    autoComplete="one-time-code"
                  />
                </Field>
                {enrollError && <p className="text-sm text-[var(--destructive)]">{enrollError}</p>}
                <div className="flex gap-2">
                  <Button type="submit" loading={verifying}>{locale === 'ar' ? 'تأكيد' : 'Verify & Enable'}</Button>
                  <Button type="button" variant="outline" onClick={() => { setEnrolling(false); setMfaSecret(''); setQrUrl(''); setVerifyCode(''); }}>
                    {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Disable MFA flow */}
          {user.mfaEnabled && !disableOpen && (
            <Button variant="outline" onClick={() => setDisableOpen(true)}>
              {locale === 'ar' ? 'تعطيل MFA' : 'Disable MFA'}
            </Button>
          )}

          {disableOpen && (
            <form onSubmit={handleDisable} className="space-y-3 rounded border border-[var(--border)] p-4">
              <p className="text-sm font-medium">
                {locale === 'ar' ? 'أدخل رمز التحقق لتأكيد التعطيل' : 'Enter your verification code to confirm disabling'}
              </p>
              <Field label={locale === 'ar' ? 'رمز التحقق' : 'Verification Code'}>
                <Input
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="123456"
                  autoComplete="one-time-code"
                />
              </Field>
              {disableError && <p className="text-sm text-[var(--destructive)]">{disableError}</p>}
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" loading={disabling}>
                  {locale === 'ar' ? 'تعطيل' : 'Disable'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setDisableOpen(false); setDisableCode(''); setDisableError(''); }}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
