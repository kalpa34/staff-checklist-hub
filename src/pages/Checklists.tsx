import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useRealtime, useNotificationSound } from '@/hooks/useRealtime';
import { toast } from 'sonner';
import {
  ClipboardList,
  Plus,
  Building2,
  Clock,
  CheckCircle2,
  ArrowRight,
  Filter,
} from 'lucide-react';

interface Checklist {
  id: string;
  title: string;
  description: string | null;
  department_id: string;
  department_name: string;
  file_url: string | null;
  file_type: string | null;
  is_active: boolean;
  created_at: string;
  total_items: number;
  completed_items: number;
}

interface Department {
  id: string;
  name: string;
}

export default function Checklists() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const { playSound } = useNotificationSound();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const fetchChecklists = async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('checklists')
        .select(`
          id,
          title,
          description,
          department_id,
          file_url,
          file_type,
          is_active,
          created_at,
          departments (name),
          checklist_items (id)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (selectedDepartment !== 'all') {
        query = query.eq('department_id', selectedDepartment);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get completion counts for each checklist
      const checklistsWithProgress = await Promise.all(
        (data || []).map(async (cl: any) => {
          const { count } = await supabase
            .from('task_completions')
            .select('*', { count: 'exact', head: true })
            .eq('checklist_id', cl.id)
            .eq('user_id', user.id);

          return {
            id: cl.id,
            title: cl.title,
            description: cl.description,
            department_id: cl.department_id,
            department_name: cl.departments?.name || 'Unknown',
            file_url: cl.file_url,
            file_type: cl.file_type,
            is_active: cl.is_active,
            created_at: cl.created_at,
            total_items: cl.checklist_items?.length || 0,
            completed_items: count || 0,
          };
        })
      );

      setChecklists(checklistsWithProgress);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching checklists:', error);
      toast.error('Failed to load checklists');
      setIsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .order('name');
    setDepartments(data || []);
  };

  useEffect(() => {
    if (user) {
      fetchDepartments();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchChecklists();
    }
  }, [user, selectedDepartment]);

  // Real-time updates
  useRealtime({
    table: 'checklists',
    onInsert: (payload) => {
      playSound();
      toast.info('New checklist available!', {
        description: payload.new.title,
      });
      fetchChecklists();
    },
    onUpdate: (payload) => {
      playSound();
      toast.info('Checklist updated!');
      fetchChecklists();
    },
    onDelete: () => {
      fetchChecklists();
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

  const completedChecklists = checklists.filter(
    (c) => c.total_items > 0 && c.completed_items === c.total_items
  );
  const pendingChecklists = checklists.filter(
    (c) => c.total_items === 0 || c.completed_items < c.total_items
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Checklists</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? 'Manage and create checklists' : 'Complete your daily tasks'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button
                onClick={() => navigate('/checklists/new')}
                className="gradient-primary text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-500/10">
                <Clock className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingChecklists.length}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/10">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedChecklists.length}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Checklists */}
        {checklists.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No checklists yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                {isAdmin
                  ? 'Create your first checklist to get started'
                  : 'No checklists have been assigned yet'}
              </p>
              {isAdmin && (
                <Button
                  onClick={() => navigate('/checklists/new')}
                  className="gradient-primary text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Checklist
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {checklists.map((checklist) => {
              const progress =
                checklist.total_items > 0
                  ? (checklist.completed_items / checklist.total_items) * 100
                  : 0;
              const isComplete = progress === 100;

              return (
                <Card
                  key={checklist.id}
                  className="hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => navigate(`/checklists/${checklist.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">
                          {checklist.title}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Building2 className="w-3 h-3" />
                          {checklist.department_name}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={isComplete ? 'default' : 'secondary'}
                        className={isComplete ? 'bg-green-500' : ''}
                      >
                        {isComplete ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Done
                          </>
                        ) : (
                          `${checklist.completed_items}/${checklist.total_items}`
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {checklist.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {checklist.description}
                      </p>
                    )}
                    <Progress value={progress} className="h-2 mb-3" />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {checklist.total_items} task{checklist.total_items !== 1 ? 's' : ''}
                      </span>
                      <span className="text-primary flex items-center group-hover:translate-x-1 transition-transform">
                        View
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
