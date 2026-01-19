import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell } from 'lucide-react';

export default function Notifications() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => { if (!loading && !user) navigate('/auth'); }, [user, loading, navigate]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Notifications</h1><p className="text-muted-foreground">Stay updated on checklist changes</p></div>
        <Card><CardContent className="flex flex-col items-center py-12">
          <Bell className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No notifications</h3>
          <p className="text-muted-foreground">You'll be notified when checklists are updated</p>
        </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
