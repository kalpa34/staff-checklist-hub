import { ReactNode, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Menu,
  LayoutDashboard,
  Building2,
  ClipboardList,
  Users,
  Bell,
  BarChart3,
  LogOut,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: 'Departments', href: '/departments', icon: <Building2 className="w-5 h-5" />, adminOnly: true },
  { label: 'Checklists', href: '/checklists', icon: <ClipboardList className="w-5 h-5" /> },
  { label: 'Employees', href: '/employees', icon: <Users className="w-5 h-5" />, adminOnly: true },
  { label: 'Notifications', href: '/notifications', icon: <Bell className="w-5 h-5" /> },
  { label: 'Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" />, adminOnly: true },
  { label: 'Settings', href: '/settings', icon: <Settings className="w-5 h-5" /> },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const userInitials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  const NavContent = () => (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src="/favicon.png" alt="CheckList" className="w-10 h-10 rounded-xl" />
          <div className="flex flex-col">
            <span className="font-semibold text-sidebar-foreground">CheckList</span>
            <span className="text-xs text-sidebar-foreground/60">Restaurant Manager</span>
          </div>
        </Link>
      </div>

      {/* Nav Items */}
      <div className="flex-1 p-4 space-y-1 overflow-auto">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent'
              )}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-4 h-4 ml-auto" />
              )}
            </Link>
          );
        })}
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar className="w-9 h-9">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-sm">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.email}
            </p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">
              {isAdmin ? 'Administrator' : 'Employee'}
            </p>
          </div>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-sidebar flex-col fixed h-full z-30">
        <NavContent />
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border flex items-center justify-between px-4 z-40 safe-top">
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
            <NavContent />
          </SheetContent>
        </Sheet>

        <Link to="/dashboard" className="flex items-center gap-2">
          <img src="/favicon.png" alt="CheckList" className="w-8 h-8 rounded-lg" />
          <span className="font-semibold">CheckList</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-popover">
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
