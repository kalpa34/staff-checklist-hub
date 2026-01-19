import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, UserPlus, Shield, Trash2, Loader2, Building2 } from 'lucide-react';

interface Employee {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'employee';
  departments: string[];
  created_at: string;
}

interface Department {
  id: string;
  name: string;
}

export default function Employees() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [selectedRole, setSelectedRole] = useState<'admin' | 'employee'>('employee');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
    if (!loading && user && !isAdmin) {
      navigate('/dashboard');
      toast.error('Access denied. Admin only.');
    }
  }, [user, loading, isAdmin, navigate]);

  const fetchData = async () => {
    try {
      // Fetch profiles with roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles for each user
      const employeesWithRoles = await Promise.all(
        (profiles || []).map(async (profile: any) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .maybeSingle();

          const { data: assignments } = await supabase
            .from('employee_assignments')
            .select('departments (name)')
            .eq('user_id', profile.user_id);

          return {
            id: profile.id,
            user_id: profile.user_id,
            email: profile.email,
            full_name: profile.full_name,
            role: (roleData?.role as 'admin' | 'employee') || 'employee',
            departments: assignments?.map((a: any) => a.departments?.name).filter(Boolean) || [],
            created_at: profile.created_at,
          };
        })
      );

      setEmployees(employeesWithRoles);

      // Fetch departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('id, name')
        .order('name');

      setDepartments(deptData || []);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load employees');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && isAdmin) {
      fetchData();
    }
  }, [user, isAdmin]);

  const handleOpenDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setSelectedRole(employee.role);
    setIsDialogOpen(true);
  };

  const handleUpdateRole = async () => {
    if (!selectedEmployee) return;

    setIsSubmitting(true);

    try {
      // Update role
      const { error } = await supabase
        .from('user_roles')
        .update({ role: selectedRole })
        .eq('user_id', selectedEmployee.user_id);

      if (error) throw error;

      toast.success('Role updated successfully');
      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(error.message || 'Failed to update role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignDepartment = async () => {
    if (!selectedEmployee || !selectedDepartment) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('employee_assignments')
        .insert({
          user_id: selectedEmployee.user_id,
          department_id: selectedDepartment,
          assigned_by: user?.id,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Employee already assigned to this department');
        } else {
          throw error;
        }
      } else {
        toast.success('Department assigned successfully');
        setSelectedDepartment('');
        fetchData();
      }
    } catch (error: any) {
      console.error('Error assigning department:', error);
      toast.error(error.message || 'Failed to assign department');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAssignment = async (departmentName: string) => {
    if (!selectedEmployee) return;

    const dept = departments.find((d) => d.name === departmentName);
    if (!dept) return;

    try {
      const { error } = await supabase
        .from('employee_assignments')
        .delete()
        .eq('user_id', selectedEmployee.user_id)
        .eq('department_id', dept.id);

      if (error) throw error;

      toast.success('Department removed');
      fetchData();
    } catch (error: any) {
      console.error('Error removing assignment:', error);
      toast.error(error.message || 'Failed to remove department');
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Employees</h1>
            <p className="text-muted-foreground mt-1">
              Manage employee roles and department assignments
            </p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <UserPlus className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Employees are created when users sign up. You can manage their roles and assign them
              to departments here.
            </p>
          </CardContent>
        </Card>

        {/* Employees List */}
        {employees.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No employees yet</h3>
              <p className="text-muted-foreground text-center">
                Employees will appear here when they sign up
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => (
              <Card key={emp.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{emp.full_name}</CardTitle>
                      <CardDescription>{emp.email}</CardDescription>
                    </div>
                    <Badge variant={emp.role === 'admin' ? 'default' : 'secondary'}>
                      {emp.role === 'admin' && <Shield className="w-3 h-3 mr-1" />}
                      {emp.role}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-2">Departments:</p>
                    <div className="flex flex-wrap gap-1">
                      {emp.departments.length === 0 ? (
                        <span className="text-sm text-muted-foreground italic">None assigned</span>
                      ) : (
                        emp.departments.map((dept) => (
                          <Badge key={dept} variant="outline" className="text-xs">
                            <Building2 className="w-3 h-3 mr-1" />
                            {dept}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDialog(emp)}
                    className="w-full"
                  >
                    Manage
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Manage Employee Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-card max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Employee</DialogTitle>
              <DialogDescription>
                Update role and department assignments for {selectedEmployee?.full_name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Role Section */}
              <div className="space-y-3">
                <Label>Role</Label>
                <Select
                  value={selectedRole}
                  onValueChange={(v) => setSelectedRole(v as 'admin' | 'employee')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleUpdateRole}
                  disabled={isSubmitting || selectedRole === selectedEmployee?.role}
                  size="sm"
                  className="w-full"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Update Role
                </Button>
              </div>

              {/* Departments Section */}
              <div className="space-y-3">
                <Label>Assign to Department</Label>
                <div className="flex gap-2">
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAssignDepartment}
                    disabled={isSubmitting || !selectedDepartment}
                    size="icon"
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Current Assignments */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Current assignments:</p>
                  {selectedEmployee?.departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No departments assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedEmployee?.departments.map((dept) => (
                        <Badge
                          key={dept}
                          variant="secondary"
                          className="flex items-center gap-1 pr-1"
                        >
                          {dept}
                          <button
                            onClick={() => handleRemoveAssignment(dept)}
                            className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
