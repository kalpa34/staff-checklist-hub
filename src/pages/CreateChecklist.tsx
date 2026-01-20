import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Loader2, Upload, Image as ImageIcon, FileSpreadsheet, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { checklistSchema, validateExcelTasks, MAX_EXCEL_TASKS } from '@/lib/validation';

interface Department { id: string; name: string; }
interface TaskItem { id: string; title: string; description: string; }

export default function CreateChecklist() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([{ id: '1', title: '', description: '' }]);
  const [createMode, setCreateMode] = useState<'manual' | 'excel' | 'image'>('manual');
  
  // File upload states
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);

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

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsParsingExcel(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<{ title?: string; Title?: string; task?: string; Task?: string; description?: string; Description?: string }>(sheet);

      // Map raw Excel data to task format
      const rawTasks = json.map((row) => ({
        title: (row.title || row.Title || row.task || row.Task || '').toString(),
        description: (row.description || row.Description || '').toString()
      }));

      // Validate with our validation library
      const { validTasks, errors } = validateExcelTasks(rawTasks);

      if (errors.length > 0) {
        errors.forEach(err => toast.error(err));
        setUploadedFile(null);
        return;
      }

      if (validTasks.length === 0) {
        toast.error('No valid tasks found in Excel file');
        setUploadedFile(null);
      } else {
        setTasks(validTasks);
        toast.success(`Imported ${validTasks.length} tasks from Excel`);
      }
    } catch (error) {
      console.error('Error parsing Excel:', error);
      toast.error('Failed to parse Excel file');
      setUploadedFile(null);
    } finally {
      setIsParsingExcel(false);
    }
  };

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
    const reader = new FileReader();
    reader.onload = (event) => setImagePreview(event.target?.result as string);
    reader.readAsDataURL(file);
    toast.success('Image uploaded');
  };

  const clearImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const clearExcel = () => {
    setUploadedFile(null);
    setTasks([{ id: '1', title: '', description: '' }]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate checklist details with Zod
    const validationResult = checklistSchema.safeParse({
      title,
      description: description || null,
      departmentId
    });

    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      toast.error(firstError.message);
      return;
    }
    
    const validTasks = tasks.filter(t => t.title.trim());
    if (createMode === 'manual' && validTasks.length === 0) { toast.error('Add at least one task'); return; }
    if (createMode === 'image' && !uploadedImage) { toast.error('Please upload an image'); return; }

    setIsSubmitting(true);
    try {
      let fileUrl: string | null = null;
      let fileType: string = createMode;

      // Upload image if present
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

      // Create checklist with validated data
      const { data: checklist, error } = await supabase.from('checklists')
        .insert({ 
          title: validationResult.data.title.trim(), 
          description: validationResult.data.description?.trim() || null, 
          department_id: validationResult.data.departmentId, 
          created_by: user?.id, 
          file_type: fileType,
          file_url: fileUrl
        })
        .select().single();
      if (error) throw error;

      // Insert tasks with validated/truncated values
      if (validTasks.length > 0) {
        const items = validTasks.map((t, i) => ({ 
          checklist_id: checklist.id, 
          title: t.title.trim().substring(0, 200), 
          description: t.description?.trim().substring(0, 500) || null, 
          sort_order: i 
        }));
        const { error: itemsError } = await supabase.from('checklist_items').insert(items);
        if (itemsError) throw itemsError;
      }

      // Get department name for notification
      const selectedDept = departments.find(d => d.id === departmentId);
      const departmentName = selectedDept?.name || 'Department';

      // Send SMS notifications to employees assigned to this department
      const { data: assignments } = await supabase
        .from('employee_assignments')
        .select('user_id')
        .eq('department_id', departmentId);

      if (assignments && assignments.length > 0) {
        // Get employee profiles with phone numbers
        const { data: employeeProfiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .in('user_id', assignments.map(a => a.user_id));

        // Send SMS to each employee with a phone number
        if (employeeProfiles) {
          for (const profile of employeeProfiles) {
            if (profile.phone) {
              try {
                await supabase.functions.invoke('send-notification', {
                  body: {
                    userId: profile.user_id,
                    userEmail: profile.email,
                    userPhone: profile.phone,
                    employeeName: profile.full_name,
                    departmentName: departmentName,
                    checklistTitle: title,
                    notificationType: 'checklist_assigned'
                  }
                });
                console.log(`SMS sent to ${profile.full_name}`);
              } catch (err) {
                console.error('Failed to send notification to employee:', err);
              }
            }
          }
        }

        // Create in-app notifications for employees
        const notifications = assignments.map((a) => ({
          user_id: a.user_id,
          title: 'New Checklist Assigned',
          message: `You have been assigned a new checklist: ${title}`,
          type: 'checklist_assigned',
          related_checklist_id: checklist.id,
        }));

        await supabase.from('notifications').insert(notifications);
      }

      toast.success('Checklist created!');
      navigate('/checklists');
    } catch (error: any) { 
      console.error('Error creating checklist:', error);
      if (error.message?.includes('policy')) {
        toast.error('You do not have permission for this action');
      } else {
        toast.error('Failed to create checklist');
      }
    } finally { 
      setIsSubmitting(false); 
    }
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

          <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="excel">Excel Import</TabsTrigger>
              <TabsTrigger value="image">Image</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div><CardTitle>Tasks</CardTitle><CardDescription>Add tasks manually</CardDescription></div>
                  <Button type="button" variant="outline" size="sm" onClick={addTask}><Plus className="w-4 h-4 mr-1" />Add</Button>
                </CardHeader>
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
            </TabsContent>

            <TabsContent value="excel" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" />Import from Excel</CardTitle>
                  <CardDescription>Upload an Excel file with columns: title, description</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
                  
                  {!uploadedFile ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                    >
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                      <p className="font-medium">Click to upload Excel file</p>
                      <p className="text-sm text-muted-foreground mt-1">.xlsx, .xls, or .csv</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="w-8 h-8 text-green-500" />
                        <div>
                          <p className="font-medium">{uploadedFile.name}</p>
                          <p className="text-sm text-muted-foreground">{tasks.length} tasks imported</p>
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={clearExcel}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {isParsingExcel && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      <span>Parsing Excel file...</span>
                    </div>
                  )}

                  {uploadedFile && tasks.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {tasks.map((task, i) => (
                        <div key={task.id} className="flex gap-3 p-2 border rounded text-sm">
                          <span className="text-muted-foreground">{i + 1}.</span>
                          <div className="flex-1">
                            <p className="font-medium">{task.title}</p>
                            {task.description && <p className="text-muted-foreground">{task.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="image" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ImageIcon className="w-5 h-5" />Upload Reference Image</CardTitle>
                  <CardDescription>Upload an image as a visual checklist reference</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input type="file" ref={imageInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                  
                  {!imagePreview ? (
                    <div 
                      onClick={() => imageInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                    >
                      <ImageIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                      <p className="font-medium">Click to upload image</p>
                      <p className="text-sm text-muted-foreground mt-1">JPG, PNG, or WebP (max 5MB)</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <img src={imagePreview} alt="Preview" className="w-full rounded-lg border border-border" />
                      <Button 
                        type="button" 
                        variant="destructive" 
                        size="icon" 
                        className="absolute top-2 right-2"
                        onClick={clearImage}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  <p className="text-sm text-muted-foreground">
                    You can also add manual tasks along with the image:
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={addTask}>
                    <Plus className="w-4 h-4 mr-1" />Add Task
                  </Button>
                  
                  {tasks.filter(t => t.title.trim()).length > 0 && (
                    <div className="space-y-2">
                      {tasks.map((task, i) => (
                        <div key={task.id} className="flex gap-3 p-3 border rounded-lg">
                          <span className="text-muted-foreground font-medium mt-2">{i + 1}.</span>
                          <div className="flex-1 space-y-2">
                            <Input value={task.title} onChange={e => updateTask(task.id, 'title', e.target.value)} placeholder="Task title" />
                          </div>
                          {tasks.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeTask(task.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

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
