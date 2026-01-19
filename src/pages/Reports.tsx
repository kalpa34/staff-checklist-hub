import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function Reports() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();

  useEffect(() => { 
    if (!loading && !user) navigate('/auth'); 
    if (!loading && user && !isAdmin) navigate('/dashboard');
  }, [user, loading, isAdmin, navigate]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Reports</h1><p className="text-muted-foreground">View task completion analytics</p></div>
        <Card><CardContent className="flex flex-col items-center py-12">
          <BarChart3 className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Reports coming soon</h3>
          <p className="text-muted-foreground">Track completion rates and employee performance</p>
        </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
