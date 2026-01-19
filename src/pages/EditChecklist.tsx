import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Loader2, Upload, Image as ImageIcon, X, GripVertical, Save } from 'lucide-react';

interface Department { id: string; name: string; }
interface TaskItem { id: string; title: string; description: string; isNew?: boolean; }

export default function EditChecklist() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, loading } = useAuth();
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [deletedTaskIds, setDeletedTaskIds] = useState<string[]>([]);
  
  // File states
  const [currentFileUrl, setCurrentFileUrl] = useState<string | null>(null);
  const [currentFileType, setCurrentFileType] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeCurrentFile, setRemoveCurrentFile] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
    if (!loading && user && !isAdmin) { navigate('/dashboard'); toast.error('Admin only'); }
  }, [user, loading, isAdmin, navigate]);

  useEffect(() => {
    supabase.from('departments').select('id, name').order('name').then(({ data }) => setDepartments(data || []));
  }, []);

  useEffect(() => {
    const fetchChecklist = async () => {
      if (!id) return;

      try {
        // Fetch checklist
        const { data: checklist, error: checklistError } = await supabase
          .from('checklists')
          .select('*')
          .eq('id', id)
          .single();

        if (checklistError) throw checklistError;

        setTitle(checklist.title);
        setDescription(checklist.description || '');
        setDepartmentId(checklist.department_id);
        setCurrentFileUrl(checklist.file_url);
        setCurrentFileType(checklist.file_type);

        // Fetch tasks
        const { data: items, error: itemsError } = await supabase
          .from('checklist_items')
          .select('*')
          .eq('checklist_id', id)
          .order('sort_order');

        if (itemsError) throw itemsError;

        setTasks(items?.map(item => ({
          id: item.id,
          title: item.title,
          description: item.description || '',
        })) || []);

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching checklist:', error);
        toast.error('Failed to load checklist');
        navigate('/checklists');
      }
    };

    if (user && id) fetchChecklist();
  }, [user, id, navigate]);

  const addTask = () => setTasks([...tasks, { id: `new-${Date.now()}`, title: '', description: '', isNew: true }]);
  
  const removeTask = (taskId: string) => {
    if (tasks.length <= 1) {
      toast.error('Must have at least one task');
      return;
    }
    
    // If it's an existing task (not new), track it for deletion
    if (!taskId.startsWith('new-')) {
      setDeletedTaskIds([...deletedTaskIds, taskId]);
    }
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const updateTask = (id: string, field: 'title' | 'description', value: string) => 
    setTasks(tasks.map(t => t.id === id ? { ...t, [field]: value } : t));

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploadedImage(file);
    setRemoveCurrentFile(true);
    const reader = new FileReader();
    reader.onload = (event) => setImagePreview(event.target?.result as string);
    reader.readAsDataURL(file);
    toast.success('Image uploaded');
  };

  const clearNewImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    setRemoveCurrentFile(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleRemoveCurrentFile = () => {
    setRemoveCurrentFile(true);
    setCurrentFileUrl(null);
    setCurrentFileType(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !departmentId || !id) { toast.error('Title and department required'); return; }
    
    const validTasks = tasks.filter(t => t.title.trim());
    if (validTasks.length === 0) { toast.error('Add at least one task'); return; }

    setIsSubmitting(true);
    try {
      let fileUrl = removeCurrentFile ? null : currentFileUrl;
      let fileType = removeCurrentFile ? null : currentFileType;

      // Upload new image if present
      if (uploadedImage) {
        const fileExt = uploadedImage.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `checklists/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('checklist-files')
          .upload(filePath, uploadedImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('checklist-files')
          .getPublicUrl(filePath);

        fileUrl = publicUrl;
        fileType = 'image';
      }

      // Update checklist
      const { error: updateError } = await supabase
        .from('checklists')
        .update({ 
          title: title.trim(), 
          description: description.trim() || null, 
          department_id: departmentId,
          file_url: fileUrl,
          file_type: fileType,
        })
        .eq('id', id);

      if (updateError) throw updateError;

      // Delete removed tasks
      if (deletedTaskIds.length > 0) {
        // First delete any task completions for these tasks
        await supabase
          .from('task_completions')
          .delete()
          .in('checklist_item_id', deletedTaskIds);

        const { error: deleteError } = await supabase
          .from('checklist_items')
          .delete()
          .in('id', deletedTaskIds);

        if (deleteError) throw deleteError;
      }

      // Update existing tasks and insert new ones
      for (let i = 0; i < validTasks.length; i++) {
        const task = validTasks[i];
        
        if (task.isNew || task.id.startsWith('new-')) {
          // Insert new task
          const { error: insertError } = await supabase
            .from('checklist_items')
            .insert({
              checklist_id: id,
              title: task.title.trim(),
              description: task.description.trim() || null,
              sort_order: i,
            });

          if (insertError) throw insertError;
        } else {
          // Update existing task
          const { error: taskUpdateError } = await supabase
            .from('checklist_items')
            .update({
              title: task.title.trim(),
              description: task.description.trim() || null,
              sort_order: i,
            })
            .eq('id', task.id);

          if (taskUpdateError) throw taskUpdateError;
        }
      }

      toast.success('Checklist updated!');
      navigate('/checklists');
    } catch (error: any) { 
      console.error('Error updating checklist:', error);
      toast.error(error.message || 'Failed to update'); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    setIsDeleting(true);
    try {
      // Delete task completions first
      await supabase
        .from('task_completions')
        .delete()
        .eq('checklist_id', id);

      // Delete checklist items
      await supabase
        .from('checklist_items')
        .delete()
        .eq('checklist_id', id);

      // Delete notifications related to this checklist
      await supabase
        .from('notifications')
        .delete()
        .eq('related_checklist_id', id);

      // Delete the checklist
      const { error } = await supabase
        .from('checklists')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Checklist deleted');
      navigate('/checklists');
    } catch (error: any) {
      console.error('Error deleting checklist:', error);
      toast.error(error.message || 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/checklists')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Edit Checklist</h1>
              <p className="text-muted-foreground">Update checklist details and tasks</p>
            </div>
          </div>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Checklist?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the checklist, all its tasks, and completion records. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Details Card */}
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Opening Checklist" required />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Daily opening tasks..." rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Image Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Reference Image
              </CardTitle>
              <CardDescription>Optional visual reference for the checklist</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input type="file" ref={imageInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
              
              {/* Show current image if exists and not removed */}
              {currentFileUrl && currentFileType === 'image' && !removeCurrentFile && (
                <div className="relative">
                  <img src={currentFileUrl} alt="Current reference" className="w-full rounded-lg border border-border" />
                  <Button 
                    type="button" 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-2 right-2"
                    onClick={handleRemoveCurrentFile}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Show new image preview */}
              {imagePreview && (
                <div className="relative">
                  <img src={imagePreview} alt="New preview" className="w-full rounded-lg border border-border" />
                  <Button 
                    type="button" 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-2 right-2"
                    onClick={clearNewImage}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Upload button if no image shown */}
              {!currentFileUrl && !imagePreview && (
                <div 
                  onClick={() => imageInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                >
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">Click to upload image</p>
                  <p className="text-sm text-muted-foreground mt-1">JPG, PNG, or WebP (max 5MB)</p>
                </div>
              )}

              {/* Replace image button if current image exists */}
              {currentFileUrl && currentFileType === 'image' && !removeCurrentFile && !imagePreview && (
                <Button type="button" variant="outline" onClick={() => imageInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Replace Image
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Tasks Card */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Tasks</CardTitle>
                <CardDescription>Edit checklist tasks</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addTask}>
                <Plus className="w-4 h-4 mr-1" />Add Task
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {tasks.map((task, i) => (
                <div key={task.id} className="flex gap-3 p-3 border rounded-lg">
                  <GripVertical className="w-5 h-5 text-muted-foreground mt-2 shrink-0" />
                  <span className="text-muted-foreground font-medium mt-2">{i + 1}.</span>
                  <div className="flex-1 space-y-2">
                    <Input 
                      value={task.title} 
                      onChange={e => updateTask(task.id, 'title', e.target.value)} 
                      placeholder="Task title" 
                    />
                    <Input 
                      value={task.description} 
                      onChange={e => updateTask(task.id, 'description', e.target.value)} 
                      placeholder="Optional description" 
                      className="text-sm" 
                    />
                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeTask(task.id)} 
                    className="text-destructive shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/checklists')} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 gradient-primary text-white">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
