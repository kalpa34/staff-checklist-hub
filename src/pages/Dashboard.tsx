import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useRealtime, useNotificationSound } from '@/hooks/useRealtime';
import {
  Building2,
  ClipboardList,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Bell,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

interface DashboardStats {
  totalDepartments: number;
  totalChecklists: number;
  totalEmployees: number;
  completedTasks: number;
  pendingTasks: number;
}

interface RecentChecklist {
  id: string;
  title: string;
  department_name: string;
  total_items: number;
  completed_items: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalDepartments: 0,
    totalChecklists: 0,
    totalEmployees: 0,
    completedTasks: 0,
    pendingTasks: 0,
  });
  const [recentChecklists, setRecentChecklists] = useState<RecentChecklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { playSound } = useNotificationSound();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const fetchDashboardData = async () => {
    if (!user) return;

    try {
      // Fetch departments count
      const { count: deptCount } = await supabase
        .from('departments')
        .select('*', { count: 'exact', head: true });

      // Fetch active checklists count
      const { count: checklistCount } = await supabase
        .from('checklists')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // For admin: fetch employee count
      let employeeCount = 0;
      if (isAdmin) {
        const { count } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'employee');
        employeeCount = count || 0;
      }

      // Fetch task completion stats
      const { count: completedCount } = await supabase
        .from('task_completions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setStats({
        totalDepartments: deptCount || 0,
        totalChecklists: checklistCount || 0,
        totalEmployees: employeeCount,
        completedTasks: completedCount || 0,
        pendingTasks: 0, // Will be calculated from checklists
      });

      // Fetch recent checklists with progress
      const { data: checklists } = await supabase
        .from('checklists')
        .select(`
          id,
          title,
          departments (name),
          checklist_items (id)
        `)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (checklists) {
        const checklistsWithProgress = await Promise.all(
          checklists.map(async (cl: any) => {
            const { count } = await supabase
              .from('task_completions')
              .select('*', { count: 'exact', head: true })
              .eq('checklist_id', cl.id)
              .eq('user_id', user.id);

            return {
              id: cl.id,
              title: cl.title,
              department_name: cl.departments?.name || 'Unknown',
              total_items: cl.checklist_items?.length || 0,
              completed_items: count || 0,
            };
          })
        );
        setRecentChecklists(checklistsWithProgress);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && !loading) {
      fetchDashboardData();
    }
  }, [user, loading, isAdmin]);

  // Real-time updates for checklists
  useRealtime({
    table: 'checklists',
    onInsert: (payload) => {
      playSound();
      toast.info('New checklist available!', {
        description: payload.new.title,
      });
      fetchDashboardData();
    },
    onUpdate: (payload) => {
      playSound();
      toast.info('Checklist updated!', {
        description: payload.new.title,
      });
      fetchDashboardData();
    },
  });

  // Real-time updates for notifications
  useRealtime({
    table: 'notifications',
    filter: user ? `user_id=eq.${user.id}` : undefined,
    onInsert: (payload) => {
      playSound();
      toast(payload.new.title, {
        description: payload.new.message,
      });
    },
  });

  if (loading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const adminStats = [
    { label: 'Departments', value: stats.totalDepartments, icon: Building2, color: 'text-blue-500' },
    { label: 'Active Checklists', value: stats.totalChecklists, icon: ClipboardList, color: 'text-green-500' },
    { label: 'Employees', value: stats.totalEmployees, icon: Users, color: 'text-purple-500' },
    { label: 'Tasks Completed', value: stats.completedTasks, icon: CheckCircle2, color: 'text-amber-500' },
  ];

  const employeeStats = [
    { label: 'Active Checklists', value: stats.totalChecklists, icon: ClipboardList, color: 'text-green-500' },
    { label: 'Completed Tasks', value: stats.completedTasks, icon: CheckCircle2, color: 'text-amber-500' },
    { label: 'Departments', value: stats.totalDepartments, icon: Building2, color: 'text-blue-500' },
  ];

  const displayStats = isAdmin ? adminStats : employeeStats;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              {isAdmin ? 'Admin Dashboard' : 'My Dashboard'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? 'Manage your restaurant operations efficiently'
                : 'Track your daily tasks and checklists'}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => navigate('/checklists')} className="gradient-primary text-white">
              <ClipboardList className="w-4 h-4 mr-2" />
              Create Checklist
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {displayStats.map((stat) => (
            <Card key={stat.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl lg:text-3xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Checklists */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Recent Checklists</CardTitle>
              <CardDescription>Your latest assigned tasks</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/checklists')}>
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentChecklists.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No checklists available yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentChecklists.map((checklist) => {
                  const progress = checklist.total_items > 0
                    ? (checklist.completed_items / checklist.total_items) * 100
                    : 0;
                  const isComplete = progress === 100;

                  return (
                    <div
                      key={checklist.id}
                      className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/checklists/${checklist.id}`)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{checklist.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            {checklist.department_name}
                          </p>
                        </div>
                        <Badge
                          variant={isComplete ? 'default' : 'secondary'}
                          className={isComplete ? 'bg-green-500' : ''}
                        >
                          {isComplete ? 'Complete' : `${checklist.completed_items}/${checklist.total_items}`}
                        </Badge>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions for Admin */}
        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-dashed"
              onClick={() => navigate('/departments')}
            >
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10">
                  <Building2 className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h4 className="font-medium">Manage Departments</h4>
                  <p className="text-sm text-muted-foreground">Add or edit departments</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-dashed"
              onClick={() => navigate('/employees')}
            >
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10">
                  <Users className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <h4 className="font-medium">Manage Employees</h4>
                  <p className="text-sm text-muted-foreground">Assign roles and tasks</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-dashed"
              onClick={() => navigate('/reports')}
            >
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-green-500/10">
                  <TrendingUp className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <h4 className="font-medium">View Reports</h4>
                  <p className="text-sm text-muted-foreground">Track completion rates</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
