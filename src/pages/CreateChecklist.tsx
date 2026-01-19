import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Loader2, Upload } from 'lucide-react';

interface Department { id: string; name: string; }
interface TaskItem { id: string; title: string; description: string; }

export default function CreateChecklist() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([{ id: '1', title: '', description: '' }]);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
    if (!loading && user && !isAdmin) { navigate('/dashboard'); toast.error('Admin only'); }
  }, [user, loading, isAdmin, navigate]);

  useEffect(() => {
    supabase.from('departments').select('id, name').order('name').then(({ data }) => setDepartments(data || []));
  }, []);

  const addTask = () => setTasks([...tasks, { id: Date.now().toString(), title: '', description: '' }]);
  const removeTask = (id: string) => tasks.length > 1 && setTasks(tasks.filter(t => t.id !== id));
  const updateTask = (id: string, field: 'title' | 'description', value: string) => 
    setTasks(tasks.map(t => t.id === id ? { ...t, [field]: value } : t));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !departmentId) { toast.error('Title and department required'); return; }
    const validTasks = tasks.filter(t => t.title.trim());
    if (validTasks.length === 0) { toast.error('Add at least one task'); return; }

    setIsSubmitting(true);
    try {
      const { data: checklist, error } = await supabase.from('checklists')
        .insert({ title: title.trim(), description: description.trim() || null, department_id: departmentId, created_by: user?.id, file_type: 'manual' })
        .select().single();
      if (error) throw error;

      const items = validTasks.map((t, i) => ({ checklist_id: checklist.id, title: t.title.trim(), description: t.description.trim() || null, sort_order: i }));
      const { error: itemsError } = await supabase.from('checklist_items').insert(items);
      if (itemsError) throw itemsError;

      toast.success('Checklist created!');
      navigate('/checklists');
    } catch (error: any) { toast.error(error.message || 'Failed to create'); } 
    finally { setIsSubmitting(false); }
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/checklists')}><ArrowLeft className="w-5 h-5" /></Button>
          <div><h1 className="text-2xl font-bold">Create Checklist</h1><p className="text-muted-foreground">Add a new checklist for employees</p></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Opening Checklist" required /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Daily opening tasks..." rows={2} /></div>
              <div className="space-y-2"><Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent className="bg-popover">{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Tasks</CardTitle><CardDescription>Add tasks to complete</CardDescription></div><Button type="button" variant="outline" size="sm" onClick={addTask}><Plus className="w-4 h-4 mr-1" />Add</Button></CardHeader>
            <CardContent className="space-y-4">
              {tasks.map((task, i) => (
                <div key={task.id} className="flex gap-3 p-3 border rounded-lg">
                  <span className="text-muted-foreground font-medium mt-2">{i + 1}.</span>
                  <div className="flex-1 space-y-2">
                    <Input value={task.title} onChange={e => updateTask(task.id, 'title', e.target.value)} placeholder="Task title" />
                    <Input value={task.description} onChange={e => updateTask(task.id, 'description', e.target.value)} placeholder="Optional description" className="text-sm" />
                  </div>
                  {tasks.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeTask(task.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/checklists')} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 gradient-primary text-white">
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : 'Create Checklist'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
