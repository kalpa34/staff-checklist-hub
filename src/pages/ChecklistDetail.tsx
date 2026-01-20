import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useRealtime, useNotificationSound } from '@/hooks/useRealtime';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Image as ImageIcon,
  FileSpreadsheet,
  Loader2,
  Pencil,
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  completed: boolean;
}

interface ChecklistDetail {
  id: string;
  title: string;
  description: string | null;
  department_name: string;
  file_url: string | null;
  file_type: string | null;
  items: ChecklistItem[];
}

export default function ChecklistDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, loading } = useAuth();
  const [checklist, setChecklist] = useState<ChecklistDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const { playSound } = useNotificationSound();
  const allCompletedNotified = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const fetchChecklist = async () => {
    if (!id || !user) return;

    try {
      const { data: checklistData, error: checklistError } = await supabase
        .from('checklists')
        .select(`
          id,
          title,
          description,
          file_url,
          file_type,
          departments (name)
        `)
        .eq('id', id)
        .maybeSingle();

      if (checklistError) throw checklistError;
      if (!checklistData) {
        toast.error('Checklist not found');
        navigate('/checklists');
        return;
      }

      // Fetch items
      const { data: items, error: itemsError } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', id)
        .order('sort_order');

      if (itemsError) throw itemsError;

      // Fetch completions
      const { data: completions } = await supabase
        .from('task_completions')
        .select('checklist_item_id')
        .eq('checklist_id', id)
        .eq('user_id', user.id);

      const completedIds = new Set(completions?.map((c) => c.checklist_item_id) || []);

      const checklistItems: ChecklistItem[] = (items || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        sort_order: item.sort_order,
        completed: completedIds.has(item.id),
      }));

      setChecklist({
        id: checklistData.id,
        title: checklistData.title,
        description: checklistData.description,
        department_name: (checklistData.departments as any)?.name || 'Unknown',
        file_url: checklistData.file_url,
        file_type: checklistData.file_type,
        items: checklistItems,
      });

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching checklist:', error);
      toast.error('Failed to load checklist');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && id) {
      fetchChecklist();
    }
  }, [user, id]);

  // Real-time updates for items
  useRealtime({
    table: 'checklist_items',
    filter: id ? `checklist_id=eq.${id}` : undefined,
    onChange: () => {
      playSound();
      fetchChecklist();
    },
  });

  const handleToggleComplete = async (item: ChecklistItem) => {
    if (!user || !checklist) return;

    setCompleting(item.id);

    try {
      if (item.completed) {
        // Remove completion
        const { error } = await supabase
          .from('task_completions')
          .delete()
          .eq('checklist_item_id', item.id)
          .eq('user_id', user.id)
          .eq('checklist_id', checklist.id);

        if (error) throw error;
      } else {
        // Add completion
        const { error } = await supabase
          .from('task_completions')
          .insert({
            checklist_item_id: item.id,
            user_id: user.id,
            checklist_id: checklist.id,
          });

        if (error) throw error;
      }

      // Update local state
      const updatedItems = checklist.items.map((i) =>
        i.id === item.id ? { ...i, completed: !i.completed } : i
      );
      setChecklist({ ...checklist, items: updatedItems });

      // Check if all items are now completed
      const allCompleted = updatedItems.every((i) => i.completed);
      if (allCompleted && !allCompletedNotified.current && updatedItems.length > 0) {
        allCompletedNotified.current = true;
        playSound();
        toast.success('🎉 Checklist completed!', {
          description: 'Great job completing all tasks!',
        });

        // Get current user's profile for the notification
        const { data: employeeProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .maybeSingle();

        const employeeName = employeeProfile?.full_name || user.email || 'Employee';

        // Create notification for admins
        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        if (admins && admins.length > 0) {
          const notifications = admins.map((admin) => ({
            user_id: admin.user_id,
            title: 'Checklist Completed',
            message: `${employeeName} in "${checklist.department_name}" has completed the checklist "${checklist.title}"`,
            type: 'all_tasks_complete' as const,
            related_checklist_id: checklist.id,
          }));

          await supabase.from('notifications').insert(notifications);

          // Send SMS notification via NotificationAPI to admins
          const { data: adminProfiles } = await supabase
            .from('profiles')
            .select('user_id, email, phone')
            .in('user_id', admins.map(a => a.user_id));

          if (adminProfiles) {
            for (const profile of adminProfiles) {
              if (profile.phone) {
                try {
                  await supabase.functions.invoke('send-notification', {
                    body: {
                      userId: profile.user_id,
                      userEmail: profile.email,
                      userPhone: profile.phone,
                      employeeName: employeeName,
                      departmentName: checklist.department_name,
                      checklistTitle: checklist.title,
                      notificationType: 'checklist_completed'
                    }
                  });
                  console.log(`SMS sent to admin ${profile.email}`);
                } catch (err) {
                  console.error('Failed to send notification:', err);
                }
              }
            }
          }
        }
      } else if (!allCompleted) {
        allCompletedNotified.current = false;
      }
    } catch (error) {
      console.error('Error toggling completion:', error);
      toast.error('Failed to update task');
    } finally {
      setCompleting(null);
    }
  };

  if (loading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!checklist) {
    return null;
  }

  const completedCount = checklist.items.filter((i) => i.completed).length;
  const totalCount = checklist.items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isComplete = progress === 100 && totalCount > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/checklists')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                  {checklist.title}
                </h1>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  <span>{checklist.department_name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/checklists/${id}/edit`)}>
                    <Pencil className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                )}
                <Badge
                  variant={isComplete ? 'default' : 'secondary'}
                  className={cn('text-sm px-3 py-1', isComplete && 'bg-green-500')}
                >
                  {isComplete ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Completed
                    </>
                  ) : (
                    `${completedCount}/${totalCount} tasks`
                  )}
                </Badge>
              </div>
            </div>
            {checklist.description && (
              <p className="text-muted-foreground mt-2">{checklist.description}</p>
            )}
          </div>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </CardContent>
        </Card>

        {/* Attached File */}
        {checklist.file_url && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                {checklist.file_type === 'image' ? (
                  <ImageIcon className="w-5 h-5" />
                ) : (
                  <FileSpreadsheet className="w-5 h-5" />
                )}
                Attached File
              </CardTitle>
            </CardHeader>
            <CardContent>
              {checklist.file_type === 'image' ? (
                <img
                  src={checklist.file_url}
                  alt="Checklist reference"
                  className="max-w-full rounded-lg border border-border"
                />
              ) : (
                <Button variant="outline" asChild>
                  <a href={checklist.file_url} target="_blank" rel="noopener noreferrer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Download File
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Checklist Items */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>
              Check off tasks as you complete them
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checklist.items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No tasks in this checklist yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {checklist.items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-lg border transition-all duration-200',
                      item.completed
                        ? 'bg-green-500/5 border-green-500/20'
                        : 'bg-card border-border hover:border-primary/50'
                    )}
                  >
                    <div className="relative">
                      {completing === item.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      ) : (
                        <Checkbox
                          checked={item.completed}
                          onCheckedChange={() => handleToggleComplete(item)}
                          className="mt-0.5"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'font-medium transition-all',
                          item.completed && 'line-through text-muted-foreground'
                        )}
                      >
                        {item.title}
                      </p>
                      {item.description && (
                        <p
                          className={cn(
                            'text-sm text-muted-foreground mt-1',
                            item.completed && 'line-through opacity-50'
                          )}
                        >
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.completed && (
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
