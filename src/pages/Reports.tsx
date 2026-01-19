import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { BarChart3, Users, Building2, TrendingUp, Calendar } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

interface DepartmentStats {
  name: string;
  total: number;
  completed: number;
  rate: number;
}

interface EmployeeStats {
  name: string;
  email: string;
  completed: number;
  total: number;
  rate: number;
}

interface DailyStats {
  date: string;
  completions: number;
}

const COLORS = ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa'];

export default function Reports() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7');
  
  const [departmentStats, setDepartmentStats] = useState<DepartmentStats[]>([]);
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [totals, setTotals] = useState({ completions: 0, rate: 0, activeEmployees: 0 });

  useEffect(() => { 
    if (!loading && !user) navigate('/auth'); 
    if (!loading && user && !isAdmin) navigate('/dashboard');
  }, [user, loading, isAdmin, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchReportData();
    }
  }, [user, isAdmin, dateRange]);

  const fetchReportData = async () => {
    setIsLoading(true);
    const startDate = startOfDay(subDays(new Date(), parseInt(dateRange)));
    const endDate = endOfDay(new Date());

    try {
      // Fetch departments with checklist counts
      const { data: departments } = await supabase
        .from('departments')
        .select(`
          id,
          name,
          checklists (
            id,
            checklist_items (id)
          )
        `);

      // Fetch all completions in date range
      const { data: completions } = await supabase
        .from('task_completions')
        .select('*, checklist_items(checklist_id, checklists(department_id))')
        .gte('completed_at', startDate.toISOString())
        .lte('completed_at', endDate.toISOString());

      // Calculate department stats
      const deptStats: DepartmentStats[] = (departments || []).map(dept => {
        const deptChecklists = dept.checklists || [];
        const totalItems = deptChecklists.reduce((sum: number, cl: any) => sum + (cl.checklist_items?.length || 0), 0);
        const deptCompletions = (completions || []).filter((c: any) => 
          c.checklist_items?.checklists?.department_id === dept.id
        ).length;
        
        return {
          name: dept.name,
          total: totalItems,
          completed: deptCompletions,
          rate: totalItems > 0 ? Math.round((deptCompletions / totalItems) * 100) : 0
        };
      }).filter(d => d.total > 0);

      setDepartmentStats(deptStats);

      // Fetch employee stats
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, email');
      const { data: allItems } = await supabase.from('checklist_items').select('id');
      
      const empStats: EmployeeStats[] = [];
      const uniqueUsers = new Set<string>();
      
      for (const profile of (profiles || [])) {
        const userCompletions = (completions || []).filter(c => c.user_id === profile.user_id);
        if (userCompletions.length > 0) {
          uniqueUsers.add(profile.user_id);
          empStats.push({
            name: profile.full_name,
            email: profile.email,
            completed: userCompletions.length,
            total: allItems?.length || 0,
            rate: (allItems?.length || 0) > 0 ? Math.round((userCompletions.length / (allItems?.length || 1)) * 100) : 0
          });
        }
      }
      
      setEmployeeStats(empStats.sort((a, b) => b.completed - a.completed).slice(0, 10));

      // Calculate daily stats
      const days = parseInt(dateRange);
      const daily: DailyStats[] = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const day = subDays(new Date(), i);
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        
        const dayCompletions = (completions || []).filter(c => {
          const completedAt = new Date(c.completed_at);
          return completedAt >= dayStart && completedAt <= dayEnd;
        }).length;

        daily.push({
          date: format(day, 'MMM d'),
          completions: dayCompletions
        });
      }
      
      setDailyStats(daily);

      // Calculate totals
      const totalCompletions = (completions || []).length;
      const totalPossible = (allItems?.length || 0) * uniqueUsers.size;
      
      setTotals({
        completions: totalCompletions,
        rate: totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 100) : 0,
        activeEmployees: uniqueUsers.size
      });

    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setIsLoading(false);
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-primary" />
              Reports & Analytics
            </h1>
            <p className="text-muted-foreground">Track completion rates and employee performance</p>
          </div>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totals.completions}</p>
                  <p className="text-sm text-muted-foreground">Tasks Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-green-500/10">
                  <BarChart3 className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totals.rate}%</p>
                  <p className="text-sm text-muted-foreground">Completion Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10">
                  <Users className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totals.activeEmployees}</p>
                  <p className="text-sm text-muted-foreground">Active Employees</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Daily Completions Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Task Completions</CardTitle>
            <CardDescription>Number of tasks completed per day</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="completions" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No data available for this period
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Department Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Department Performance
              </CardTitle>
              <CardDescription>Completion rates by department</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={departmentStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis dataKey="name" type="category" width={100} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`${value}%`, 'Completion Rate']}
                    />
                    <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  No department data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Department Distribution Pie */}
          <Card>
            <CardHeader>
              <CardTitle>Completions by Department</CardTitle>
              <CardDescription>Distribution of completed tasks</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={departmentStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="completed"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {departmentStats.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Employees */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Top Performing Employees
            </CardTitle>
            <CardDescription>Employees with the most completed tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {employeeStats.length > 0 ? (
              <div className="space-y-4">
                {employeeStats.map((emp, index) => (
                  <div key={emp.email} className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{emp.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{emp.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{emp.completed}</p>
                      <p className="text-xs text-muted-foreground">tasks</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                No employee data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
