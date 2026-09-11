// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { getPortalBanner } from '@/lib/portalBanner';
import { PortalBanner } from '@/components/portal/PortalBanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function tt(language: string, en: string, mm: string) {
  return language === 'mm' ? mm : en;
}
function fmtDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default function SettingsPortal() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>({
    language_code: 'en',
    email_notifications: true,
    sms_notifications: true,
    push_notifications: true,
    theme: 'system',
    metadata: {},
  });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [ackRows, setAckRows] = useState<any[]>([]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();

      const [settingRes, noteRes, ackRes] = await Promise.all([
        supabase.from('app_user_settings').select('*').eq('auth_user_id', auth.user?.id || '').maybeSingle(),
        supabase.from('ops_notifications').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('workflow_acknowledgements').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      if (settingRes.error) throw settingRes.error;
      if (noteRes.error) throw noteRes.error;
      if (ackRes.error) throw ackRes.error;

      if (settingRes.data) {
        setSettings(settingRes.data);
      } else {
        setSettings({
          language_code: language === 'mm' ? 'mm' : 'en',
          email_notifications: true,
          sms_notifications: true,
          push_notifications: true,
          theme: 'system',
          metadata: {},
        });
      }

      setNotifications(noteRes.data || []);
      setAckRows(ackRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function saveSettings() {
    const { data: auth } = await supabase.auth.getUser();

    const { error } = await supabase.from('app_user_settings').upsert({
      auth_user_id: auth.user?.id,
      language_code: settings.language_code,
      email_notifications: !!settings.email_notifications,
      sms_notifications: !!settings.sms_notifications,
      push_notifications: !!settings.push_notifications,
      theme: settings.theme,
      metadata: settings.metadata || {},
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    await loadData();
  }

  const unreadCount = useMemo(() => notifications.filter((r: any) => !r.is_read).length, [notifications]);
  const pendingAck = useMemo(() => ackRows.filter((r: any) => r.status === 'pending').length, [ackRows]);

  return (
    <div className="space-y-6">
      <PortalBanner
        image={getPortalBanner('settings')}
        title={tt(language, 'Settings', 'Settings')}
        subtitle={tt(language, 'Preferences, reminders, and workflow visibility.', 'preference, reminder နှင့် workflow visibility')}
      >
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {tt(language, 'Refresh', 'ပြန်လည်ရယူမည်')}
        </Button>
      </PortalBanner>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Unread Notifications', 'မဖတ်ရသေးသော Notification')}</div><div className="mt-2 text-4xl font-semibold">{unreadCount}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Pending Workflow ACK', 'Pending Workflow ACK')}</div><div className="mt-2 text-4xl font-semibold">{pendingAck}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Language', 'ဘာသာစကား')}</div><div className="mt-2 text-4xl font-semibold">{settings.language_code?.toUpperCase?.() || 'EN'}</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="text-sm text-muted-foreground">{tt(language, 'Theme', 'Theme')}</div><div className="mt-2 text-4xl font-semibold">{String(settings.theme || 'system')}</div></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'User Preferences', 'User Preferences')}</CardTitle>
            <CardDescription>{tt(language, 'Persisted in app_user_settings.', 'app_user_settings တွင် သိမ်းဆည်းမည်')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <select className="h-10 w-full rounded-md border px-3 text-sm" value={settings.language_code} onChange={(e) => setSettings({ ...settings, language_code: e.target.value })}>
              <option value="en">English</option>
              <option value="mm">Myanmar</option>
            </select>

            <select className="h-10 w-full rounded-md border px-3 text-sm" value={settings.theme} onChange={(e) => setSettings({ ...settings, theme: e.target.value })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>

            <label className="flex items-center gap-3">
              <input type="checkbox" checked={!!settings.email_notifications} onChange={(e) => setSettings({ ...settings, email_notifications: e.target.checked })} />
              <span>{tt(language, 'Email Notifications', 'Email Notification')}</span>
            </label>

            <label className="flex items-center gap-3">
              <input type="checkbox" checked={!!settings.sms_notifications} onChange={(e) => setSettings({ ...settings, sms_notifications: e.target.checked })} />
              <span>{tt(language, 'SMS Notifications', 'SMS Notification')}</span>
            </label>

            <label className="flex items-center gap-3">
              <input type="checkbox" checked={!!settings.push_notifications} onChange={(e) => setSettings({ ...settings, push_notifications: e.target.checked })} />
              <span>{tt(language, 'Push Notifications', 'Push Notification')}</span>
            </label>

            <Button onClick={saveSettings}>
              <Save className="mr-2 h-4 w-4" />
              {tt(language, 'Save Settings', 'Settings သိမ်းမည်')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tt(language, 'Recent Notifications', 'Recent Notifications')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-4">
                <div className="font-semibold">{language === 'mm' ? row.title_mm : row.title_en}</div>
                <div className="text-sm text-muted-foreground">{language === 'mm' ? row.body_mm : row.body_en}</div>
                <div className="text-xs text-muted-foreground mt-1">{fmtDate(row.created_at)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
